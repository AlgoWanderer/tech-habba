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

=== YOUR ROLE: C (corpus/) ===
You own the test apps and the experiment, which is the "AI research" result the judges score.

STEP C1 (Wave 1, start now, about 1.5 hours). Branch: feat/c-ai
1. FIRST, finish issue #19: the raw Gemini apps. Follow corpus/wild/README.md: the 10 prompts,
   a fresh Gemini chat each, the same model D used (corpus/wild/MODEL.txt), code saved UNEDITED to
   corpus/wild/raw/app01..app10/index.js. Do not create package.json files by script; only save
   one if Gemini wrote it.
2. Create corpus/experiment/run.js, a skeleton for now. It must:
   - take the app sets: corpus/apps (30, with ground truth in corpus/ground-truth.json),
     corpus/wild/raw (10) and corpus/wild/hardened (10)
   - for each app run three ARMS, each wrapped in a function so B's AI code plugs in later:
       RULES:  runScan + runFix from server/pipeline.js (exists today)
       AI:     aiDetect (detection) + a whole-file LLM rewrite (the prompt in
               corpus/baselines/run-all.js, LLM_SYSTEM_PROMPT), with NO verifier
       HYBRID: scan mode "hybrid" + fix mode "hybrid" (B2)
   - record per app and arm: findings count, ground-truth flaws found (corpus apps: same matching
     as corpus/benchmark/run.js), critical/high before and after (re-scan with the RULES scanner as
     the judge), whether the fixed code passes node --check, routes before/after (deleted routes),
     AI patches applied/rejected, time in ms, number of model calls
   - repeat the AI and HYBRID arms 3 times (--runs 3) and report the mean and the min-max range
   - write corpus/experiment/results.json { method, summary per arm, perApp }
   - flags: --sets corpus,raw,hardened  --runs 3  --arms rules,ai,hybrid ; skip AI arms with a
     clear message when there is no GEMINI_API_KEY
   B2 is already done: use scanWithMode / fixHybrid / getAiClient from server/ai/ (see STATUS in
   the shared context). For the AI arm's whole-file rewrite, call client.generateJson with the
   prompt from corpus/baselines/run-all.js and a schema {type:'OBJECT', properties:{code:{type:'STRING'}}}.
   Mask secrets first with maskForModel from server/ai/mask.js; never send real secret values.
   Without a key, the AI arms print "skipped: no GEMINI_API_KEY" and RULES still runs end to end.
3. PR into dev: "corpus: raw wild apps + experiment harness".

STEP C2 (Wave 2, after B2 is merged, about 1 hour)
1. Arnav's laptop has the key in server/.env. Run: node corpus/experiment/run.js --runs 3
   (expect a few minutes; on 429 rate-limit errors, wait and re-run, since the harness should
   resume or skip finished apps).
2. Hand-check the AI findings on the 20 wild apps: corpus/experiment/labels.json, one entry per
   AI finding {app, findingId, verdict: "true" | "false" | "unsure", note}. A finding is "true"
   only if you can point to the exact line and say how an attacker uses it.
3. Add precision of AI findings (true / (true + false)) to the summary. PR into dev.

STEP C3 (Wave 3): corpus/experiment/README.md, one page: the hypothesis sentence, the method
(apps, arms, runs, model, date), the results table, and where each arm fails (with A's notes).
Report negative results honestly; the track rules say a properly measured negative result counts.
