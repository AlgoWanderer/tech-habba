import { describe, expect, it } from 'vitest';
import { loadCore } from '../coreAdapter.js';
import { createFakeClient, createGeminiClient, getAiClient } from '../ai/client.js';
import { aiDetect, toFindings } from '../ai/detect.js';
import { maskForModel } from '../ai/mask.js';
import { aiPatch, countRoutes, enclosingRange } from '../ai/patch.js';
import { parseEnv } from '../env.js';

const core = await loadCore({ forceMock: false });

const APP = [
  'import express from "express";', // 1
  'import mongoose from "mongoose";', // 2
  'const app = express();', // 3
  'const JWT_SECRET = "library-jwt-secret-do-not-share";', // 4 (a named secret; not a provider-shaped key)
  'const User = mongoose.model("User", new mongoose.Schema({ name: String }));', // 5
  'function requireAuth(req, res, next) {', // 6
  '  if (!req.headers.authorization) return res.status(401).json({ error: "no" });', // 7
  '  next();', // 8
  '}', // 9
  'app.get("/api/users", async (req, res) => {', // 10
  '  const users = await User.find({});', // 11
  '  res.json(users);', // 12
  '});', // 13
  'app.get("/api/page", (req, res) => {', // 14
  '  res.send("<h1>Hello " + req.query.name + "</h1>");', // 15
  '});', // 16
  'app.listen(3000);', // 17
].join('\n');
const FILES = [{ path: 'index.js', content: APP }];

describe('env', () => {
  it('parses KEY=value lines, quotes and comments', () => {
    expect(parseEnv('# c\nGEMINI_API_KEY="abc"\nexport X=1\nbad line\nY = two words')).toEqual({ GEMINI_API_KEY: 'abc', X: '1', Y: 'two words' });
  });
});

describe('gemini client', () => {
  it('sends the key only in a header, retries 429, and returns parsed JSON', async () => {
    const seen = [];
    let n = 0;
    const fetchImpl = async (url, init) => {
      seen.push({ url, init });
      if (++n === 1) return { ok: false, status: 429, json: async () => ({ error: { message: 'slow down' } }) };
      return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: '[{"a":1}]' }] } }] }) };
    };
    const c = createGeminiClient({ apiKey: 'test-key-123', fetchImpl, retries: 2 });
    expect(await c.generateJson('sys', 'user')).toEqual([{ a: 1 }]);
    expect(seen).toHaveLength(2);
    expect(seen[0].url).not.toContain('test-key-123');
    expect(seen[0].init.headers['x-goog-api-key']).toBe('test-key-123');
  });

  it('falls back to the next model when one is unavailable or overloaded, and records which answered', async () => {
    const urls = [];
    const fetchImpl = async (url) => {
      urls.push(url);
      if (url.includes('/busy:')) return { ok: false, status: 503, json: async () => ({ error: { message: 'high demand' } }) };
      if (url.includes('/gone:')) return { ok: false, status: 404, json: async () => ({ error: { message: 'not available' } }) };
      return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: '{"ok":true}' }] } }] }) };
    };
    const c = createGeminiClient({ apiKey: 'k', model: 'gone', fallbacks: ['busy', 'works'], retries: 0, fetchImpl });
    expect(await c.generateJson('s', 'u')).toEqual({ ok: true });
    expect(c.lastModel).toBe('works');
    expect(urls.map((u) => u.split('/models/')[1].split(':')[0])).toEqual(['gone', 'busy', 'works']);
    const bad = createGeminiClient({ apiKey: 'k', model: 'gone', fallbacks: [], retries: 0, fetchImpl });
    await expect(bad.generateJson('s', 'u')).rejects.toThrow(/404/);
  });

  it('never leaks the key in errors and is null without a key', async () => {
    const fetchImpl = async () => ({ ok: false, status: 400, json: async () => ({ error: { message: 'bad request' } }) });
    const c = createGeminiClient({ apiKey: 'test-key-123', fetchImpl });
    await expect(c.generateJson('s', 'u')).rejects.toThrow(/HTTP 400/);
    await c.generateJson('s', 'u').catch((e) => expect(e.message).not.toContain('test-key-123'));
    expect(getAiClient({})).toBeNull();
  });
});

