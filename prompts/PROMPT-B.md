=== SHARED CONTEXT (identical for all roles) ===
SlopStop is a pre-ship security gate and verified auto-patcher for AI-generated ("vibe-coded")
Node/Express/MongoDB apps. Flow: user submits code -> SCAN -> findings shown with a one-click
"Fix all" -> VERIFY each patch -> RE-SCAN -> before/after shown. Patches are never auto-applied
to disk; the user confirms.
The core is DETERMINISTIC (regex/AST with acorn). No LLM in the fix path. An optional llmPatch()
stub exists but is OFF by default. It detects: hard-coded secrets, NoSQL/SQL injection sinks,
unauthenticated Express routes, vulnerable dependencies (npm audit). It cannot fix BOLA/IDOR
logic flaws; those are reported as "review".

Repo layout and ownership (edit ONLY your own folders):
  contract/ (A)   core/ (A; core/promptHardener.js is D)   server/ (B)   cli/ (B)
  web/ (D)        corpus/ (C)                              docs/ (D)
Git: branch feat/<role>, PR to dev, rebase before PR, squash merge.
Stack: Node 20+, ESM, Express, React+Vite+TS+Tailwind, vitest. No new dependencies without
telling the team. No secrets in the repo. Keep files under ~300 lines.
Server runs on port 3001. Repo root has package.json ("type":"module", npm workspaces for
core, server, cli, web, corpus). Run `npm install` at the root. Windows + PowerShell/Git Bash.
Each workspace folder needs its own package.json (its owner creates it, with "type":"module").

CONTRACT (frozen). USE THESE NAMES EXACTLY. Never rename, "improve", pluralise or
re-case any field, enum value, endpoint or export. If you think a name is wrong, say so and
wait for the team; do not change it yourself. Machine-readable copy: contract/finding.schema.json;
samples: contract/sample-scan.json and contract/sample-fix.json (already written, read them).
Finding = {
  id: string,            // stable: `${ruleId}:${file}:${line}`
  ruleId: string,        // e.g. "secret-hardcoded", "nosql-injection", "route-no-auth", "dep-vuln", "idor-suspect"
  category: "secret"|"injection"|"auth"|"dependency"|"idor",
  severity: "critical"|"high"|"medium"|"low",
  file: string, line: number, endLine: number,
  snippet: string, message: string,
  fixable: "auto"|"review",
  fixPreview?: string
}
Score = { safety: number /*0-100*/, counts: {critical,high,medium,low} }
  safety = max(0, 100 - (25*critical + 15*high + 8*medium + 3*low)); dashboard risk % = 100 - safety.
API (server, role B):
  POST /api/scan   {files:[{path,content}]} -> {findings:Finding[], score:Score}
  POST /api/fix    {files, findingIds:string[]} -> {
      patched:[{path,original,patched}], envFile:string,
      results:[{findingId, status:"applied"|"rejected"|"review", reason:string}],
      rescan:{findings:Finding[], score:Score} }
  POST /api/exploit {} -> {before:{status,body}, after:{status,body}}
  POST /api/harden-prompt {prompt:string} -> {hardened:string, redactions:[{type,original}], rules:string[]}
core exports (role A): scan(files)->Finding[]; computeScore(findings)->Score;
  applyFixes(files, findings)->{patched, envFile, results}
server exports (role B): verify(patched) = node --check each patched file + re-scan it; reject any
  patch that fails or leaves/creates findings, with a reason string.
=== END SHARED CONTEXT ===

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
