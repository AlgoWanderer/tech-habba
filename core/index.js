// SlopStop core engine (role A). Public API is frozen by contract/:
//   scan(files) -> Finding[]
//   computeScore(findings) -> Score
//   applyFixes(files, findings) -> { patched, envFile, results }
// scan(files, { audit }) also accepts npm audit JSON via options or as a submitted *.json file.
export { scan, analyze } from './scanner/index.js';
export { parseAudit } from './scanner/deps.js';

export { computeScore } from './score.js';

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
