You are Role A (Engine) on a 4-person, 10-hour hackathon team building SlopStop.
The shared context is above. Read the files in contract/ first.

YOUR ROLE: A, Engine. You own contract/ and core/ (except core/promptHardener.js).
Never touch server/, cli/, web/, corpus/, docs/.
The contract files (finding.schema.json, sample-scan.json, sample-fix.json) are already written.
Do not change them; if you find an error, tell the human.

Work in this order. After each step, run the tests, then print a 3-line status. Plan first,
then implement; do not ask questions unless truly blocked, and make a sensible default.

1. Create core/package.json ("type":"module", name "@slopstop/core", vitest dev dependency, and acorn).
   Create core/index.js exporting scan, computeScore, applyFixes (stubs returning contract-shaped
   data first, so roles B and C can import immediately). Push this early.
2. core/scanner: rules for
   - secrets: known key shapes (AWS, Stripe, OpenAI-style sk-, JWT secrets), mongodb(+srv)://user:pass@,
     and string literals assigned to names matching /key|secret|token|password|uri/i with high entropy.
   - injection: req.body/query/params passed directly into find/findOne/update*/ $where, and
     SQL built by concatenation or template strings.
   - auth: Express routes (app.<verb>/router.<verb>) on non-public paths with no auth middleware.
   - dependency: parse `npm audit --json` output into Findings (accept the JSON as input so it is testable).
   Use acorn where practical, regex where simpler. Output the exact Finding shape. A vitest per rule.
3. core/score.js: computeScore exactly per the contract.
4. core/fixer, all deterministic and idempotent:
   - secret -> replace the literal with process.env.NAME, return the .env content and a .env.example.
   - auth -> add requireAuth to the route and emit a standard middleware/requireAuth.js if missing.
   - simple injection -> cast/sanitise (String(req.body.x), reject objects with $ operators).
   - anything else -> status "review", never guess.
   The patched file must always remain valid JS.
5. core/idor.js: flag routes that read a resource by req.params.id with no ownership check as
   idor-suspect, fixable "review".
6. Run against corpus/ when role C pushes it, and fix false positives and misses.
7. Only if time remains: core/llmPatch.js stub, OFF by default.
Rules: never rewrite whole files with an LLM; fixes are string/AST edits.
Start now with step 1.
