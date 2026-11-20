import { describe, expect, it } from 'vitest';
import { runFix, runScan } from '../pipeline.js';
import { makeFakeCore, SAMPLE_FILES } from './fakeCore.js';

const statusOf = (out, prefix) => out.results.find((r) => r.findingId.startsWith(prefix));

describe('runScan', () => {
  it('returns findings and the contract score', async () => {
    const out = await runScan(makeFakeCore(), SAMPLE_FILES);
    expect(out.findings.map((f) => f.ruleId).sort()).toEqual(['idor-suspect', 'nosql-injection', 'secret-hardcoded']);
    // 1 critical (25) + 1 high (15) + 1 medium (8) = 48
    expect(out.score).toEqual({ safety: 52, counts: { critical: 1, high: 1, medium: 1, low: 0 } });
  });
});

describe('runFix', () => {
  it('applies verified fixes, keeps review items as review, and rescans', async () => {
    const core = makeFakeCore();
    const { findings } = await runScan(core, SAMPLE_FILES);
    const out = await runFix(core, SAMPLE_FILES, findings.map((f) => f.id));

    expect(statusOf(out, 'secret-hardcoded').status).toBe('applied');
    expect(statusOf(out, 'nosql-injection').status).toBe('applied');
    expect(statusOf(out, 'idor-suspect').status).toBe('review');
    expect(out.patched.map((p) => p.path).sort()).toEqual(['a.js', 'b.js']);
    expect(out.envFile).toBe('STRIPE_KEY=\n');
    expect(out.rescan.findings.map((f) => f.ruleId)).toEqual(['idor-suspect']);
    expect(out.rescan.score.safety).toBe(92);
    expect(typeof out.timingMs).toBe('number');
  });

  it('rejects only the file whose patch breaks syntax', async () => {
    const core = makeFakeCore({ breakInjectionFix: true });
    const { findings } = await runScan(core, SAMPLE_FILES);
    const out = await runFix(core, SAMPLE_FILES, findings.map((f) => f.id));

    expect(statusOf(out, 'secret-hardcoded').status).toBe('applied');
    const inj = statusOf(out, 'nosql-injection');
    expect(inj.status).toBe('rejected');
    expect(inj.reason).toMatch(/node --check failed/);
    expect(out.patched.map((p) => p.path)).toEqual(['a.js']);
    expect(out.rescan.findings.some((f) => f.ruleId === 'nosql-injection')).toBe(true);
  });

  it('rejects a patch that adds a new secret', async () => {
    const core = makeFakeCore({ injectionFixAddsSecret: true });
    const { findings } = await runScan(core, SAMPLE_FILES);
    const out = await runFix(core, SAMPLE_FILES, findings.filter((f) => f.file === 'b.js').map((f) => f.id));
    expect(statusOf(out, 'nosql-injection')).toMatchObject({ status: 'rejected' });
    expect(statusOf(out, 'nosql-injection').reason).toMatch(/introduced/);
  });

  it('marks unknown ids as rejected and dedupes ids', async () => {
    const out = await runFix(makeFakeCore(), SAMPLE_FILES, ['nope:x.js:1', 'nope:x.js:1']);
    expect(out.results).toEqual([{ findingId: 'nope:x.js:1', status: 'rejected', reason: 'Finding not present in a fresh scan of these files.' }]);
    expect(out.patched).toEqual([]);
    expect(out.envFile).toBe('');
  });
});
