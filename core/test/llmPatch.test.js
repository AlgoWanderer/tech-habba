import { describe, it, expect } from 'vitest';
import { llmPatch, LLM_PATCH_ENABLED } from '../llmPatch.js';

describe('llmPatch stub', () => {
  it('is off by default and returns no suggestion', async () => {
    expect(LLM_PATCH_ENABLED).toBe(false);
    expect(await llmPatch({ path: 'a.js', content: '' }, { id: 'x' })).toMatchObject({ status: 'disabled', suggestion: null });
  });
  it('still returns nothing when enabled with no provider', async () => {
    expect((await llmPatch({}, { id: 'x' }, { enabled: true })).suggestion).toBeNull();
  });
});