describe('masking', () => {
  it('removes secret values but keeps line count', async () => {
    const { files, count } = await maskForModel(core, FILES);
    expect(files[0].content).not.toContain('library-jwt-secret-do-not-share');
    expect(files[0].content).toContain('<REDACTED_SECRET_');
    expect(files[0].content.split('\n')).toHaveLength(APP.split('\n').length);
    expect(count).toBeGreaterThan(0);
  });
});

describe('aiDetect', () => {
  it('validates model output and takes snippets from the real file', () => {
    const out = toFindings(
      [
        { file: 'index.js', line: 15, category: 'injection', severity: 'high', title: 'Reflected XSS', explanation: 'query in HTML', confidence: 0.9 },
        { file: 'index.js', line: 99, category: 'auth', severity: 'high', title: 'x', explanation: 'y', confidence: 0.9 },
        { file: 'other.js', line: 1, category: 'auth', severity: 'high', title: 'x', explanation: 'y', confidence: 0.9 },
        { file: 'index.js', line: 11, category: 'idor', severity: 'low', title: 'meh', explanation: 'unsure', confidence: 0.3 },
        { file: 'index.js', line: 12, category: 'xss', severity: 'high', title: 'bad cat', explanation: 'y', confidence: 0.9 },
        { file: 'index.js', line: 15, category: 'injection', severity: 'high', title: 'dup', explanation: 'dup', confidence: 0.8 },
      ],
      FILES,
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ id: 'ai-injection:index.js:15', ruleId: 'ai-reflected-xss', source: 'ai', fixable: 'review', confidence: 0.9, line: 15, endLine: 15 });
    expect(out[0].snippet).toBe('res.send("<h1>Hello " + req.query.name + "</h1>");');
  });

  it('sends only masked code, with line numbers', async () => {
    const client = createFakeClient(() => [{ file: 'index.js', line: 15, category: 'injection', severity: 'high', title: 'XSS', explanation: 'e', confidence: 0.8 }]);
    const out = await aiDetect(core, FILES, client);
    expect(out.map((f) => f.id)).toEqual(['ai-injection:index.js:15']);
    expect(client.calls).toBe(1);
    expect(client.sent[0].userText).not.toContain('library-jwt-secret-do-not-share');
    expect(client.sent[0].userText).toContain('  15| ');
  });
});

