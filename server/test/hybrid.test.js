import { describe, expect, it } from 'vitest';
import { loadCore } from '../coreAdapter.js';
import { createFakeClient } from '../ai/client.js';
import { fixHybrid, mergeLocal, sanitizeAiFindings, scanWithMode } from '../ai/hybrid.js';
import { createApp } from '../index.js';

const core = await loadCore({ forceMock: false });

const APP = [
  'import express from "express";',
  'const app = express();',
  'const JWT_SECRET = "library-jwt-secret-do-not-share";',
  'function requireAuth(req, res, next) {',
  '  if (!req.headers.authorization) return res.status(401).json({ error: "no" });',
  '  next();',
  '}',
  'app.get("/api/page", (req, res) => {',
  '  res.send("<h1>Hello " + req.query.name + "</h1>");',
  '});',
  'app.listen(3000);',
].join('\n');
const FILES = [{ path: 'index.js', content: APP }];
const XSS = { file: 'index.js', line: 9, category: 'injection', severity: 'high', title: 'Reflected XSS', explanation: 'query string in HTML', confidence: 0.9 };
const SECRET_DUP = { file: 'index.js', line: 3, category: 'secret', severity: 'critical', title: 'Hard-coded JWT secret', explanation: 'dup of rule', confidence: 0.95 };
// The model sees the code AFTER the rule fixes, so a good patch keeps the requireAuth they added.
const FIXED_PAGE = 'app.get("/api/page", requireAuth, (req, res) => {\n  res.send("<h1>Hello " + String(req.query.name).replace(/[<>&"]/g, "") + "</h1>");\n});';
const REVERTING_PAGE = FIXED_PAGE.replace('requireAuth, ', '');

const fakeModel = (patch = FIXED_PAGE) =>
  createFakeClient((sys) => {
    if (sys.startsWith('You are a security reviewer')) return [XSS, SECRET_DUP];
    if (sys.startsWith('You check whether')) return { fixed: true, reason: 'escaped' };
    return { replacement: patch, explanation: 'escape the name' };
  });

describe('merge', () => {
  it('rule findings win over overlapping AI findings', () => {
    const merged = mergeLocal([{ id: 'r', file: 'a.js', line: 3, category: 'secret' }], [
      { id: 'ai-secret:a.js:4', file: 'a.js', line: 4, category: 'secret' },
      { id: 'ai-injection:a.js:9', file: 'a.js', line: 9, category: 'injection' },
    ]);
    expect(merged.map((f) => f.id)).toEqual(['r', 'ai-injection:a.js:9']);
    expect(merged[0].source).toBe('rule');
  });
});

describe('scan modes', () => {
  it('hybrid = rules + new AI findings; ai = model only', async () => {
    const hybrid = await scanWithMode(core, FILES, 'hybrid', fakeModel());
    expect(hybrid.findings.some((f) => f.id === 'ai-injection:index.js:9')).toBe(true);
    expect(hybrid.findings.some((f) => f.id === 'ai-secret:index.js:3')).toBe(false);
    expect(hybrid.findings.some((f) => f.source === 'rule' && f.category === 'secret')).toBe(true);
    const ai = await scanWithMode(core, FILES, 'ai', fakeModel());
    expect(ai.findings.every((f) => f.source === 'ai')).toBe(true);
  });
});

describe('fixHybrid', () => {
  it('applies rule fixes, then a verified AI patch for the AI finding', async () => {
    const client = fakeModel();
    const { findings } = await scanWithMode(core, FILES, 'hybrid', client);
    const ids = findings.map((f) => f.id);
    const out = await fixHybrid(core, FILES, ids, client, { aiFindings: findings.filter((f) => f.source === 'ai') });
    const xss = out.results.find((r) => r.findingId === 'ai-injection:index.js:9');
    expect(xss).toMatchObject({ status: 'applied', source: 'ai' });
    expect(out.results.find((r) => r.source === 'rule' && r.status === 'applied')).toBeTruthy();
    const patched = out.patched.find((p) => p.path === 'index.js').patched;
    expect(patched).toContain('process.env.JWT_SECRET');
    expect(patched).toContain('String(req.query.name).replace');
    expect(out.rescan.findings.some((f) => f.id.startsWith('ai-'))).toBe(false);
  });

  it('rejects an AI patch that undoes a rule fix (drops the requireAuth just added)', async () => {
    const client = fakeModel(REVERTING_PAGE);
    const { findings } = await scanWithMode(core, FILES, 'hybrid', client);
    const out = await fixHybrid(core, FILES, findings.map((f) => f.id), client, { aiFindings: findings.filter((f) => f.source === 'ai') });
    const xss = out.results.find((r) => r.findingId === 'ai-injection:index.js:9');
    expect(xss.status).toBe('rejected');
    expect(xss.reason).toMatch(/introduced new critical\/high/);
    expect(out.patched.find((p) => p.path === 'index.js').patched).toContain('requireAuth, (req, res)');
  });

  it('rejects AI ids it was not given, and never trusts client snippets that are not in the code', async () => {
    expect(sanitizeAiFindings([{ id: 'ai-injection:index.js:9', file: 'index.js', line: 9, category: 'injection', snippet: 'not in the file' }], FILES)).toEqual([]);
    const out = await fixHybrid(core, FILES, ['ai-injection:index.js:9'], fakeModel(), {});
    expect(out.results[0]).toMatchObject({ status: 'rejected', source: 'ai' });
  });
});

describe('API', () => {
  const post = async (app, url, body) => {
    const server = app.listen(0);
    try {
      const port = server.address().port;
      const r = await fetch(`http://127.0.0.1:${port}${url}`, { method: url.startsWith('/api/health') ? 'GET' : 'POST', headers: { 'content-type': 'application/json' }, body: url.startsWith('/api/health') ? undefined : JSON.stringify(body) });
      return { status: r.status, body: await r.json() };
    } finally {
      server.close();
    }
  };

  it('ai/hybrid modes need a key; bad modes are 400', async () => {
    const app = await createApp({ core, ai: null });
    expect((await post(app, '/api/scan', { files: FILES, mode: 'hybrid' })).body.error).toMatch(/AI not configured/);
    expect((await post(app, '/api/scan', { files: FILES, mode: 'nope' })).status).toBe(400);
    expect((await post(app, '/api/health')).body.ai).toBe(false);
    expect((await post(app, '/api/scan', { files: FILES })).status).toBe(200);
  });

  it('hybrid scan and fix work end to end with a model', async () => {
    const app = await createApp({ core, ai: fakeModel() });
    expect((await post(app, '/api/health')).body.ai).toBe(true);
    const scan = await post(app, '/api/scan', { files: FILES, mode: 'hybrid' });
    expect(scan.body.findings.some((f) => f.source === 'ai')).toBe(true);
    const ids = scan.body.findings.map((f) => f.id);
    const fix = await post(app, '/api/fix', { files: FILES, findingIds: ids, mode: 'hybrid', aiFindings: scan.body.findings.filter((f) => f.source === 'ai') });
    expect(fix.status).toBe(200);
    expect(fix.body.results.some((r) => r.source === 'ai' && r.status === 'applied')).toBe(true);
  });
});
