=== YOUR ROLE: B (server/ and cli/) ===
You own the AI layer and the API. B1 can start immediately (use a fake model in tests).

STEP B1 (Wave 1, about 2.5 hours). Branch: feat/b-ai
1. server/env.js: load server/.env without a dependency (read the file, split lines, set
   process.env only for keys not already set). Import it first in server/index.js.
2. server/ai/client.js: export createGeminiClient({ apiKey, model = "gemini-2.5-flash" })
   -> { name, generateJson(systemText, userText, responseSchema) }.
   POST https://generativelanguage.googleapis.com/v1beta/models/<model>:generateContent
   with header "x-goog-api-key" (never put the key in the URL or in logs),
   generationConfig { temperature: 0.2, responseMimeType: "application/json", responseSchema }.
   Timeout 30 s, 2 retries on 429/5xx with backoff, and a clear error message on failure.
   Export getAiClient(): null when GEMINI_API_KEY is missing.
   Export createFakeClient(responses) for tests (returns canned JSON, counts calls).
3. server/ai/detect.js: export async function aiDetect(files, client)
   - mask secrets first with core's maskSecrets (until A1 lands, a local stub that returns files unchanged)
   - send numbered lines ("12| code") for each JS/TS file; ask for JSON
     [{file, line, category, severity, title, explanation, confidence}] using the 5 categories
     (XSS / command injection / path traversal -> "injection"); tell the model to report only
     real, exploitable issues with exact line numbers
   - validate: drop items whose file is not in the input, whose line is out of range, or whose
     confidence is below 0.5
   - build Finding objects: source "ai", fixable "review", id "ai-<category>:<file>:<line>",
     ruleId "ai-<kebab of title>", snippet = the ACTUAL line from the file (never the model's text),
     message = title + ": " + explanation (max 200 chars), endLine = line
4. server/ai/patch.js: export async function aiPatch(files, finding, client, { scan })
   - find the enclosing function (route handler) of finding.line with acorn (core/lib/ast.js
     helpers), send only that function plus 10 lines of context (secrets masked), ask for JSON
     { replacement: "<the whole function, fixed>", explanation }
   - splice the replacement into the file, then run the EXISTING verify() from server/verify.js
     with the finding as target, and also reject when the route count changed or a masked
     placeholder "<REDACTED_SECRET" appears in the patch
   - return { result: {findingId, status: "applied"|"rejected", reason, source: "ai"}, patched }
5. Tests (server/test/ai.test.js) with the fake client only, no network: detector drops
   out-of-range lines and low confidence; the snippet comes from the file; secrets are masked in
   what is sent; the patcher rejects a patch that breaks syntax, keeps the flaw, or deletes a route,
   and accepts a good one. Existing 30+ server tests must still pass.

STEP B2 (Wave 2, after A1 is merged, about 1.5 hours)
1. POST /api/scan: mode "rules" (default, unchanged), "ai" (aiDetect only), "hybrid"
   (mergeFindings(rules, aiDetect)). The score is computed over the returned findings.
   mode ai/hybrid with no key -> 400 {error: "AI not configured: add GEMINI_API_KEY to server/.env"}.
2. POST /api/fix: mode "hybrid" = the current rule fixes, then aiPatch for every remaining
   "review" finding (rule or AI) in the requested ids, applied one at a time on top of the
   rule-patched files, each verified; then rescan in hybrid mode. Rejected AI patches are reported,
   never applied.
3. GET /api/health adds ai: true/false. GET /api/experiment serves corpus/experiment/results.json
   (summary only; 404 if missing), like /api/benchmark.
4. CLI: `slopstop scan <files> --ai` uses hybrid mode when a key is set, and prints "[AI 0.82]"
   next to AI findings.
5. Update server/test/contract.test.js for the new optional fields. All tests green; PR into dev.

STEP B3 (Wave 3): README results section with the experiment numbers from C, the hypothesis
sentence, the baseline table and a link to the failure analysis.
