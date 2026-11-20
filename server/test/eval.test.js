import { describe, expect, it } from 'vitest';
import { score } from '../eval/models.js';

const row = (vulnerable, pred) => ({ truth: { vulnerable, categories: vulnerable ? ['auth'] : [] }, pred });

describe('model eval scoring', () => {
  it('never drops invalid answers: a miss on vulnerable, no call on safe, wrong in accuracy', () => {
    const rows = [
      row(true, { vulnerable: true, category: 'auth' }), // tp
      row(true, null), // invalid on vulnerable -> fn
      row(false, { vulnerable: false, category: 'none' }), // tn
      row(false, null), // invalid on safe -> neither tp nor fp, still wrong for accuracy
    ];
    const s = score(rows);
    expect(s).toMatchObject({ tp: 1, fn: 1, tn: 1, fp: 0, invalidOrError: 2, precision: 1, recall: 0.5, accuracy: 0.5 });
  });

  it("reproduces role A's hand-computed numbers for a model with many invalid answers", () => {
    // qwen-base-q8 in #46: tp 36, fp 29, fn 3 + 22 invalid on vulnerable -> P 0.554, R 0.590, F1 0.571
    const rows = [
      ...Array.from({ length: 36 }, () => row(true, { vulnerable: true, category: 'auth' })),
      ...Array.from({ length: 29 }, () => row(false, { vulnerable: true, category: 'auth' })),
      ...Array.from({ length: 3 }, () => row(true, { vulnerable: false, category: 'none' })),
      ...Array.from({ length: 22 }, () => row(true, null)),
      ...Array.from({ length: 14 }, () => row(false, null)),
      ...Array.from({ length: 18 }, () => row(false, { vulnerable: false, category: 'none' })),
    ];
    expect(score(rows)).toMatchObject({ snippets: 122, invalidOrError: 36, precision: 0.554, recall: 0.59, f1: 0.571, accuracy: 0.443 });
  });
});
