import { execFileSync } from 'node:child_process';

const SCANNABLE = /\.(?:c|m)?[jt]sx?$/i;

export function git(args, opts = {}) {
  return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, ...opts });
}

/** Staged (index) versions of added/copied/modified/renamed JS/TS files. */
export function stagedFiles() {
  const names = git(['diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z']).split('\0').filter(Boolean);
  return names.filter((n) => SCANNABLE.test(n)).map((path) => ({ path, content: git(['show', `:${path}`]) }));
}
