// Real baselines for the SlopStop benchmark. Every number here comes from running a real tool:
//   - Semgrep (registry rulesets for JS/Express/Node + secrets), detection only
//   - Gitleaks (dir scan), detection only
//   - LLM-only fixer: scores files a real model returned, saved by hand in llm-output/<app>.js
//     (prompt below). Apps without a saved output are skipped, never simulated.
//
//   node corpus/baselines/run-all.js
//
// Matching is deliberately generous to the baselines: a tool finding counts for a ground-truth
// flaw if it is in the same file within Â±1 line, whatever category the tool gives it.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { loadCore } from '../../server/coreAdapter.js';
import { runScan } from '../../server/pipeline.js';
import { checkSyntax } from '../../server/verify.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const corpusDir = path.resolve(__dirname, '..');
const appsDir = path.join(corpusDir, 'apps');
const llmDir = path.join(__dirname, 'llm-output');
const groundTruth = JSON.parse(fs.readFileSync(path.join(corpusDir, 'ground-truth.json'), 'utf-8'));
const LINE_TOLERANCE = 1;
const HIGH = new Set(['critical', 'high']);

export const LLM_SYSTEM_PROMPT =
  'You are an automated code fixing assistant. You are given a Node.js/Express file with potential security vulnerabilities. Return ONLY the complete corrected file. Do not wrap in markdown or add explanations.';

const SEMGREP_CONFIGS = ['p/javascript', 'p/expressjs', 'p/nodejsscan', 'p/secrets'];
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'slopstop-baselines-'));

function toolVersion(bin, args) {
  const r = spawnSync(bin, args, { encoding: 'utf-8' });
  return r.status === 0 ? r.stdout.trim().split('\n')[0] : null;
}

// Normalise a tool's path to "<app>/<file>".
function relKey(p) {
  const rel = path.relative(appsDir, path.resolve(p)).split(path.sep);
  return { app: rel[0], file: rel.slice(1).join('/') };
}

// Score a list of {app, file, line, rule} hits against ground truth.
function score(hits) {
  const byApp = new Map();
  for (const h of hits) (byApp.get(h.app) ?? byApp.set(h.app, []).get(h.app)).push(h);
  const recallByCategory = {};
  let total = 0;
  let detected = 0;
  let onClean = 0;
  const missed = [];
  for (const app of groundTruth.apps) {
    const appHits = byApp.get(app.app) ?? [];
    if (app.flaws.length === 0) onClean += appHits.length;
    const used = new Set();
    for (const gt of app.flaws) {
      total++;
      const cat = (recallByCategory[gt.category] ??= { flaws: 0, detected: 0 });
      cat.flaws++;
      const idx = appHits.findIndex((h, i) => !used.has(i) && h.file === gt.file && Math.abs(h.line - gt.line) <= LINE_TOLERANCE);
      if (idx >= 0) {
        used.add(idx);
        detected++;
        cat.detected++;
      } else missed.push({ app: app.app, ...gt });
    }
  }
  return {
    totalGroundTruthFlaws: total,
    detectedGroundTruthFlaws: detected,
    recall: Math.round((detected / total) * 1000) / 1000,
    totalFindings: hits.length,
    findingsOnCleanApps: onClean,
    recallByCategory,
    missedCount: missed.length,
    fixes: 'none (detection only)',
  };
}

function runSemgrep() {
  const version = toolVersion('semgrep', ['--version']);
  if (!version) return { status: 'not run', reason: 'semgrep not on PATH (pip install semgrep)' };
  const out = path.join(tmp, 'semgrep.json');
  const args = ['scan', '--metrics=off', '-q', '--json', '-o', out, ...SEMGREP_CONFIGS.flatMap((c) => ['--config', c]), appsDir];
  const t0 = performance.now();
  spawnSync('semgrep', args, { stdio: 'ignore' });
  const ms = performance.now() - t0;
  const raw = JSON.parse(fs.readFileSync(out, 'utf-8'));
  const hits = raw.results.map((r) => ({ ...relKey(r.path), line: r.start.line, rule: r.check_id }));
  return {
    status: 'run',
    version,
    configs: SEMGREP_CONFIGS,
    durationMsWholeCorpus: Math.round(ms),
    errors: raw.errors.length,
    ...score(hits),
    rulesHit: [...new Set(hits.map((h) => h.rule.split('.').pop()))].sort(),
  };
}

