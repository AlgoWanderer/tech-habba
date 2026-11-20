// Regression against role C's corpus (corpus/ground-truth.json). Skips until corpus/ is present.
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { scan, applyFixes } from '../index.js';

const root = fileURLToPath(new URL('../../corpus/', import.meta.url));
const gtPath = `${root}ground-truth.json`;
const present = existsSync(gtPath) && existsSync(`${root}apps`);

function load(app) {
  const dir = `${root}apps/${app}`;
  return readdirSync(dir).map((p) => ({ path: p, content: readFileSync(`${dir}/${p}`, 'utf8') }));
}

describe.skipIf(!present)('corpus ground truth', () => {
  const gt = present ? JSON.parse(readFileSync(gtPath, 'utf8')) : { apps: [] };
  const key = (f) => `${f.category}:${f.file}:${f.line}`;

  it('finds every ground-truth flaw (recall 100%)', () => {
    const missed = [];
    for (const { app, flaws } of gt.apps) {
      const got = new Set(scan(load(app)).map(key));
      for (const f of flaws) if (!got.has(key(f))) missed.push(`${app} ${key(f)}`);
    }
    expect(missed).toEqual([]);
  });

  it('reports nothing on apps with no ground-truth flaws', () => {
    const noisy = gt.apps.filter((a) => a.flaws.length === 0).flatMap((a) => scan(load(a.app)).map((f) => `${a.app} ${f.id}`));
    expect(noisy).toEqual([]);
  });

  it('fix-all leaves only review findings and is idempotent', () => {
    for (const { app } of gt.apps) {
      const files = load(app);
      const out = applyFixes(files, scan(files));
      const merged = new Map(files.map((f) => [f.path, f.content]));
      for (const p of out.patched) merged.set(p.path, p.patched);
      const after = [...merged].map(([path, content]) => ({ path, content }));
      const left = scan(after);
      expect(left.filter((f) => f.fixable === 'auto').map((f) => `${app} ${f.id}`)).toEqual([]);
      expect(applyFixes(after, left).patched).toEqual([]);
    }
  });
});
