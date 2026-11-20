import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { makeFakeCore } from '../../server/test/fakeCore.js';
import { compare, formatCompare } from '../lib/compare.js';
import { collectFiles, listApps } from '../lib/files.js';

const root = mkdtempSync(path.join(os.tmpdir(), 'slopstop-cli-'));
afterAll(() => rmSync(root, { recursive: true, force: true }));

function write(rel, content) {
  const full = path.join(root, rel);
  mkdirSync(path.dirname(full), { recursive: true });
  writeFileSync(full, content);
}

write('raw/app01/index.js', 'const KEY = "sk_live_ABCDEF123456";\n');
write('raw/app01/node_modules/x/index.js', 'const KEY = "sk_live_ZZZZZZ123456";\n');
write('raw/app01/README.md', 'not scanned');
write('raw/app02/index.js', 'const KEY = "sk_live_ABCDEF123456";\nconst K2 = "sk_live_QWERTY123456";\n');
write('hardened/app01/index.js', 'const KEY = process.env.KEY;\n');
write('hardened/app02/index.js', 'const KEY = process.env.KEY;\n');

describe('files', () => {
  it('walks folders, skips node_modules and non-code, uses relative forward-slash paths', () => {
    const files = collectFiles([path.join(root, 'raw')], root);
    expect(files.map((f) => f.path)).toEqual(['raw/app01/index.js', 'raw/app02/index.js']);
  });

  it('treats each subfolder as an app, or the folder itself when it has none', () => {
    expect(listApps(path.join(root, 'raw')).map((a) => a.name)).toEqual(['app01', 'app02']);
    expect(listApps(path.join(root, 'raw', 'app01')).map((a) => a.name)).toEqual(['app01']);
  });
});

describe('compare', () => {
  it('scans both sets and pairs apps by name', async () => {
    const core = makeFakeCore();
    const r = await compare(core, path.join(root, 'raw'), path.join(root, 'hardened'));
    expect(r.a.summary.findings).toBeGreaterThan(r.b.summary.findings);
    expect(r.b.summary.findings).toBe(0);
    expect(r.pairs.map((p) => p.app)).toEqual(['app01', 'app02']);
    const text = formatCompare(r);
    expect(text).toContain('100% fewer');
    expect(text).toContain('app02');
  });
});