function runGitleaks() {
  const version = toolVersion('gitleaks', ['version']);
  if (!version) return { status: 'not run', reason: 'gitleaks not on PATH (winget install Gitleaks.Gitleaks)' };
  const out = path.join(tmp, 'gitleaks.json');
  const t0 = performance.now();
  spawnSync('gitleaks', ['dir', appsDir, '-f', 'json', '-r', out, '--no-banner', '--exit-code', '0', '-l', 'error'], { stdio: 'ignore' });
  const ms = performance.now() - t0;
  const raw = JSON.parse(fs.readFileSync(out, 'utf-8'));
  const hits = raw.map((r) => ({ ...relKey(r.File), line: r.StartLine, rule: r.RuleID }));
  const s = score(hits);
  const secrets = s.recallByCategory.secret ?? { flaws: 0, detected: 0 };
  return {
    status: 'run',
    version,
    durationMsWholeCorpus: Math.round(ms),
    ...s,
    secretRecall: `${secrets.detected}/${secrets.flaws}`,
    note: 'Gitleaks only looks for secrets. Its 0 here is mostly a corpus artifact: planted keys are deliberately fake-format strings (e.g. sk_test_mock_fake_...) that do not match real provider key formats. Do not cite it as Gitleaks missing real secrets.',
    rulesHit: [...new Set(hits.map((h) => h.rule))].sort(),
  };
}

function routeCount(code) {
  return (code.match(/\b(app|router)\.(get|post|put|delete|patch)\s*\(/g) || []).length;
}

function stripFences(text) {
  const m = text.match(/```[a-z]*\n([\s\S]*?)```/i);
  return m ? m[1] : text;
}

async function runLlm() {
  const base = { promptTemplate: LLM_SYSTEM_PROMPT, outputsDir: 'corpus/baselines/llm-output/<app>.js' };
  const saved = fs.existsSync(llmDir) ? fs.readdirSync(llmDir).filter((f) => /^app\d+\.js$/.test(f)).sort() : [];
  if (saved.length === 0) return { status: 'not run', reason: 'no saved model outputs in llm-output/', ...base };

  const core = await loadCore({ forceMock: false });
  if (core.isMock) return { status: 'not run', reason: 'core/ not found, cannot rescan outputs', ...base };

  const model = fs.existsSync(path.join(llmDir, 'MODEL.txt')) ? fs.readFileSync(path.join(llmDir, 'MODEL.txt'), 'utf-8').trim() : 'unrecorded';
  const perApp = [];
  for (const f of saved) {
    const app = f.replace(/\.js$/, '');
    const original = fs.readFileSync(path.join(appsDir, app, 'index.js'), 'utf-8');
    const fixed = stripFences(fs.readFileSync(path.join(llmDir, f), 'utf-8'));
    const syntax = checkSyntax(fixed, tmp, `${app}-llm`);
    const before = await runScan(core, [{ path: 'index.js', content: original }]);
    const after = await runScan(core, [{ path: 'index.js', content: fixed }]);
    const ch = (s) => s.findings.filter((x) => HIGH.has(x.severity)).length;
    perApp.push({
      app,
      syntaxPass: syntax.ok,
      routesBefore: routeCount(original),
      routesAfter: routeCount(fixed),
      routesDeleted: Math.max(0, routeCount(original) - routeCount(fixed)),
      criticalHighBefore: ch(before),
      criticalHighAfter: ch(after),
      linesBefore: original.split('\n').length,
      linesAfter: fixed.split('\n').length,
    });
  }
  const sum = (k) => perApp.reduce((a, r) => a + r[k], 0);
  const chBefore = sum('criticalHighBefore');
  const chAfter = sum('criticalHighAfter');
  return {
    status: 'run',
    model,
    ...base,
    appsEvaluated: perApp.length,
    appsPassingSyntax: perApp.filter((r) => r.syntaxPass).length,
    appsWithRouteDeletion: perApp.filter((r) => r.routesDeleted > 0).length,
    criticalHighBefore: chBefore,
    criticalHighAfter: chAfter,
    criticalHighReductionPercent: chBefore === 0 ? 0 : Math.round(((chBefore - chAfter) / chBefore) * 1000) / 10,
    note: 'criticalHigh counts come from the SlopStop scanner rescanning the model output; nothing verifies the model output before it would ship.',
    perApp,
  };
}

const results = {
  method: {
    matching: `a tool finding counts for a ground-truth flaw if same file and line within Â±${LINE_TOLERANCE}, any category; one-to-one`,
    generatedAt: new Date().toISOString(),
  },
  semgrep: runSemgrep(),
  gitleaks: runGitleaks(),
  llmFixer: await runLlm(),
};
fs.rmSync(tmp, { recursive: true, force: true });

fs.writeFileSync(path.join(__dirname, 'results.json'), JSON.stringify(results, null, 2) + '\n');
for (const [name, r] of Object.entries(results)) {
  if (name === 'method') continue;
  if (r.status !== 'run') console.log(`${name}: ${r.status} (${r.reason})`);
  else if (name === 'llmFixer') console.log(`llm (${r.model}): ${r.appsPassingSyntax}/${r.appsEvaluated} pass syntax, ${r.appsWithRouteDeletion} deleted routes, critical/high ${r.criticalHighBefore} -> ${r.criticalHighAfter}`);
  else console.log(`${name} ${r.version}: ${r.detectedGroundTruthFlaws}/${r.totalGroundTruthFlaws} flaws, ${r.findingsOnCleanApps} on clean apps, ${r.durationMsWholeCorpus} ms`);
}
