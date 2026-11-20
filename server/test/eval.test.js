import { describe, expect, it } from 'vitest';
import { score } from '../eval/models.js';

const row = (vulnerable, pred) => ({ truth: { vulnerable, categories: vulnerable ? ['auth'] : [] }, pred });

describe('model eval scoring', () => {
  it('counts invalid answers as wrong instead of dropping them', () => {
    const rows = [
      row(true, { vulnerable: true, category: 'auth' }), // tp
      row(true, null), // invalid on vulnerable -> fn
      row(false, { vulnerable: false, category: 'none' }), // tn
      row(false, null), // invalid on safe -> fp
    ];
    const s = score(rows);
    expect(s).toMatchObject({ tp: 1, fn: 1, tn: 1, fp: 1, invalidOrError: 2, precision: 0.5, recall: 0.5, accuracy: 0.5 });
  });
});
