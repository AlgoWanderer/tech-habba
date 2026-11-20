// SlopStop benchmark: runs the REAL pipeline (core/ engine + server/pipeline.js scan -> fix ->
// verify -> rescan) over every corpus app and scores it against ground-truth.json.
// It refuses to run on mock or stub data, so results.json can only ever hold real numbers.
//
//   node corpus/benchmark/run.js
import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { loadCore } from '../../server/coreAdapter.js';
import { runScan, runFix } from '../../server/pipeline.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const corpusDir = path.resolve(__dirname, '..');
const appsDir = path.join(corpusDir, 'apps');
const groundTruth = JSON.parse(fs.readFileSync(path.join(corpusDir, 'ground-truth.json'), 'utf-8'));

const core = await loadCore({ forceMock: false });
if (core.isMock) {
  console.error('core/index.js was not found. Run `npm install` at the repo root and pull dev. Refusing to benchmark mock data.');
  process.exit(1);
}

const HIGH = new Set(['critical', 'high']);
const LINE_TOLERANCE = 1; // a finding matches a ground-truth flaw: same category + file, line within ±1

function loadApp(name) {
  const dir = path.join(appsDir, name);
  return fs
    .readdirSync(dir)
    .filter((f) => /\.(c|m)?js$/.test(f) || f === 'package.json')
    .sort()
    .map((f) => ({ path: f, content: fs.readFileSync(path.join(dir, f), 'utf-8') }));
}

console.log(`Running SlopStop benchmark across ${groundTruth.apps.length} corpus apps (real core + pipeline)...`);

const timings = [];
const appResults = [];
const reviewFlawsList = [];
const missed = [];
const unmatchedFindings = [];
const rejections = [];
let totalGroundTruthFlaws = 0;
let detectedGroundTruthFlaws = 0;
let totalFindings = 0;
let matchedFindings = 0;
let findingsOnCleanApps = 0;
let totalCriticalHighBefore = 0;
let totalCriticalHighAfter = 0;
let fixesAttempted = 0;
let verifierRejections = 0;
const recallByCategory = {};

for (const app of groundTruth.apps) {
  const files = loadApp(app.app);
  const isClean = app.flaws.length === 0;

  const t0 = performance.now();
  const before = await runScan(core, files);
  const fix = await runFix(core, files, before.findings.map((f) => f.id));
  const durationMs = performance.now() - t0;
  timings.push(durationMs);

  // One-to-one matching of findings to ground-truth flaws.
  const used = new Set();
  for (const gt of app.flaws) {
    totalGroundTruthFlaws++;
    const cat = (recallByCategory[gt.category] ??= { flaws: 0, detected: 0 });
    cat.flaws++;
    const idx = before.findings.findIndex(
      (f, i) => !used.has(i) && f.category === gt.category && f.file === gt.file && Math.abs(f.line - gt.line) <= LINE_TOLERANCE,
    );
    if (idx >= 0) {
      used.add(idx);
      detectedGroundTruthFlaws++;
      cat.detected++;
    } else {
      missed.push({ app: app.app, ...gt });
    }
  }
  totalFindings += before.findings.length;
  matchedFindings += used.size;
  if (isClean) findingsOnCleanApps += before.findings.length;
  before.findings.forEach((f, i) => {
    if (!used.has(i)) unmatchedFindings.push({ app: app.app, findingId: f.id, severity: f.severity, cleanApp: isClean });
  });

  for (const r of fix.results) {
    if (r.status === 'review') reviewFlawsList.push({ app: app.app, findingId: r.findingId, reason: r.reason });
    if (r.status === 'applied' || r.status === 'rejected') fixesAttempted++;
    if (r.status === 'rejected') {
      verifierRejections++;
      rejections.push({ app: app.app, findingId: r.findingId, reason: r.reason });
    }
  }

  const critHighBefore = before.findings.filter((f) => HIGH.has(f.severity)).length;
  const critHighAfter = fix.rescan.findings.filter((f) => HIGH.has(f.severity)).length;
  totalCriticalHighBefore += critHighBefore;
  totalCriticalHighAfter += critHighAfter;

  appResults.push({
    app: app.app,
    isClean,
    before: { findingsCount: before.findings.length, safety: before.score.safety, counts: before.score.counts },
    after: { findingsCount: fix.rescan.findings.length, safety: fix.rescan.score.safety, counts: fix.rescan.score.counts },
    reductionPercent: critHighBefore === 0 ? 0 : Math.round(((critHighBefore - critHighAfter) / critHighBefore) * 100),
    durationMs: Math.round(durationMs * 100) / 100,
  });
}

