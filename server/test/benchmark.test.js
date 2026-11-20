import { describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadBenchmark, loadModelEval, toBenchmarkMetric } from '../benchmark.js';

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
  it('model eval: summary rows only, null when missing', () => {
    writeFileSync(path.join(dir, 'me.json'), JSON.stringify({ method: { snippets: 2 }, models: { rules: { precision: 1, recall: 0.5, rows: [{}, {}] }, 'gemini (x)': { precision: 0.8, recall: 0.9, rows: [] } } }));
    expect(loadModelEval(path.join(dir, 'me.json'))).toEqual({ method: { snippets: 2 }, models: [{ model: 'rules', precision: 1, recall: 0.5 }, { model: 'gemini (x)', precision: 0.8, recall: 0.9 }] });
    expect(loadModelEval(path.join(dir, 'missing.json'))).toBeNull();
  });
  it('model eval: merges model-eval-*.json files (e.g. a Qwen run from another laptop)', () => {
    const sub = path.join(dir, 'me');
    mkdirSync(sub);
    writeFileSync(path.join(sub, 'model-eval.json'), JSON.stringify({ method: { snippets: 110 }, models: { rules: { f1: 0.97 }, gemini: { f1: 0.8 } } }));
    writeFileSync(path.join(sub, 'model-eval-qwen.json'), JSON.stringify({ method: { snippets: 110 }, models: { rules: { f1: 0.97 }, 'ollama:slopstop-qwen': { f1: 0.7, rows: [] } } }));
    expect(loadModelEval(path.join(sub, 'model-eval.json')).models.map((m) => `${m.model}=${m.f1}`)).toEqual(['rules=0.97', 'gemini=0.8', 'ollama:slopstop-qwen=0.7']);
  });
  it('cleans up', () => rmSync(dir, { recursive: true, force: true }));
});
