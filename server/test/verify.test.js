import { describe, expect, it } from 'vitest';
import { checkSyntax, verify } from '../verify.js';
import { makeFakeCore } from './fakeCore.js';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const core = makeFakeCore();

describe('checkSyntax', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'slopstop-test-'));
  it('accepts valid CommonJS and ESM', () => {
    expect(checkSyntax('const a = require("x");\nmodule.exports = a;', dir).ok).toBe(true);
    expect(checkSyntax('import x from "x";\nexport default x;', dir).ok).toBe(true);
  });
  it('rejects broken code and names the original file, not the temp file', () => {
    const r = checkSyntax('const a = (;', dir, 'routes/user.js');
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/SyntaxError/);
    expect(r.error).not.toMatch(/check-/);
  });
  it('cleans up', () => rmSync(dir, { recursive: true, force: true }));
});

describe('verify', () => {
  const original = 'const KEY = "sk_live_ABCDEF123456";\n';
  const target = { id: 'secret-hardcoded:a.js:1', ruleId: 'secret-hardcoded', category: 'secret', severity: 'critical', file: 'a.js', line: 1, endLine: 1, snippet: 'const KEY = "sk_live_ABCDEF123456";', message: '', fixable: 'auto' };

  it('accepts a correct patch', async () => {
    const [r] = await verify([{ path: 'a.js', original, patched: 'const KEY = process.env.STRIPE_KEY;\n' }], { scan: core.scan, originalFindings: [target], targets: [target] });
    expect(r).toMatchObject({ accepted: true, syntax: 'ok', remaining: [], introduced: [] });
  });

  it('rejects a patch that breaks syntax', async () => {
    const [r] = await verify([{ path: 'a.js', original, patched: 'const KEY = process.env.;\n' }], { scan: core.scan, targets: [target] });
    expect(r.accepted).toBe(false);
    expect(r.reason).toMatch(/node --check failed/);
  });

  it('rejects a patch that leaves the finding in place', async () => {
    const [r] = await verify([{ path: 'a.js', original, patched: original }], { scan: core.scan, originalFindings: [target], targets: [target] });
    expect(r.accepted).toBe(false);
    expect(r.remaining).toEqual([target.id]);
  });

  it('rejects a patch that introduces a new critical finding', async () => {
    const patched = 'const KEY = process.env.STRIPE_KEY;\nconst OTHER = "sk_live_NEWLEAK999";\n';
    const [r] = await verify([{ path: 'a.js', original, patched }], { scan: core.scan, originalFindings: [target], targets: [target] });
    expect(r.accepted).toBe(false);
    expect(r.reason).toMatch(/introduced/);
  });

  it('skips the syntax check for non-JS files', async () => {
    const [r] = await verify([{ path: '.env.example', original: '', patched: 'STRIPE_KEY=\n' }]);
    expect(r).toMatchObject({ accepted: true, syntax: 'skipped' });
  });
});
