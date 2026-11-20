// computeScore per contract:
//   safety = max(0, 100 - (25*critical + 15*high + 8*medium + 3*low)); risk % = 100 - safety.
export const WEIGHTS = Object.freeze({ critical: 25, high: 15, medium: 8, low: 3 });

/** @param {{severity:string}[]} findings */
export function computeScore(findings) {
  const counts = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const f of findings ?? []) if (Object.hasOwn(counts, f?.severity)) counts[f.severity] += 1;
  const penalty = WEIGHTS.critical * counts.critical + WEIGHTS.high * counts.high + WEIGHTS.medium * counts.medium + WEIGHTS.low * counts.low;
  return { safety: Math.max(0, 100 - penalty), counts };
}
