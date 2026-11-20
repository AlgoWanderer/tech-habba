#!/usr/bin/env node
// Installs the SlopStop git pre-commit hook in the current repository.
//   npx slopstop-init            install (refuses to overwrite someone else's hook)
//   npx slopstop-init --force    install, backing up an existing hook to pre-commit.slopstop-backup
//   npx slopstop-init --remove   remove the SlopStop hook
import { chmodSync, existsSync, readFileSync, renameSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { git } from '../lib/git.js';

const MARKER = '# slopstop pre-commit hook';
const flags = new Set(process.argv.slice(2));
const slash = (p) => p.replace(/\\/g, '/');

let hooksDir;
try {
  hooksDir = path.resolve(git(['rev-parse', '--git-path', 'hooks']).trim());
} catch {
  console.error('slopstop-init: not inside a git repository.');
  process.exit(2);
}
const hook = path.join(hooksDir, 'pre-commit');
const existing = existsSync(hook) ? readFileSync(hook, 'utf8') : null;
const ours = existing?.includes(MARKER);

if (flags.has('--remove')) {
  if (ours) { rmSync(hook); console.log(`Removed SlopStop hook from ${hook}`); }
  else console.log('No SlopStop hook installed.');
  process.exit(0);
}

if (existing && !ours) {
  if (!flags.has('--force')) {
    console.error(`slopstop-init: ${hook} already exists and is not a SlopStop hook. Re-run with --force to back it up and replace it.`);
    process.exit(1);
  }
  renameSync(hook, `${hook}.slopstop-backup`);
  console.log(`Backed up existing hook to ${hook}.slopstop-backup`);
}

const cliEntry = slash(fileURLToPath(new URL('./slopstop.js', import.meta.url)));
const node = slash(process.execPath);
const script = `#!/bin/sh
${MARKER}
# Scans staged JS/TS files and blocks the commit on critical/high findings.
# Skip once with: git commit --no-verify   (or SLOPSTOP_SKIP=1)
"${node}" "${cliEntry}" scan --staged
`;
mkdirSync(hooksDir, { recursive: true });
writeFileSync(hook, script);
try { chmodSync(hook, 0o755); } catch { /* Windows: git for Windows runs hooks via sh regardless */ }
console.log(`SlopStop pre-commit hook installed at ${hook}`);
