// Plain-text output for terminals and git hooks (no colours: hook output is often not a TTY).
const ORDER = ['critical', 'high', 'medium', 'low'];
export const BLOCKING = new Set(['critical', 'high']);

export function summarize(findings, fileCount) {
  const counts = Object.fromEntries(ORDER.map((s) => [s, 0]));
  for (const f of findings) counts[f.severity] += 1;
  const parts = ORDER.filter((s) => counts[s]).map((s) => `${counts[s]} ${s}`);
  const head = findings.length
    ? `SlopStop: ${findings.length} finding(s) in ${fileCount} file(s) (${parts.join(', ')})`
    : `SlopStop: no findings in ${fileCount} file(s).`;

  const rows = [...findings]
    .sort((a, b) => ORDER.indexOf(a.severity) - ORDER.indexOf(b.severity) || a.file.localeCompare(b.file) || a.line - b.line)
    .map((f) => `  ${f.severity.toUpperCase().padEnd(8)}  ${`${f.file}:${f.line}`.padEnd(28)}  ${f.message}${f.fixable === 'auto' ? '  [auto-fixable]' : '  [needs review]'}`);
  return [head, ...rows].join('\n');
}

/** Minimal line diff (LCS) so `--fix` can print proposed patches without a dependency. */
export function lineDiff(a, b, context = 2) {
  const x = a.split('\n');
  const y = b.split('\n');
  if (x.length * y.length > 4_000_000) return '  (file too large to diff)';
  const dp = Array.from({ length: x.length + 1 }, () => new Uint32Array(y.length + 1));
  for (let i = x.length - 1; i >= 0; i--) {
    for (let j = y.length - 1; j >= 0; j--) dp[i][j] = x[i] === y[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  }
  const ops = [];
  let i = 0;
  let j = 0;
  while (i < x.length || j < y.length) {
    if (i < x.length && j < y.length && x[i] === y[j]) { ops.push([' ', x[i], i + 1]); i++; j++; }
    else if (j < y.length && (i >= x.length || dp[i][j + 1] > dp[i + 1][j])) { ops.push(['+', y[j], i + 1]); j++; }
    else { ops.push(['-', x[i], i + 1]); i++; }
  }
  const keep = new Set();
  ops.forEach((op, k) => { if (op[0] !== ' ') for (let d = -context; d <= context; d++) keep.add(k + d); });
  const out = [];
  let last = -2;
  ops.forEach((op, k) => {
    if (!keep.has(k)) return;
    if (k !== last + 1) out.push(`  @@ line ${op[2]} @@`);
    out.push(`  ${op[0]} ${op[1]}`);
    last = k;
  });
  return out.join('\n');
}
