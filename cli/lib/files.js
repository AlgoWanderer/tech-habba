import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

export const SCANNABLE = /\.(?:c|m)?[jt]sx?$/i;
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'coverage', '.next']);

function walk(dir, out) {
  for (const name of readdirSync(dir).sort()) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) {
      if (!SKIP_DIRS.has(name)) walk(full, out);
    } else if (SCANNABLE.test(name) || name === 'package.json') out.push(full);
  }
}

/**
 * Expand files and directories into [{path, content}].
 * Explicit files are kept whatever their extension; directories contribute JS/TS files and package.json.
 * Paths are relative to `base` (default: cwd) with forward slashes.
 */
export function collectFiles(inputs, base = process.cwd()) {
  const found = [];
  for (const p of inputs) {
    if (statSync(p).isDirectory()) walk(p, found);
    else found.push(p);
  }
  const seen = new Set();
  return found
    .map((f) => path.relative(base, path.resolve(f)).split(path.sep).join('/'))
    .filter((rel) => !seen.has(rel) && seen.add(rel))
    .map((rel) => ({ path: rel, content: readFileSync(path.resolve(base, rel), 'utf8') }));
}

/** Immediate subdirectories of `dir` (one app each); if there are none, `dir` itself is the only app. */
export function listApps(dir) {
  const subs = readdirSync(dir)
    .filter((n) => !SKIP_DIRS.has(n) && statSync(path.join(dir, n)).isDirectory())
    .sort();
  return subs.length ? subs.map((n) => ({ name: n, dir: path.join(dir, n) })) : [{ name: path.basename(path.resolve(dir)), dir }];
}
