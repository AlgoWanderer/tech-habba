=== YOUR ROLE: D (web/, docs/, core/promptHardener.js) ===
You own the dashboard and the pitch. D1 can start now with mock data.

STEP D1 (Wave 1, about 1.5 hours). Branch: feat/d-ai
1. web/src/types.ts: add to Finding  source?: "rule" | "ai";  confidence?: number;
   to the fix result type  source?: "rule" | "ai".  Add mode types "rules" | "ai" | "hybrid".
2. web/src/api.ts: scan(files, mode) and fix(files, ids, mode, aiFindings) send the mode in the
   body; in hybrid mode fix() must also send aiFindings = the findings with source "ai" from the
   last hybrid scan response (otherwise the server rejects AI ids as "not provided").
   In mock mode, add 2 sample AI findings to the mock scan for mode ai/hybrid (e.g. an XSS line
   and a public-route check, confidence 0.8 and 0.6).
3. Security Gate: a 3-way switch above "Scan code": Rules | AI only | Hybrid (default Rules).
   A tooltip on each: "Rules: deterministic, verified"; "AI only: LLM, unverified";
   "Hybrid: rules + LLM, every AI patch verified". Disable AI only / Hybrid with the tooltip
   "AI not configured" when /api/health says ai: false.
4. FindingsList: AI findings get a violet "AI" badge plus the confidence ("AI 82%"); rule findings
   show nothing new. Group as today (by severity). Add a one-line legend.
5. Fix view: rows with source "ai" show "AI patch"; rejected AI patches show the reason in red
   ("AI patch rejected: broke syntax"). Rejections are a feature: keep them visible.
6. Carry-over, if not done yet: the "Apply to editor" button, the "Suggested fix (apply by hand)"
   label for review findings with a fixPreview, and a warning when a tab is not named .js
   (see the earlier prompt-for-D-apply-to-editor).
7. npm run build -w web must pass. PR into dev: "web: AI mode switch, AI badges, AI patch results".

STEP D2 (Wave 2, after B2 is merged): test against the live API with the key set. Use the samples
in Downloads (slopstop-test-library.txt pasted into an index.js tab): Rules vs Hybrid should show
extra AI findings, and the fix view should show AI patches with applied/rejected. Fix any UI bugs.

STEP D3 (Wave 3)
1. Scorecard: an "Experiment" card reading GET /api/experiment: a table with the arms
   Rules / AI only / Hybrid as rows and the columns flaws found, critical+high left, apps broken
   (syntax fail or deleted routes), AI patches rejected, time per app. Show "not measured" when
   missing; never invent numbers.
2. docs/DEMO_SCRIPT.md: add a 30-second "Hybrid" step: switch to Hybrid, scan, point at an AI
   finding, fix, and point at one rejected AI patch ("the verifier caught the AI's mistake").
3. Slides: hypothesis, method, the results table, failure analysis.
