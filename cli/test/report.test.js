import { describe, expect, it } from 'vitest';
import { lineDiff, summarize } from '../lib/report.js';

describe('summarize', () => {
  it('lists findings worst-first with file:line', () => {
    const out = summarize(
      [
        { severity: 'medium', file: 'a.js', line: 9, message: 'IDOR', fixable: 'review' },
        { severity: 'critical', file: 'a.js', line: 2, message: 'Hard-coded key', fixable: 'auto' },
      ],
      1,
    );
    const lines = out.split('\n');
    expect(lines[0]).toBe('SlopStop: 2 finding(s) in 1 file(s) (1 critical, 1 medium)');
    expect(lines[1]).toMatch(/^ {2}CRITICAL\s+a\.js:2\s+Hard-coded key {2}\[auto-fixable\]$/);
    expect(lines[2]).toMatch(/MEDIUM\s+a\.js:9\s+IDOR {2}\[needs review\]/);
  });
  it('says so when clean', () => expect(summarize([], 3)).toBe('SlopStop: no findings in 3 file(s).'));
});

describe('lineDiff', () => {
  it('shows only changed lines with context', () => {
    const a = ['1', '2', 'const K = "sk_live_x";', '4', '5', '6', '7'].join('\n');
    const b = ['1', '2', 'const K = process.env.K;', '4', '5', '6', '7'].join('\n');
    expect(lineDiff(a, b, 1)).toBe(['  @@ line 2 @@', '    2', '  - const K = "sk_live_x";', '  + const K = process.env.K;', '    4'].join('\n'));
  });
});
