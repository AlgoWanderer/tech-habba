import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { computeScore } from '../index.js';

const sev = (...s) => s.map((severity) => ({ severity }));

describe('computeScore', () => {
  it('is 100 with no findings', () => {
    expect(computeScore([])).toEqual({ safety: 100, counts: { critical: 0, high: 0, medium: 0, low: 0 } });
  });
  it('applies the contract weights', () => {
    expect(computeScore(sev('critical', 'high', 'medium', 'low')).safety).toBe(100 - 25 - 15 - 8 - 3);
  });
  it('clamps at 0', () => {
    expect(computeScore(sev('critical', 'critical', 'critical', 'critical', 'critical')).safety).toBe(0);
  });
  it('ignores unknown severities', () => {
    expect(computeScore([{ severity: 'info' }, {}]).safety).toBe(100);
  });
  it('matches contract/sample-scan.json', () => {
    const sample = JSON.parse(readFileSync(new URL('../../contract/sample-scan.json', import.meta.url), 'utf8'));
    expect(computeScore(sample.findings)).toEqual(sample.score);
  });
});
