import { describe, it, expect } from 'vitest';
import { scan, computeScore, applyFixes } from '../index.js';

describe('core public API', () => {
  it('exports the three contract functions', () => {
    expect(typeof scan).toBe('function');
    expect(typeof computeScore).toBe('function');
    expect(typeof applyFixes).toBe('function');
  });
  it('returns contract-shaped data', () => {
    expect(Array.isArray(scan([{ path: 'a.js', content: '' }]))).toBe(true);
    expect(computeScore([])).toEqual({ safety: 100, counts: { critical: 0, high: 0, medium: 0, low: 0 } });
    expect(applyFixes([], [])).toMatchObject({ patched: [], envFile: '', results: [] });
  });
});
