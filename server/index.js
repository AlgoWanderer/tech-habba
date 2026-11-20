import './env.js';
import express from 'express';
import cors from 'cors';
import { pathToFileURL } from 'node:url';
import { loadCore, loadHardener } from './coreAdapter.js';
import { runFix, runScan } from './pipeline.js';
import { runExploit } from './exploit/sandbox.js';
import { loadBenchmark, loadExperiment, loadModelEval } from './benchmark.js';
import { getAiClient } from './ai/client.js';
import { FIX_MODES, SCAN_MODES, fixHybrid, scanWithMode } from './ai/hybrid.js';
import { httpTestEnabled } from './exploit/httpTest.js';

const MAX_FILES = 50;
const MAX_PROMPT = 20000;

function badRequest(message) {
  return Object.assign(new Error(message), { status: 400 });
}

function parseFiles(body) {
  const files = body?.files;
  if (!Array.isArray(files) || files.length === 0) throw badRequest('Body must include files: [{path, content}].');
  if (files.length > MAX_FILES) throw badRequest(`At most ${MAX_FILES} files per request.`);
  for (const f of files) {
    if (typeof f?.path !== 'string' || !f.path || typeof f?.content !== 'string') {
      throw badRequest('Each file must be {path: string, content: string}.');
    }
  }
  return files.map(({ path, content }) => ({ path, content }));
}

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);

function parseMode(body, allowed) {
  const mode = body?.mode ?? 'rules';
  if (!allowed.includes(mode)) throw badRequest(`mode must be one of: ${allowed.join(', ')}.`);
  return mode;
}

export async function createApp({ core, hardener, ai } = {}) {
  core ??= await loadCore();
  hardener ??= await loadHardener();
  if (ai === undefined) ai = getAiClient();
  const needAi = (mode) => {
    if (mode !== 'rules' && !ai) throw badRequest('AI not configured: add GEMINI_API_KEY to server/.env');
    if (mode !== 'rules' && core.isMock) throw badRequest('AI modes need the real core/ engine.');
  };

  const app = express();
  app.locals.mockCore = core.isMock;
  app.locals.mockHardener = hardener.isMock;
  app.locals.aiName = ai?.name ?? null;
  const origins = (process.env.CORS_ORIGIN ?? 'http://localhost:5173,http://127.0.0.1:5173').split(',');
  app.use(cors({ origin: origins }));
  app.use(express.json({ limit: '5mb' }));

  app.get('/api/health', (req, res) => res.json({ ok: true, mockCore: core.isMock, mockHardener: hardener.isMock, ai: Boolean(ai) && !core.isMock, aiModel: ai?.name ?? null }));

  // The API is a local-only dev tool (bound to 127.0.0.1) that processes code the user pastes in.
  // slopstop-ignore route-no-auth: local-only, see above
  app.post('/api/scan', wrap(async (req, res) => {
    const files = parseFiles(req.body);
    const mode = parseMode(req.body, SCAN_MODES);
    needAi(mode);
    res.json(mode === 'rules' ? await runScan(core, files) : await scanWithMode(core, files, mode, ai));
  }));

  // slopstop-ignore route-no-auth: local-only
  app.post('/api/fix', wrap(async (req, res) => {
    const files = parseFiles(req.body);
    const ids = req.body.findingIds;
    if (!Array.isArray(ids) || !ids.every((id) => typeof id === 'string')) throw badRequest('findingIds must be an array of strings.');
    const mode = parseMode(req.body, FIX_MODES);
    needAi(mode);
    // Two-mode HTTP test on every fix (attack blocked + legitimate user still works); body.httpTest:false skips it.
    const httpTest = httpTestEnabled() && req.body.httpTest !== false && !core.isMock;
    res.json(mode === 'rules' ? await runFix(core, files, ids, { httpTest }) : await fixHybrid(core, files, ids, ai, { aiFindings: req.body.aiFindings, httpTest }));
  }));

  // slopstop-ignore route-no-auth: local-only
  app.post('/api/exploit', wrap(async (req, res) => res.json(await runExploit())));

  // slopstop-ignore route-no-auth: local-only
  app.post('/api/harden-prompt', wrap(async (req, res) => {
    const prompt = req.body?.prompt;
    if (typeof prompt !== 'string' || !prompt.trim()) throw badRequest('Body must include prompt: string.');
    if (prompt.length > MAX_PROMPT) throw badRequest(`Prompt is longer than ${MAX_PROMPT} characters.`);
    res.json(await hardener.harden(prompt));
  }));

  // Not part of the frozen contract: an additive, read-only endpoint for the scorecard page.
  // slopstop-ignore route-no-auth: local-only, public benchmark numbers
  app.get('/api/benchmark', (req, res) => {
    const metric = loadBenchmark();
    if (!metric) return res.status(404).json({ error: 'No benchmark results yet (corpus/benchmark/results.json).' });
    res.json(metric);
  });

  // slopstop-ignore route-no-auth: local-only, public model comparison numbers
  app.get('/api/model-eval', (req, res) => {
    const r = loadModelEval();
    if (!r) return res.status(404).json({ error: 'No model evaluation yet (run node server/eval/models.js).' });
    res.json(r);
  });

  // slopstop-ignore route-no-auth: local-only, public experiment numbers
  app.get('/api/experiment', (req, res) => {
    const exp = loadExperiment();
    if (!exp) return res.status(404).json({ error: 'No experiment results yet (corpus/experiment/results.json).' });
    res.json(exp);
  });

  app.use((req, res) => res.status(404).json({ error: `No route ${req.method} ${req.path}` }));
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    const status = err.status ?? err.statusCode ?? 500;
    if (status >= 500) console.error(err);
    res.status(status).json({ error: status >= 500 ? 'Internal server error' : err.message });
  });
  return app;
}

const isMain = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (isMain) {
  const port = Number(process.env.PORT ?? 3001);
  const app = await createApp();
  const { mockCore, mockHardener } = app.locals;
  app.listen(port, '127.0.0.1', () => {
    console.log(`SlopStop API on http://localhost:${port}`);
    console.log(`core: ${mockCore ? 'MOCK (contract samples)' : 'real core/'} | prompt hardener: ${mockHardener ? 'MOCK' : 'real'}`);
    console.log(`AI: ${app.locals.aiName ?? 'off (add GEMINI_API_KEY to server/.env to enable ai/hybrid modes)'}`);
  });
}
