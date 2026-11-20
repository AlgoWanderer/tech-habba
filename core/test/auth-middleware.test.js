// Same-file auth middleware must be recognised, so the fixer never stacks requireAuth on top of it.
import { describe, it, expect } from 'vitest';
import { rules } from './helpers.js';
import { scan, applyFixes } from '../index.js';

const auth = (c) => rules(c, 'route-no-auth');

const CHECK_LOGIN = [
  "const express = require('express');",
  'const app = express();',
  'function checkLogin(req, res, next) {',
  '  if (!req.session.user) return res.status(401).json({ error: "login required" });',
  '  next();',
  '}',
  "app.get('/api/orders', checkLogin, (req, res) => res.json([]));",
  "app.delete('/api/orders/:id', checkLogin, (req, res) => res.sendStatus(204));",
  '',
].join('\n');

describe('route-no-auth: same-file auth middleware', () => {
  it('recognises checkLogin-style names', () => {
    expect(auth("app.get('/a', checkLogin, h); app.get('/b', isLoggedIn, h); app.get('/c', mustLogIn, h);")).toEqual([]);
  });

  it('recognises any same-file middleware that sends 401/403 and calls next()', () => {
    const code = [
      'const gate = (req, res, nxt) => { if (!req.user) { res.statusCode = 403; return res.end(); } nxt(); };',
      'app.get("/api/a", gate, h);',
      'app.get("/api/b", (req, res, next) => (req.user ? next() : res.sendStatus(401)), h);',
      'router.use(gate);',
      'router.get("/api/c", h);',
    ].join('\n');
    expect(auth(code)).toEqual([]);
  });

  it('does not treat a 401-sending handler without next(), or a rate limiter, as middleware auth', () => {
    const code = [
      'function loginLimiter(req, res, next) { if (tooMany(req)) return res.status(429).end(); next(); }',
      'function logRequest(req, res, next) { console.log(req.url); next(); }',
      'app.get("/api/a", loginLimiter, h);',
      'app.get("/api/b", logRequest, h);',
    ].join('\n');
    expect(auth(code).map((f) => f.line)).toEqual([3, 4]);
  });

  it('still matches the acl word boundary (regression: literal backspace chars in the regex)', () => {
    expect(auth("app.get('/a', acl, h);")).toEqual([]);
    expect(auth("app.get('/a', oracle, h);")).toHaveLength(1);
  });

  it('fix-all leaves checkLogin routes untouched (no stacked requireAuth)', () => {
    const files = [{ path: 'index.js', content: CHECK_LOGIN }];
    expect(scan(files).filter((f) => f.ruleId === 'route-no-auth')).toEqual([]);
    const out = applyFixes(files, scan(files));
    expect(out.patched.find((p) => p.path === 'index.js')?.patched ?? CHECK_LOGIN).not.toContain('requireAuth');
  });
});
