=== PHASE 2 SHARED CONTEXT (identical for all roles) ===
PROJECT: SlopStop, a pre-ship security gate for AI-generated Node/Express/MongoDB apps.
Repo: github.com/AlgoWanderer/tech-habba. Read CLAUDE.md (or GEMINI.md) in the repo root first.
Phase 1 is DONE and on `main`: a deterministic rule engine (core/) scans, auto-fixes and verifies
(node --check + re-scan). Benchmark on 30 team-made apps: 56/56 planted flaws found, 65 -> 9
critical/high (86%), 37/56 auto-fixed, 0 patches rejected, about 0.14 s per app. Semgrep: 12/56.

WHY PHASE 2: we are in Track 03 "AI research", R1 "Vibe-coded and vulnerable". Track rules: every
submission needs (1) a hypothesis or method in 1-2 sentences, (2) an evaluation against a baseline,
(3) an analysis of where the method fails. "A submission that only sends prompts to a hosted model
and shows the reply is not accepted." So we add an AI model AS PART OF A MEASURED METHOD, never as
"ask Gemini and show the answer".

PHASE 2 HYPOTHESIS (use these exact words everywhere):
"An LLM finds and fixes flaws that rules miss, but only a deterministic verifier makes its output
safe to ship: rules + LLM + verifier (hybrid) finds more flaws than rules alone and breaks no apps,
while the LLM alone breaks some."

THE FOUR FEATURES
1. AI detector: an LLM reads the code and reports flaws the rules miss (business logic / IDOR,
   routes that are public on purpose, XSS, command injection, path traversal, secrets in unusual
   places). Every AI finding is labelled source "ai" with a confidence 0-1.
2. AI patcher: for findings the rules cannot auto-fix (fixable "review"), the LLM proposes a patch
   for that one function only.
3. Verifier (already exists in server/verify.js): every AI patch must pass node --check, remove its
   target finding, add no new critical/high finding, and delete no route. Otherwise it is rejected.
4. Three-way experiment: on the same apps, compare RULES only, AI only (LLM detects + LLM rewrites
   the file, no verifier) and HYBRID (rules + AI detector + AI patcher + verifier).

MODEL: Google Gemini via REST, model "gemini-2.5-flash", no SDK (plain fetch). The key lives ONLY in
server/.env as GEMINI_API_KEY=... (.env is git-ignored). NEVER commit, print, log or paste a key.
No key -> AI features report "AI not configured" and everything else works exactly as before.
PRIVACY RULE: before any code is sent to the model, every secret the rules found is masked
(replaced with "<REDACTED_SECRET_n>"). Real secret values must never reach the model.

CONTRACT ADDITIONS (additive only; nothing existing is renamed or removed):
  Finding gets two OPTIONAL fields:
    source?: "rule" | "ai"        (missing = "rule")
    confidence?: number 0..1      (only on AI findings)
  AI findings: id = "ai-<category>:<file>:<line>", ruleId = "ai-<short-kebab-name>"
    (e.g. "ai-xss", "ai-public-route-check"), fixable = "review" always,
    category = one of the existing 5 (XSS / command injection / path traversal -> "injection").
  Fix result items get one OPTIONAL field:  source?: "rule" | "ai"
  POST /api/scan  body may add  mode?: "rules" | "ai" | "hybrid"   (default "rules")
  POST /api/fix   body may add  mode?: "rules" | "hybrid"          (default "rules")
                  and, in hybrid mode,  aiFindings?: Finding[]  = the AI findings from the hybrid
                  scan response (model output varies per call, so the client sends them back)
  GET  /api/health adds  ai: boolean   (true when a key is configured)
  GET  /api/experiment  (new, read-only) -> corpus/experiment/results.json summary, 404 if missing

OWNERSHIP (unchanged; edit ONLY your own folders):
  A: contract/, core/ (except core/promptHardener.js)   B: server/, cli/
  C: corpus/                                            D: web/, docs/, core/promptHardener.js
Git: branch feat/<role>-ai from dev, PR into dev, CI must be green. One PR per wave step is fine.
Stack: Node 20+, ESM, no new npm dependencies (use fetch). Keep files under ~300 lines. Tests: vitest.
FAKE KEYS: GitHub push protection blocks pushes that contain real-looking provider keys, even fake
ones (e.g. a long "sk_live_..."). In committed tests and samples use named secrets such as
const JWT_SECRET = "library-jwt-secret-do-not-share", or short dummies like "sk_live_ABCDEF123456".

STATUS: B1 and B2 are DONE (server/ai/: client, mask, detect, patch, hybrid; PR "feat/b-ai").
Server functions you can call directly (C's experiment):
  import { scanWithMode, fixHybrid } from './server/ai/hybrid.js'
  scanWithMode(core, files, "rules"|"ai"|"hybrid", client) -> { findings, score }
  fixHybrid(core, files, findingIds, client, { aiFindings }) -> FixResponse (+ source on results)
  import { getAiClient, createFakeClient } from './server/ai/client.js'   (null client = no key)

ORDER OF WORK (so nobody waits long):
  Step 0  Arnav: get a free key at aistudio.google.com, put GEMINI_API_KEY=... in server/.env.
  Wave 1 (parallel, no dependencies):
    A1 contract fields + maskSecrets() + mergeFindings()    B1 AI client + detector + patcher (fake model in tests)
    C1 C's raw Gemini apps + experiment harness skeleton     D1 UI: AI badge, confidence, mode switch (mock data)
  Wave 2 (after A1 + B1 are merged):
    B2 wire modes into /api/scan and /api/fix + /api/experiment     D2 connect the UI to the live API
    C2 run the experiment (needs B2)                                 A2 failure analysis of AI findings
  Wave 3: C3 results + hand labels, D3 scorecard section + docs, B3 README numbers, everyone rehearses.
=== END PHASE 2 SHARED CONTEXT ===

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
