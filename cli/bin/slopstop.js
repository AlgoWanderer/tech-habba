#!/usr/bin/env node
// Usage:
//   slopstop scan --staged [--fix]     scan staged files (what the pre-commit hook runs)
//   slopstop scan <file...> [--fix]    scan files on disk
// --fix prints proposed, verified patches. It never writes to your files.
// Exit code 1 when critical/high findings exist (blocks the commit), 2 on usage errors.
import { existsSync, readFileSync } from 'node:fs';
import { loadCore } from '../../server/coreAdapter.js';
import { runFix } from '../../server/pipeline.js';
import { stagedFiles } from '../lib/git.js';
import { BLOCKING, lineDiff, summarize } from '../lib/report.js';

const args = process.argv.slice(2);
const [cmd, ...rest] = args;
const flags = new Set(rest.filter((a) => a.startsWith('--')));
const paths = rest.filter((a) => !a.startsWith('--'));

if (cmd !== 'scan' || (!flags.has('--staged') && !paths.length)) {
  console.error('Usage: slopstop scan --staged [--fix]  |  slopstop scan <file...> [--fix]');
  process.exit(2);
}
if (process.env.SLOPSTOP_SKIP === '1') {
  console.log('SlopStop: skipped (SLOPSTOP_SKIP=1).');
  process.exit(0);
}

const core = await loadCore();
if (core.isMock) {
  // Never block a commit on mock data. The real engine lives in core/ (role A).
  console.warn('SlopStop: core/ engine not installed yet; scan skipped, commit allowed.');
  process.exit(0);
}

let files;
if (flags.has('--staged')) {
  files = stagedFiles();
} else {
  const missing = paths.filter((p) => !existsSync(p));
  if (missing.length) {
    console.error(`SlopStop: file(s) not found: ${missing.join(', ')}`);
    process.exit(2);
  }
  files = paths.map((p) => ({ path: p.replace(/\\/g, '/'), content: readFileSync(p, 'utf8') }));
}

if (!files.length) {
  console.log('SlopStop: no JS/TS files to scan.');
  process.exit(0);
}

const findings = await core.scan(files);
console.log(summarize(findings, files.length));

if (flags.has('--fix')) {
  const auto = findings.filter((f) => f.fixable === 'auto').map((f) => f.id);
  if (auto.length) {
    const out = await runFix(core, files, auto);
    console.log('\nProposed patches (verified with node --check and a re-scan; NOT written to disk):');
    for (const p of out.patched) console.log(`\n--- ${p.path}\n${lineDiff(p.original, p.patched)}`);
    for (const r of out.results.filter((x) => x.status !== 'applied')) console.log(`\n  ${r.status.toUpperCase()}  ${r.findingId}: ${r.reason}`);
    if (out.envFile) console.log(`\nAdd these to your .env (fill in the values yourself):\n${out.envFile}`);
    console.log(`\nAfter these patches: safety ${out.rescan.score.safety}/100.`);
  } else {
    console.log('\nNothing is auto-fixable; the remaining findings need human review.');
  }
}

const blocking = findings.filter((f) => BLOCKING.has(f.severity));
if (blocking.length) {
  console.log(`\nCommit blocked: ${blocking.length} critical/high finding(s).`);
  console.log('See proposed fixes:  npx slopstop scan --staged --fix');
  console.log('Bypass (not recommended):  git commit --no-verify');
  process.exit(1);
}
