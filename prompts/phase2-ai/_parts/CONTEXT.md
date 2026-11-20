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
  GET  /api/health adds  ai: boolean   (true when a key is configured)
  GET  /api/experiment  (new, read-only) -> corpus/experiment/results.json summary, 404 if missing

OWNERSHIP (unchanged; edit ONLY your own folders):
  A: contract/, core/ (except core/promptHardener.js)   B: server/, cli/
  C: corpus/                                            D: web/, docs/, core/promptHardener.js
Git: branch feat/<role>-ai from dev, PR into dev, CI must be green. One PR per wave step is fine.
Stack: Node 20+, ESM, no new npm dependencies (use fetch). Keep files under ~300 lines. Tests: vitest.

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
