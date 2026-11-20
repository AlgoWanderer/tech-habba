import { describe, it, expect } from 'vitest';
import { rules } from './helpers.js';

const auth = (c) => rules(c, 'route-no-auth');

describe('route-no-auth', () => {
  it('flags unprotected routes with an insert-requireAuth preview', () => {
    const [f] = auth('app.get("/api/users", async (req, res) => {\n  res.json([]);\n});');
    expect(f).toMatchObject({
      severity: 'high',
      fixable: 'auto',
      line: 1,
      endLine: 3,
      fixPreview: 'app.get("/api/users", requireAuth, async (req, res) => {',
    });
  });

  it('skips public paths', () => {
    const paths = ['/', '/health', '/api/auth/login', '/register', '/webhooks/stripe', '*', '/static/x'];
    expect(auth(paths.map((p) => `app.get('${p}', (q, s) => s.end());`).join('\n'))).toEqual([]);
  });

  it('skips routes with auth middleware, router.use(auth) before them, or inline 401', () => {
    const code = [
      "router.get('/a', requireAuth, h);",
      "router.post('/b', passport.authenticate('jwt'), h);",
      "app.get('/c', (req, res) => { if (!req.user) return res.status(401).end(); });",
      'api.use(verifyToken);',
      "api.delete('/d', h);",
      "admin.use('/admin', isAdmin);",
      "admin.get('/admin/stats', h);",
    ].join('\n');
    expect(auth(code)).toEqual([]);
  });

  it('router.use(auth) only covers later routes on the same router', () => {
    const code = "r.get('/early', h);\nr.use(protect);\nother.get('/x', h);\nr.get('/late', h);";
    expect(auth(code).map((f) => f.line)).toEqual([1, 3]);
  });

  it('ignores non-route .get calls', () => {
    expect(auth("app.get('env'); map.get('/x'); axios.get('/api/x', { headers });")).toEqual([]);
  });
});
