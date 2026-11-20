// mergeFindings(ruleFindings, aiFindings) -> Finding[]
// Combines deterministic rule findings with AI findings for hybrid mode:
//  - every rule finding is kept, marked source "rule"
//  - an AI finding is dropped when a rule finding has the same file, the same category and a line
//    within +-1 (the rule finding wins: it is deterministic and may be auto-fixable)
//  - remaining AI findings are kept, marked source "ai" and fixable "review"
//  - result sorted by file, then line (stable otherwise). Inputs are never mutated.

const NEAR = 1;

export function mergeFindings(ruleFindings, aiFindings) {
  const rules = (ruleFindings ?? []).map((f) => ({ ...f, source: 'rule' }));
  const ai = (aiFindings ?? [])
    .filter((a) => !rules.some((r) => r.file === a.file && r.category === a.category && Math.abs(r.line - a.line) <= NEAR))
    .map((a) => ({ ...a, source: 'ai', fixable: 'review' }));
  return [...rules, ...ai]
    .map((f, i) => ({ f, i }))
    .sort((x, y) => String(x.f.file).localeCompare(String(y.f.file)) || x.f.line - y.f.line || x.i - y.i)
    .map(({ f }) => f);
}
