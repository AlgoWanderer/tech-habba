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

You are Role C (Corpus and Benchmark) on a 4-person, 10-hour hackathon team building SlopStop.
The shared context is above. Read the files in contract/ first.

YOUR ROLE: C, Corpus and Benchmark. You own corpus/ only. Never touch any other folder.
Plan first, then work; do not ask questions unless truly blocked, and make a sensible default.
Do each step, then print a 3-line status.

1. Create corpus/package.json ("type":"module"). Generate 30 realistic "vibe-coded" Express +
   MongoDB (Mongoose or native driver) apps in corpus/apps/app01 ... app30. Each is 40-120 lines
   in the style an AI app builder produces (todo API, notes, blog, e-commerce cart, chat, auth
   demo...). Each app has index.js (or server.js) and a package.json. Plant 1-4 flaws per app
   from exactly these types:
   - secret: hard-coded API key, JWT secret, or a mongodb URI with password (use obviously fake values)
   - injection: req.body/query passed straight into find/findOne/$where, or concatenated SQL
   - auth: a data-returning route with no auth middleware
   - idor: GET/PUT/DELETE /resource/:id with no ownership check
   - dependency: package.json pins a known-vulnerable version (e.g. old express/jsonwebtoken/lodash/mongoose)
   Make apps 26-30 CLEAN (no flaws; they test false positives). Vary style across apps.
   Every app must pass `node --check`. Do 10 apps per batch and verify each batch.
   Use ONLY the contract category names in ground truth: secret, injection, auth, dependency, idor.
2. Write corpus/ground-truth.json: {"apps":[{"app":"app01","flaws":[{"category","file","line","severity"}]}]}.
   Line numbers must be exact: after generating, re-open each file and recompute the line numbers
   by searching the actual text, never from memory. Add corpus/README.md with the flaw counts per category.
3. Baselines in corpus/baselines/: scripts that run (a) Semgrep with the p/javascript config,
   (b) gitleaks, and (c) an "LLM-only fixer" harness (prompt template + parser that takes a file and
   returns a rewritten file). Record for each: how many ground-truth flaws it detects, false positives
   on the clean apps, and, for the LLM fixer, whether output passes `node --check` and whether it
   deleted routes (compare route counts before and after). Output corpus/baselines/results.json.
   Mark anything you couldn't run as "not run"; never estimate numbers.
   (Semgrep and gitleaks must be installed locally; tell me if they are missing.)
4. corpus/benchmark/run.js: for each app, call the SlopStop core scan + apply path (import from
   ../../core and ../../server/verify.js once they exist on dev; before then, stub), and write
   corpus/benchmark/results.json with: per-app findings before and after, reduction %, ms per file,
   verifier rejection count, and a list of flaws left as "review". Overall: total reduction % (critical+high),
   mean and p95 ms per file, rejection rate, recall and precision against ground truth.
5. corpus/FAILURES.md: concrete failure cases with file and line, with IDOR first, then anything the
   benchmark shows missed or wrongly flagged. Only report real observed results.
Rules: the targets (>75% fewer critical vulns, <1.5 s per file) are hypotheses; report whatever the
numbers show. Start now with step 1, batch 1 (apps 01-10).
