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