const round = (n, d = 2) => Math.round(n * 10 ** d) / 10 ** d;
const sorted = [...timings].sort((a, b) => a - b);
const meanMs = sorted.reduce((a, b) => a + b, 0) / sorted.length;
const p95Ms = sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)];
const reduction = totalCriticalHighBefore === 0 ? 0 : ((totalCriticalHighBefore - totalCriticalHighAfter) / totalCriticalHighBefore) * 100;
const recall = totalGroundTruthFlaws === 0 ? 1 : detectedGroundTruthFlaws / totalGroundTruthFlaws;
const precision = totalFindings === 0 ? 1 : matchedFindings / totalFindings;
const cleanApps = groundTruth.apps.filter((a) => a.flaws.length === 0).length;

const benchmarkResults = {
  method: {
    engine: 'core/ (role A) via server/pipeline.js runScan + runFix (scan -> applyFixes -> verify -> rescan)',
    matching: `finding matches a ground-truth flaw if category and file are equal and line is within ±${LINE_TOLERANCE}; one-to-one`,
    precisionNote: 'precision counts every finding not in ground-truth.json as unmatched, including real flaws the corpus did not label',
    timing: 'per app: full scan + fix + verify + rescan of all its files',
    generatedAt: new Date().toISOString(),
  },
  summary: {
    totalApps: groundTruth.apps.length,
    cleanApps,
    flawedApps: groundTruth.apps.length - cleanApps,
    totalGroundTruthFlaws,
    detectedGroundTruthFlaws,
    recall: round(recall, 3),
    precision: round(precision, 3),
    totalFindings,
    unmatchedFindings: unmatchedFindings.length,
    falsePositivesOnCleanApps: findingsOnCleanApps,
    totalCriticalHighBefore,
    totalCriticalHighAfter,
    criticalHighReductionPercent: round(reduction, 1),
    meanDurationMsPerFile: round(meanMs),
    p95DurationMsPerFile: round(p95Ms),
    fixesAttempted,
    verifierRejections,
    rejectionRate: fixesAttempted === 0 ? 0 : round(verifierRejections / fixesAttempted, 3),
    flawsLeftAsReviewCount: reviewFlawsList.length,
  },
  recallByCategory,
  reviewFlaws: reviewFlawsList,
  missed,
  unmatchedFindings,
  rejections,
  perApp: appResults,
};

const benchJsonPath = path.join(corpusDir, 'benchmark', 'results.json');
fs.writeFileSync(benchJsonPath, JSON.stringify(benchmarkResults, null, 2) + '\n');

const s = benchmarkResults.summary;
console.log('Benchmark completed!');
console.log(`Recall: ${detectedGroundTruthFlaws}/${totalGroundTruthFlaws} | findings on clean apps: ${findingsOnCleanApps} | precision vs ground truth: ${Math.round(precision * 100)}%`);
console.log(`Critical/High: ${totalCriticalHighBefore} -> ${totalCriticalHighAfter} (${s.criticalHighReductionPercent}% fewer)`);
console.log(`Fixes: ${fixesAttempted} attempted, ${verifierRejections} rejected by the verifier, ${reviewFlawsList.length} left for human review`);
console.log(`Time per app: mean ${s.meanDurationMsPerFile} ms, p95 ${s.p95DurationMsPerFile} ms`);
