#!/usr/bin/env node
// Usage:
//   slopstop scan --staged [--fix]            scan staged files (what the pre-commit hook runs)
//   slopstop scan <file|dir...> [--fix]       scan files/folders on disk (skips node_modules, dist, .git)
//   slopstop compare <dirA> <dirB>            compare two sets of apps (each subfolder = one app)
// --fix prints proposed, verified patches. It never writes to your files.
// --json prints machine-readable output instead of text.
// --ai adds the AI reviewer (hybrid mode; needs GEMINI_API_KEY in server/.env). AI findings are
// marked [AI 82%] and are never auto-fixed by --fix (that stays rules-only and verified).
// Suppressions: .slopstopignore paths and `// slopstop-ignore <ruleId>: reason` comments (see lib/ignore.js).
// --no-ignore reports everything.
// Exit code 1 when critical/high findings exist (blocks the commit), 2 on usage errors.
import '../../server/env.js';
import { existsSync, statSync } from 'node:fs';
import { loadCore } from '../../server/coreAdapter.js';
import { getAiClient } from '../../server/ai/client.js';
import { scanWithMode } from '../../server/ai/hybrid.js';
import { runFix } from '../../server/pipeline.js';
import { compare, formatCompare } from '../lib/compare.js';
import { collectFiles } from '../lib/files.js';
import { stagedFiles } from '../lib/git.js';
import { applyIgnores, loadIgnoreFile } from '../lib/ignore.js';
import { BLOCKING, lineDiff, summarize } from '../lib/report.js';

const USAGE = 'Usage: slopstop scan --staged [--fix] [--json]  |  slopstop scan <file|dir...> [--fix] [--json]  |  slopstop compare <dirA> <dirB> [--json]';
const [cmd, ...rest] = process.argv.slice(2);
const flags = new Set(rest.filter((a) => a.startsWith('--')));
const paths = rest.filter((a) => !a.startsWith('--'));
const json = flags.has('--json');

function usage(msg) {
  if (msg) console.error(`SlopStop: ${msg}`);
  console.error(USAGE);
  process.exit(2);
}

if (cmd === 'scan' && !flags.has('--staged') && !paths.length) usage();
if (cmd === 'compare' && paths.length !== 2) usage('compare needs exactly two folders.');
if (cmd !== 'scan' && cmd !== 'compare') usage();
const missing = paths.filter((p) => !existsSync(p));
if (missing.length) usage(`not found: ${missing.join(', ')}`);

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

if (cmd === 'compare') {
  if (!paths.every((p) => statSync(p).isDirectory())) usage('compare takes folders.');
  const result = await compare(core, paths[0], paths[1]);
  console.log(json ? JSON.stringify(result, null, 2) : formatCompare(result));
  process.exit(0);
}

const files = flags.has('--staged') ? stagedFiles() : collectFiles(paths);
if (!files.length) {
  console.log(json ? JSON.stringify({ files: 0, findings: [], suppressed: [] }) : 'SlopStop: no JS/TS files to scan.');
  process.exit(0);
}

let raw = await core.scan(files);
if (flags.has('--ai')) {
  const client = getAiClient();
  if (!client) console.warn('SlopStop: --ai needs GEMINI_API_KEY in server/.env; using rules only.');
  else {
    try {
      raw = (await scanWithMode(core, files, 'hybrid', client)).findings;
    } catch (e) {
      console.warn(`SlopStop: AI review failed (${e.message}); using rules only.`);
    }
  }
}
const { kept: findings, suppressed } = flags.has('--no-ignore') ? { kept: raw, suppressed: [] } : applyIgnores(raw, files, loadIgnoreFile());
const auto = findings.filter((f) => f.fixable === 'auto').map((f) => f.id);
const fix = flags.has('--fix') && auto.length ? await runFix(core, files, auto) : null;
const blocking = findings.filter((f) => BLOCKING.has(f.severity));

if (json) {
  const out = { files: files.length, score: await core.computeScore(findings), findings, suppressed };
  if (fix) out.fix = fix;
  console.log(JSON.stringify(out, null, 2));
  process.exit(blocking.length ? 1 : 0);
}

console.log(summarize(findings, files.length));
if (suppressed.length) {
  console.log(`\n  ${suppressed.length} suppressed (not blocking):`);
  for (const f of suppressed) console.log(`    ${f.severity.toUpperCase().padEnd(8)}  ${f.file}:${f.line}  ${f.ruleId}  [${f.suppressedBy}]`);
}

if (fix) {
  console.log('\nProposed patches (verified with node --check and a re-scan; NOT written to disk):');
  for (const p of fix.patched) console.log(`\n--- ${p.path}\n${lineDiff(p.original, p.patched)}`);
  for (const r of fix.results.filter((x) => x.status !== 'applied')) console.log(`\n  ${r.status.toUpperCase()}  ${r.findingId}: ${r.reason}`);
  if (fix.envFile) console.log(`\nAdd these to your .env (fill in the values yourself):\n${fix.envFile}`);
  console.log(`\nAfter these patches: safety ${fix.rescan.score.safety}/100.`);
} else if (flags.has('--fix')) {
  console.log('\nNothing is auto-fixable; the remaining findings need human review.');
}

if (blocking.length) {
  console.log(`\nCommit blocked: ${blocking.length} critical/high finding(s).`);
  console.log('See proposed fixes:  npx slopstop scan --staged --fix');
  console.log('Bypass (not recommended):  git commit --no-verify');
  process.exit(1);
}
