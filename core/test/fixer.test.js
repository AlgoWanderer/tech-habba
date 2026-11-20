import { describe, it, expect } from 'vitest';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { scan, applyFixes } from '../index.js';

const fixture = readFileSync(new URL('./fixtures/vuln-app.js', import.meta.url), 'utf8');
const lines = (s) => s.split('\n').length;
const fixAll = (files) => applyFixes(files, scan(files));
const merge = (files, out) => {
  const m = new Map(files.map((f) => [f.path, f.content]));
  for (const p of out.patched) m.set(p.path, p.patched);
  return [...m].map(([p, content]) => ({ path: p, content }));
};

function nodeCheck(code, esm) {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'slopstop-core-'));
  try {
    const file = path.join(dir, esm ? 'f.mjs' : 'f.cjs');
    writeFileSync(file, code);
    return spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' }).status;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('applyFixes', () => {
  it('reproduces contract/sample-fix.json for its sample file', () => {
    const sample = JSON.parse(readFileSync(new URL('../../contract/sample-fix.json', import.meta.url), 'utf8'));
    const { path: p, original, patched } = sample.patched[0];
    const out = fixAll([{ path: p, content: original }]);
    expect(out.patched[0]).toEqual({ path: p, original, patched });
    expect(out.envFile).toMatch(/^STRIPE_KEY=.+\nMONGODB_URI=.+\n$/);
  });

  it('fixes the vulnerable fixture: valid JS, same line count, only review findings left', () => {
    const files = [{ path: 'index.js', content: fixture }];
    const out = fixAll(files);
    const main = out.patched.find((p) => p.path === 'index.js');
    expect(lines(main.patched)).toBe(lines(fixture));
    for (const p of out.patched.filter((x) => x.path.endsWith('.js'))) expect(nodeCheck(p.patched, false)).toBe(0);
    const left = scan(merge(files, out));
    expect(left.every((f) => f.fixable === 'review')).toBe(true);
    expect(left.map((f) => f.ruleId)).toEqual(['idor-suspect']);
    expect(out.results.filter((r) => r.status === 'applied')).toHaveLength(11);
    expect(out.results.find((r) => r.findingId === 'idor-suspect:index.js:18').status).toBe('review');
  });

  it('emits middleware that verifies with the same secret the app signs with', () => {
    const out = fixAll([{ path: 'index.js', content: fixture }]);
    const mw = out.patched.find((p) => p.path === 'middleware/requireAuth.js');
    expect(mw.original).toBe('');
    expect(mw.patched).toContain("require('jsonwebtoken')");
    expect(mw.patched).toContain('jwt.verify(token, process.env.JWT_SECRET_2)');
    expect(scan([{ path: mw.path, content: mw.patched }])).toEqual([]);
    expect(out.patched.find((p) => p.path === '.env.example').patched).toBe('STRIPE_KEY=\nMONGODB_URI=\nJWT_SECRET=\nJWT_SECRET_2=\n');
  });

  it('is idempotent', () => {
    const files = [{ path: 'index.js', content: fixture }];
    const once = merge(files, fixAll(files));
    const twice = fixAll(once);
    expect(twice.patched).toEqual([]);
    expect(twice.envFile).toBe('');
  });

  it('ESM: import goes on an existing line; token middleware without jsonwebtoken', () => {
    const code = "import express from 'express';\nconst app = express();\napp.post('/api/items', (req, res) => res.json({}));\n";
    const files = [{ path: 'src/routes/items.js', content: code }, { path: 'src/server.js', content: 'export {};\n' }];
    const out = fixAll(files);
    const p = out.patched.find((x) => x.path === 'src/routes/items.js').patched;
    expect(p.split('\n')[0]).toBe("import express from 'express'; import requireAuth from '../middleware/requireAuth.js';");
    expect(lines(p)).toBe(lines(code));
    expect(nodeCheck(p, true)).toBe(0);
    const mw = out.patched.find((x) => x.path === 'src/middleware/requireAuth.js').patched;
    expect(mw).toContain('export default requireAuth;');
    expect(mw).toContain('process.env.API_TOKEN');
    expect(nodeCheck(mw, true)).toBe(0);
    expect(out.envFile).toBe('API_TOKEN=\n');
  });

  it('reuses an existing requireAuth.js and an existing binding', () => {
    const files = [
      { path: 'middleware/requireAuth.js', content: 'module.exports = (req, res, next) => next();\n' },
      { path: 'routes/a.js', content: "const requireAuth = require('../middleware/requireAuth');\nrouter.get('/api/a', h);\n" },
    ];
    const out = fixAll(files);
    expect(out.patched.map((p) => p.path)).toEqual(['routes/a.js']);
    expect(out.patched[0].patched).toBe("const requireAuth = require('../middleware/requireAuth');\nrouter.get('/api/a', requireAuth, h);\n");
  });

  it('keeps line numbers when a multi-line secret is removed', () => {
    const code = 'const privateKey = `-----BEGIN PRIVATE KEY-----\nMIIEv\n-----END PRIVATE KEY-----`;\nfoo();\n';
    const out = fixAll([{ path: 'k.js', content: code }]);
    expect(lines(out.patched[0].patched)).toBe(lines(code));
    expect(nodeCheck(out.patched[0].patched, false)).toBe(0);
    expect(out.envFile).toBe('PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\\nMIIEv\\n-----END PRIVATE KEY-----"\n');
  });

  it('reuses one env name for a repeated secret value', () => {
    const code = 'const a = { apiKey: "sk_live_EXAMPLEEXAMPLE1234" };\nconst b = { apiKey: "sk_live_EXAMPLEEXAMPLE1234" };\n';
    expect(fixAll([{ path: 'x.js', content: code }]).envFile).toBe('API_KEY=sk_live_EXAMPLEEXAMPLE1234\n');
  });

  it('accepts string ids; unknown ids are rejected, review findings are review', () => {
    const files = [{ path: 'index.js', content: fixture }];
    const out = applyFixes(files, ['nope:index.js:1', 'idor-suspect:index.js:18', 'secret-hardcoded:index.js:5']);
    expect(out.results.map((r) => r.status)).toEqual(['rejected', 'review', 'applied']);
    expect(out.patched.map((p) => p.path)).toEqual(['index.js', '.env.example']);
    for (const r of out.results) expect(typeof r.reason).toBe('string');
  });
});
