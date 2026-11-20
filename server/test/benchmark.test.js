import { describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadBenchmark, toBenchmarkMetric } from '../benchmark.js';

const RESULTS = {
  summary: {
    totalApps: 30,
    totalGroundTruthFlaws: 56,
    totalCriticalHighBefore: 65,
    totalCriticalHighAfter: 9,
    meanDurationMsPerFile: 177.4,
    rejectionRate: 0,
  },
  reviewFlaws: [
    { app: 'app01', findingId: 'nosql-injection:index.js:9', reason: 'String-built $where needs review.' },
    { app: 'app02', findingId: 'idor-suspect:index.js:29', reason: 'Ownership checks need review.' },
    { app: 'app04', findingId: 'idor-suspect:index.js:28', reason: 'Ownership checks need review.' },
  ],
};

describe('toBenchmarkMetric', () => {
  it("maps C's summary to D's BenchmarkMetric, IDOR first", () => {
    expect(toBenchmarkMetric(RESULTS)).toEqual({
      totalApps: 30,
      totalVulnerabilities: 56,
      baselineVulnerabilities: 65,
      slopstopVulnerabilities: 9,
      msPerFile: 177.4,
      rejectionRate: 0,
      failureAnalysis: [
        { category: 'idor', reason: 'Ownership checks need review.', count: 2 },
        { category: 'nosql-injection', reason: 'String-built $where needs review.', count: 1 },
      ],
    });
  });

  it('passes through recall, clean-app and fix counts when present', () => {
    const m = toBenchmarkMetric({
      summary: { ...RESULTS.summary, detectedGroundTruthFlaws: 56, fixedGroundTruthFlaws: 37, cleanApps: 5, falsePositivesOnCleanApps: 0, fixesAttempted: 56, verifierRejections: 0 },
    });
    expect(m).toMatchObject({ detectedVulnerabilities: 56, cleanApps: 5, falsePositivesOnCleanApps: 0, fixesApplied: 56, plantedFlawsFixed: 37 });
  });

  it('omits missing numbers instead of inventing them', () => {
    expect(toBenchmarkMetric({ summary: { totalApps: 30, rejectionRate: 'n/a' } })).toEqual({ totalApps: 30 });
    expect(toBenchmarkMetric({ summary: {} })).toBeNull();
    expect(toBenchmarkMetric({})).toBeNull();
  });
});

describe('loadBenchmark', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'slopstop-bench-'));
  it('returns null when the file is missing or broken', () => {
    expect(loadBenchmark(path.join(dir, 'nope.json'))).toBeNull();
    writeFileSync(path.join(dir, 'bad.json'), '{not json');
    expect(loadBenchmark(path.join(dir, 'bad.json'))).toBeNull();
  });
  it('loads a real file', () => {
    writeFileSync(path.join(dir, 'ok.json'), JSON.stringify(RESULTS));
    expect(loadBenchmark(path.join(dir, 'ok.json')).totalApps).toBe(30);
  });
  it('adds a SlopStop vs Semgrep comparison only when Semgrep actually ran', () => {
    const full = { ...RESULTS, summary: { ...RESULTS.summary, detectedGroundTruthFlaws: 56, fixedGroundTruthFlaws: 37, falsePositivesOnCleanApps: 0, fixesAttempted: 56, verifierRejections: 0 } };
    writeFileSync(path.join(dir, 'full.json'), JSON.stringify(full));
    writeFileSync(path.join(dir, 'base.json'), JSON.stringify({ semgrep: { status: 'run', version: '1.186.0', detectedGroundTruthFlaws: 12, totalGroundTruthFlaws: 56, findingsOnCleanApps: 1 }, gitleaks: { status: 'run', detectedGroundTruthFlaws: 0 } }));
    writeFileSync(path.join(dir, 'notrun.json'), JSON.stringify({ semgrep: { status: 'not run' } }));
    expect(loadBenchmark(path.join(dir, 'full.json'), path.join(dir, 'base.json')).comparison).toEqual([
      { tool: 'SlopStop', detected: 56, total: 56, fixed: 56, plantedFixed: 37, findingsOnCleanApps: 0 },
      { tool: 'Semgrep 1.186.0', detected: 12, total: 56, fixed: 0, plantedFixed: 0, findingsOnCleanApps: 1 },
    ]);
    expect(loadBenchmark(path.join(dir, 'full.json'), path.join(dir, 'notrun.json')).comparison).toBeUndefined();
    expect(loadBenchmark(path.join(dir, 'full.json'), path.join(dir, 'missing.json')).comparison).toBeUndefined();
  });
  it('cleans up', () => rmSync(dir, { recursive: true, force: true }));
});
