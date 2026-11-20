// SlopStop core engine (role A). Public API is frozen by contract/:
//   scan(files) -> Finding[]
//   computeScore(findings) -> Score
//   applyFixes(files, findings) -> { patched, envFile, results }
// scan(files, { audit }) also accepts npm audit JSON via options or as a submitted *.json file.
export { scan, analyze } from './scanner/index.js';
export { parseAudit } from './scanner/deps.js';

const WEIGHTS = { critical: 25, high: 15, medium: 8, low: 3 };

export function computeScore(findings) {
  const counts = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const f of findings) if (f.severity in counts) counts[f.severity] += 1;
  const penalty = Object.keys(WEIGHTS).reduce((s, k) => s + WEIGHTS[k] * counts[k], 0);
  return { safety: Math.max(0, 100 - penalty), counts };
}

export function applyFixes(files, findings) {
  void files;
  return {
    patched: [],
    envFile: '',
    results: (findings ?? []).map((f) => ({
      findingId: typeof f === 'string' ? f : f.id,
      status: 'review',
      reason: 'Fixer not implemented yet.',
    })),
  };
}
