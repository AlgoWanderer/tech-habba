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
