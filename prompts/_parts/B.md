You are Role B (Pipeline) on a 4-person, 10-hour hackathon team building SlopStop.
The shared context is above. Read the files in contract/ first (schema and both samples).

YOUR ROLE: B, Pipeline. You own server/ and cli/. Never touch core/, web/, corpus/, docs/, contract/.
Role A is writing core/ at the same time. Until core/ lands, import scan/applyFixes/computeScore
through server/coreAdapter.js, which returns the contract/sample-*.json data. Swapping to the real
core must be a one-file change in that adapter.
Plan first, then implement; do not ask questions unless truly blocked, and make a sensible default.
After each step, run the tests and print a 3-line status.

1. Scaffold server/ (own package.json, Express on port 3001, CORS on for http://localhost:5173,
   JSON body limit 5mb) with all 4 endpoints returning contract-shaped mock data through the
   adapter, so role D can start immediately. /api/harden-prompt calls core/promptHardener.js
   (role D) through the adapter, with a stub for now. STOP and tell me the start command so I
   can share it with the team.
2. server/verify.js:
   - write each patched file to a temp dir, run `node --check` on it (child_process, timeout 3s)
   - re-run scan() on the patched content
   - reject if syntax fails, or if any finding for the original finding's id/category remains, or
     a new critical/high finding appears
   - return {accepted, reason}; clean the temp dir. Tests with good and bad patches.
3. server/routes/fix.js: scan -> applyFixes for the selected finding ids -> verify each patch ->
   keep accepted patches, mark rejected ones with the reason, review ones as "review" -> rescan the
   patched set -> return the exact contract shape. Per-file timing may be added as an extra
   field `timingMs` (additive only; do not change any contract field).
4. server/contract.test.js: a vitest that validates every API response against
   contract/finding.schema.json, and fails on any extra or missing contract field, any wrong enum
   value, or a renamed key. Run it in every later step.
5. Integration 1 (when A's core is on dev): swap the adapter to the real core and run the
   full pipeline on 3 sample apps.
6. server/exploit/: a tiny sandbox of two Express apps in memory on random ports: one with an
   unprotected route returning user data, and one with the same route behind requireAuth. Fire
   an unauthenticated HTTP request at both. Return 200 + data against 401. Bind to 127.0.0.1 only
   and tear down after the request.
7. cli/: `npx slopstop-init` installs a git pre-commit hook that scans staged .js/.ts files and
   blocks the commit with a readable summary (severity, file:line, message) when critical/high
   findings exist. `--fix` prints the proposed patches. Provide `bin` in package.json.
8. End-to-end run on all corpus/ apps once role C pushes it, and fix integration bugs.
Rules: never write patched files to the user's project from the API; return patches only.
Start now with step 1.
