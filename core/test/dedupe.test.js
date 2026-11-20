import { describe, expect, it } from 'vitest';
import { scan } from '../index.js';

// Regression: several fixable findings with the same id (same rule, same line) used to crash scan()
// with "Cannot redefine property: _fix" when dedupe() merged their fixes. Found by the Phase 2 experiment
// on an AI-rewritten file.
describe('dedupe of findings that share an id', () => {
  it('merges three secrets on one line without throwing', () => {
    const code = 'const cfg = { a: "sk_live_ABCDEF1234567890abcd", b: "sk_live_QWERTY1234567890abcd", c: "sk_live_ZXCVBN1234567890abcd" };\nmodule.exports = cfg;\n';
    const findings = scan([{ path: 'index.js', content: code }]);
    expect(findings.filter((f) => f.category === 'secret').length).toBeGreaterThan(0);
  });
});