describe('aiPatch', () => {
  const authFinding = async () => (await core.scan(FILES)).find((f) => f.ruleId === 'route-no-auth' && f.line === 10);
  const route10 = (body) => `app.get("/api/users", ${body}async (req, res) => {\n  const users = await User.find({});\n  res.json(users);\n});`;

  it('targets the whole enclosing statement', () => {
    expect(enclosingRange(APP, 11)).toEqual({ start: 10, end: 13 });
    expect(countRoutes(APP)).toBe(2);
  });

  it('applies a good patch for a rule finding after node --check and re-scan', async () => {
    const f = await authFinding();
    const client = createFakeClient(() => ({ replacement: route10('requireAuth, '), explanation: 'added auth' }));
    const r = await aiPatch(core, FILES, f, client);
    expect(r.result).toMatchObject({ status: 'applied', source: 'ai', findingId: f.id });
    expect(r.patched.patched).toContain('app.get("/api/users", requireAuth, async');
    expect(client.sent[0].userText).not.toContain('library-jwt-secret-do-not-share');
  });

  it('rejects patches that break syntax, keep the flaw, delete a route or leak a placeholder', async () => {
    const f = await authFinding();
    const cases = [
      [{ replacement: 'app.get("/api/users", async (req, res) => {', explanation: '' }, /node --check failed/],
      [{ replacement: route10(''), explanation: 'noop' }, /changed nothing/],
      [{ replacement: route10('').replace('res.json(users)', 'res.json(users.slice(0, 10))'), explanation: '' }, /Re-scan still finds/],
      [{ replacement: '// removed', explanation: '' }, /deleted a route/],
      [{ replacement: route10('requireAuth, ').replace('{}', '{ key: "<REDACTED_SECRET_1>" }'), explanation: '' }, /masked secret/],
    ];
    for (const [reply, reason] of cases) {
      const r = await aiPatch(core, FILES, f, createFakeClient(() => reply));
      expect(r.result.status).toBe('rejected');
      expect(r.result.reason).toMatch(reason);
      expect(r.patched).toBeNull();
    }
  });

  it('for AI findings, requires an independent re-check to say it is fixed', async () => {
    const [xss] = toFindings([{ file: 'index.js', line: 15, category: 'injection', severity: 'high', title: 'XSS', explanation: 'query in HTML', confidence: 0.9 }], FILES);
    const fixed = 'app.get("/api/page", (req, res) => {\n  res.send("<h1>Hello " + String(req.query.name).replace(/[<>&"]/g, "") + "</h1>");\n});';
    const yes = createFakeClient((s) => (s.includes('check whether') ? { fixed: true, reason: 'escaped' } : { replacement: fixed, explanation: 'escape' }));
    const no = createFakeClient((s) => (s.includes('check whether') ? { fixed: false, reason: 'still raw' } : { replacement: fixed, explanation: 'escape' }));
    expect((await aiPatch(core, FILES, xss, yes)).result.status).toBe('applied');
    expect(yes.calls).toBe(2);
    const r = await aiPatch(core, FILES, xss, no);
    expect(r.result.status).toBe('rejected');
    expect(r.result.reason).toMatch(/re-check/);
  });

  it('rejects a patch that uses req.user / a field the app does not have (live-test regression)', async () => {
    const LIB = [
      'import express from "express";',
      'import mongoose from "mongoose";',
      'const app = express();',
      'const Loan = mongoose.model("Loan", new mongoose.Schema({ memberId: String, bookId: String, due: Date }));',
      'function verifyMember(req, res, next) {',
      '  if (!req.headers.authorization) return res.status(401).json({ error: "no" });',
      '  req.member = { id: req.headers.authorization };',
      '  next();',
      '}',
      'app.get("/api/loans/:id", verifyMember, async (req, res) => {',
      '  const loan = await Loan.findById(req.params.id);',
      '  res.json(loan);',
      '});',
    ].join('\n');
    const files = [{ path: 'index.js', content: LIB }];
    const idor = (await core.scan(files)).find((f) => f.ruleId === 'idor-suspect');
    expect(idor).toBeTruthy();
    const route = (filter) => `app.get("/api/loans/:id", verifyMember, async (req, res) => {\n  const loan = await Loan.findOne({ _id: req.params.id, ${filter} });\n  if (!loan) return res.status(404).json({ error: "not found" });\n  res.json(loan);\n});`;
    const wrong = await aiPatch(core, files, idor, createFakeClient(() => ({ replacement: route('userId: req.user.id'), explanation: '' })));
    expect(wrong.result.status).toBe('rejected');
    expect(wrong.result.reason).toMatch(/req\.user, which nothing in this file sets/);
    expect(wrong.result.reason).toMatch(/"userId", which is not a field/);
    const client = createFakeClient(() => ({ replacement: route('memberId: req.member.id'), explanation: '' }));
    await aiPatch(core, files, idor, client);
    expect(client.sent[0].userText).toContain('req.member');
    expect(client.sent[0].userText).toContain('Model Loan fields: _id, memberId, bookId, due');
  });

  it('turns a model error into a rejection, never a crash', async () => {
    const f = await authFinding();
    const r = await aiPatch(core, FILES, f, createFakeClient(() => { throw new Error('HTTP 429'); }));
    expect(r.result).toMatchObject({ status: 'rejected' });
    expect(r.result.reason).toMatch(/model error/);
  });
});
