import { describe, it, expect } from 'vitest';
import { parseRange, stuckBelow, scanPackageJson } from '../scanner/advisories.js';
import { scan } from '../index.js';
import { rules } from './helpers.js';

const pkg = (deps) => JSON.stringify({ name: 'x', dependencies: deps }, null, 2);

describe('built-in advisory fallback (dep-vuln)', () => {
  it('flags exact vulnerable pins at the package.json line', () => {
    const [f] = scanPackageJson('package.json', pkg({ express: '^4.21.0', jsonwebtoken: '8.5.1' }));
    expect(f).toMatchObject({ id: 'dep-vuln:package.json:5', severity: 'high', fixable: 'review', snippet: '"jsonwebtoken": "8.5.1"', fixPreview: 'npm install jsonwebtoken@^9.0.0' });
  });

  it('picks the worst advisory and the highest fix version', () => {
    const [f] = scanPackageJson('package.json', pkg({ lodash: '4.17.10' }));
    expect(f.severity).toBe('critical');
    expect(f.fixPreview).toBe('npm install lodash@^4.17.21');
  });

  it('does not flag ranges that can resolve to a patched version', () => {
    expect(scanPackageJson('package.json', pkg({ express: '^4.18.2', mongoose: '^7.0.0', lodash: '~4.17.0', minimist: 'latest' }))).toEqual([]);
  });

  it('flags ranges stuck below a major-bump fix', () => {
    expect(scanPackageJson('package.json', pkg({ jsonwebtoken: '^8.5.1' }))).toHaveLength(1);
  });

  it('range helpers', () => {
    expect(parseRange('~1.2.3')).toEqual({ min: [1, 2, 3], upper: [1, 3, 0], exact: false });
    expect(parseRange('>=1.0.0')).toBeNull();
    expect(stuckBelow(parseRange('^0.21.1'), [0, 21, 2])).toBe(false);
  });

  it('flags nodemailer below 6.6.1', () => {
    const [f] = scanPackageJson('package.json', pkg({ nodemailer: '6.4.10' }));
    expect(f).toMatchObject({ severity: 'high', fixPreview: 'npm install nodemailer@^6.6.1' });
    expect(f.message).toContain('CVE-2020-7769');
    expect(f.message).toContain('CVE-2021-23400');
    expect(scanPackageJson('package.json', pkg({ nodemailer: '^6.4.10' }))).toEqual([]);
    expect(scanPackageJson('package.json', pkg({ nodemailer: '6.6.1' }))).toEqual([]);
  });

  it('npm audit output takes precedence over the built-in list', () => {
    const audit = JSON.stringify({ auditReportVersion: 2, vulnerabilities: {} });
    expect(scan([{ path: 'package.json', content: pkg({ jsonwebtoken: '8.5.1' }) }, { path: 'npm-audit.json', content: audit }])).toEqual([]);
  });
});

describe('false-positive regressions from the corpus', () => {
  it('/api/docs is public', () => {
    expect(rules("app.get('/api/docs', h); app.get('/api/v1/swagger', h);", 'route-no-auth')).toEqual([]);
  });

  it('Map.get(req.params.id) is not a DB lookup for IDOR', () => {
    expect(rules('app.get("/c/:cartId", (req, res) => res.json(carts.get(req.params.cartId)));', 'idor-suspect')).toEqual([]);
  });
});
