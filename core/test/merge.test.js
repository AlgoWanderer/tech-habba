import { describe, it, expect } from 'vitest';
import { mergeFindings } from '../index.js';

const rule = (o) => ({ ruleId: 'route-no-auth', category: 'auth', severity: 'high', file: 'index.js', endLine: o.line, snippet: '', message: '', fixable: 'auto', ...o, id: `${o.ruleId ?? 'route-no-auth'}:${o.file ?? 'index.js'}:${o.line}` });
const ai = (o) => ({ ruleId: 'ai-x', severity: 'medium', file: 'index.js', endLine: o.line, snippet: '', message: '', fixable: 'review', confidence: 0.8, ...o, id: `ai-${o.category}:${o.file ?? 'index.js'}:${o.line}` });

describe('mergeFindings', () => {
  it('keeps every rule finding with source "rule"', () => {
    const out = mergeFindings([rule({ line: 5 }), rule({ line: 9, category: 'secret', ruleId: 'secret-hardcoded' })], []);
    expect(out.map((f) => f.source)).toEqual(['rule', 'rule']);
  });

  it('drops an AI finding on the same file + category within +-1 line; the rule finding wins', () => {
    const out = mergeFindings(
      [rule({ line: 10, category: 'auth' })],
      [ai({ line: 9, category: 'auth' }), ai({ line: 11, category: 'auth' }), ai({ line: 10, category: 'auth' })],
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ id: 'route-no-auth:index.js:10', source: 'rule', fixable: 'auto' });
  });

  it('keeps AI findings that differ by category, file or distance', () => {
    const out = mergeFindings(
      [rule({ line: 10, category: 'auth' })],
      [ai({ line: 10, category: 'injection' }), ai({ line: 12, category: 'auth' }), ai({ line: 10, category: 'auth', file: 'b.js' })],
    );
    expect(out.map((f) => `${f.source}:${f.file}:${f.line}:${f.category}`)).toEqual([
      'ai:b.js:10:auth',
      'rule:index.js:10:auth',
      'ai:index.js:10:injection',
      'ai:index.js:12:auth',
    ]);
    expect(out.filter((f) => f.source === 'ai').every((f) => f.fixable === 'review' && f.confidence === 0.8)).toBe(true);
  });

  it('sorts by file then line and does not mutate its inputs', () => {
    const r = [rule({ line: 20 }), rule({ line: 3, file: 'a.js' })];
    const a = [ai({ line: 7, category: 'idor' })];
    const before = JSON.stringify([r, a]);
    const out = mergeFindings(r, a);
    expect(out.map((f) => `${f.file}:${f.line}`)).toEqual(['a.js:3', 'index.js:7', 'index.js:20']);
    expect(JSON.stringify([r, a])).toBe(before);
  });

  it('tolerates missing inputs', () => {
    expect(mergeFindings(undefined, null)).toEqual([]);
  });
});
