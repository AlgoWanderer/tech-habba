// GET /api/benchmark: serves role C's corpus/benchmark/results.json in the shape the dashboard
// scorecard (role D, web/src/types.ts BenchmarkMetric) expects. Only real numbers are passed
// through; anything missing is omitted so the dashboard shows "not measured". Never invents data.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const RESULTS_PATH = path.resolve(here, '../corpus/benchmark/results.json');

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);

/** Maps C's results.json to D's BenchmarkMetric. Returns null if there is nothing usable. */
export function toBenchmarkMetric(results) {
  const s = results?.summary;
  if (!s || typeof s !== 'object') return null;

  const groups = new Map();
  for (const r of Array.isArray(results.reviewFlaws) ? results.reviewFlaws : []) {
    const ruleId = String(r.findingId ?? '').split(':')[0] || 'unknown';
    const category = ruleId.startsWith('idor') ? 'idor' : ruleId;
    const g = groups.get(category) ?? { category, reason: r.reason ?? '', count: 0 };
    g.count += 1;
    groups.set(category, g);
  }
  // IDOR first, as agreed for the failure analysis.
  const failureAnalysis = [...groups.values()].sort((a, b) => (a.category === 'idor' ? -1 : b.category === 'idor' ? 1 : b.count - a.count));

  const metric = {
    totalApps: num(s.totalApps),
    totalVulnerabilities: num(s.totalGroundTruthFlaws),
    baselineVulnerabilities: num(s.totalCriticalHighBefore),
    slopstopVulnerabilities: num(s.totalCriticalHighAfter),
    msPerFile: num(s.meanDurationMsPerFile),
    rejectionRate: num(s.rejectionRate),
    failureAnalysis: failureAnalysis.length ? failureAnalysis : undefined,
  };
  for (const k of Object.keys(metric)) if (metric[k] === undefined) delete metric[k];
  return Object.keys(metric).length ? metric : null;
}

export function loadBenchmark(file = RESULTS_PATH) {
  if (!existsSync(file)) return null;
  try {
    return toBenchmarkMetric(JSON.parse(readFileSync(file, 'utf8')));
  } catch {
    return null;
  }
}
