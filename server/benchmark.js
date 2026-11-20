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

  const fixesApplied = num(s.fixesAttempted) !== undefined && num(s.verifierRejections) !== undefined ? s.fixesAttempted - s.verifierRejections : undefined;
  const metric = {
    totalApps: num(s.totalApps),
    totalVulnerabilities: num(s.totalGroundTruthFlaws),
    baselineVulnerabilities: num(s.totalCriticalHighBefore),
    slopstopVulnerabilities: num(s.totalCriticalHighAfter),
    msPerFile: num(s.meanDurationMsPerFile),
    rejectionRate: num(s.rejectionRate),
    failureAnalysis: failureAnalysis.length ? failureAnalysis : undefined,
    // Additive fields (not in the original BenchmarkMetric type):
    detectedVulnerabilities: num(s.detectedGroundTruthFlaws),
    cleanApps: num(s.cleanApps),
    falsePositivesOnCleanApps: num(s.falsePositivesOnCleanApps),
    fixesApplied, // verified patches applied across ALL findings, not planted flaws fixed
    plantedFlawsFixed: num(s.fixedGroundTruthFlaws), // planted flaws whose finding got an applied patch
  };
  for (const k of Object.keys(metric)) if (metric[k] === undefined) delete metric[k];
  return Object.keys(metric).length ? metric : null;
}

/**
 * Tool comparison rows from corpus/baselines/results.json, only for tools that actually ran.
 * Gitleaks is left out: the corpus keys are fake-format, so its 0 is not a fair comparison.
 * Row: {tool, detected, total, fixed, plantedFixed, findingsOnCleanApps}
 *   fixed        = verified patches applied (all findings)
 *   plantedFixed = planted flaws auto-fixed (out of `total`)
 */
export function toComparison(metric, baselines) {
  const rows = [];
  if (metric?.detectedVulnerabilities !== undefined && metric.totalVulnerabilities !== undefined) {
    rows.push({
      tool: 'SlopStop',
      detected: metric.detectedVulnerabilities,
      total: metric.totalVulnerabilities,
      fixed: metric.fixesApplied,
      plantedFixed: metric.plantedFlawsFixed,
      findingsOnCleanApps: metric.falsePositivesOnCleanApps,
    });
    for (const k of Object.keys(rows[0])) if (rows[0][k] === undefined) delete rows[0][k];
  }
  const sg = baselines?.semgrep;
  if (sg?.status === 'run' && num(sg.detectedGroundTruthFlaws) !== undefined) {
    rows.push({
      tool: `Semgrep ${sg.version ?? ''}`.trim(),
      detected: sg.detectedGroundTruthFlaws,
      total: sg.totalGroundTruthFlaws,
      fixed: 0,
      plantedFixed: 0,
      findingsOnCleanApps: num(sg.findingsOnCleanApps),
    });
  }
  return rows.length > 1 ? rows : undefined;
}

const readJson = (file) => {
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
};

export const BASELINES_PATH = path.resolve(here, '../corpus/baselines/results.json');
export const EXPERIMENT_PATH = path.resolve(here, '../corpus/experiment/results.json');

/** GET /api/experiment: role C's three-way experiment, without the bulky per-app rows. Null if missing. */
export function loadExperiment(file = EXPERIMENT_PATH) {
  const r = readJson(file);
  if (!r || typeof r !== 'object' || !r.summary) return null;
  const { perApp, ...rest } = r;
  return rest;
}

export function loadBenchmark(file = RESULTS_PATH, baselinesFile = BASELINES_PATH) {
  const metric = toBenchmarkMetric(readJson(file));
  if (!metric) return null;
  const comparison = toComparison(metric, readJson(baselinesFile));
  return comparison ? { ...metric, comparison } : metric;
}
