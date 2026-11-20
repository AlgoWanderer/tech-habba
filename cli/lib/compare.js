// `slopstop compare <dirA> <dirB>`: scan two sets of apps (e.g. code generated from raw prompts vs
// from Prompt-Hardener prompts) and compare their findings. No suppressions are applied.
import { runScan } from '../../server/pipeline.js';
import { collectFiles, listApps } from './files.js';

const SEVERITIES = ['critical', 'high', 'medium', 'low'];
const CATEGORIES = ['secret', 'injection', 'auth', 'dependency', 'idor'];

export async function scanSet(core, dir) {
  const apps = [];
  for (const app of listApps(dir)) {
    const files = collectFiles([app.dir], app.dir);
    const { findings, score } = await runScan(core, files);
    const byCategory = Object.fromEntries(CATEGORIES.map((c) => [c, findings.filter((f) => f.category === c).length]));
    apps.push({ app: app.name, files: files.length, findings: findings.length, safety: score.safety, counts: score.counts, byCategory });
  }
  const sum = (pick) => apps.reduce((a, r) => a + pick(r), 0);
  return {
    dir,
    apps,
    summary: {
      apps: apps.length,
      findings: sum((r) => r.findings),
      counts: Object.fromEntries(SEVERITIES.map((s) => [s, sum((r) => r.counts[s])])),
      byCategory: Object.fromEntries(CATEGORIES.map((c) => [c, sum((r) => r.byCategory[c])])),
      meanSafety: apps.length ? Math.round((sum((r) => r.safety) / apps.length) * 10) / 10 : 100,
      appsWithCriticalOrHigh: apps.filter((r) => r.counts.critical + r.counts.high > 0).length,
    },
  };
}

export async function compare(core, dirA, dirB) {
  const a = await scanSet(core, dirA);
  const b = await scanSet(core, dirB);
  const names = [...new Set([...a.apps.map((r) => r.app), ...b.apps.map((r) => r.app)])].sort();
  const pairs = names.map((app) => {
    const x = a.apps.find((r) => r.app === app);
    const y = b.apps.find((r) => r.app === app);
    return { app, a: x ? { findings: x.findings, safety: x.safety } : null, b: y ? { findings: y.findings, safety: y.safety } : null };
  });
  return { a, b, pairs };
}

const pct = (from, to) => (from === 0 ? '-' : `${Math.round(((from - to) / from) * 100)}% fewer`);

export function formatCompare({ a, b, pairs }) {
  const A = a.summary;
  const B = b.summary;
  const row = (label, x, y, extra = '') => `  ${label.padEnd(26)}${String(x).padStart(8)}${String(y).padStart(8)}  ${extra}`;
  const lines = [
    `SlopStop compare: A = ${a.dir} (${A.apps} apps), B = ${b.dir} (${B.apps} apps)`,
    '',
    row('', 'A', 'B'),
    row('findings', A.findings, B.findings, pct(A.findings, B.findings)),
    row('critical + high', A.counts.critical + A.counts.high, B.counts.critical + B.counts.high, pct(A.counts.critical + A.counts.high, B.counts.critical + B.counts.high)),
    row('apps with critical/high', A.appsWithCriticalOrHigh, B.appsWithCriticalOrHigh),
    row('mean safety (0-100)', A.meanSafety, B.meanSafety),
    ...CATEGORIES.map((c) => row(`  ${c}`, A.byCategory[c], B.byCategory[c])),
    '',
    '  per app (findings / safety):',
    ...pairs.map((p) => `    ${p.app.padEnd(22)} A ${p.a ? `${p.a.findings} / ${p.a.safety}` : 'missing'}   B ${p.b ? `${p.b.findings} / ${p.b.safety}` : 'missing'}`),
  ];
  return lines.join('\n');
}
