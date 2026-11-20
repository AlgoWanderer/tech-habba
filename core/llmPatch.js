// OPTIONAL, OFF BY DEFAULT. Not used anywhere in the deterministic fix path (core/fixer/).
// A placeholder for a future LLM-suggested patch on findings marked fixable "review".
// Even when enabled it would only ever return a suggestion for human review; it never rewrites
// whole files and its output must still pass role B's verify() gate before anyone sees it.

export const LLM_PATCH_ENABLED = process.env.SLOPSTOP_LLM_PATCH === '1';

/**
 * llmPatch(file, finding) -> { status: 'disabled' | 'unavailable', suggestion: null, reason }
 * @param {{path:string, content:string}} file
 * @param {object} finding contract Finding
 */
export async function llmPatch(file, finding, { enabled = LLM_PATCH_ENABLED } = {}) {
  void file;
  if (!enabled) {
    return { status: 'disabled', suggestion: null, reason: 'llmPatch is off by default (set SLOPSTOP_LLM_PATCH=1).' };
  }
  return {
    status: 'unavailable',
    suggestion: null,
    reason: `No LLM provider is configured; ${finding?.id ?? 'finding'} stays "review".`,
  };
}
