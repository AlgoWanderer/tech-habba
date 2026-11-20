// SlopStop core engine (role A). Public API is frozen by contract/:
//   scan(files) -> Finding[]
//   computeScore(findings) -> Score
//   applyFixes(files, findings) -> { patched, envFile, results }
// STEP 1 STUBS: contract-shaped, so roles B/C/D can import immediately.

/** @param {{path:string, content:string}[]} files */
export function scan(files) {
  void files;
  return [];
}

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
