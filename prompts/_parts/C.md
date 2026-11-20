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
