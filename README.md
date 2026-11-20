# SlopStop

**A pre-ship security gate and verified auto-patcher for AI-generated ("vibe-coded") Node.js / Express / MongoDB apps.**

Track 03 · R1 *Vibe-coded and vulnerable* · Team Skuld

AI coding tools ship working apps in minutes, and the same flaws keep showing up: hard-coded keys, routes with no login check, raw request bodies passed into database queries, and outdated packages. Asking another LLM to "fix it" often swaps those bugs for broken syntax or deleted features.

SlopStop takes the opposite approach. It **scans**, applies **deterministic fixes** (no AI in the fix path), **verifies** every patch with `node --check` and a re-scan, and rejects anything that fails. It never writes to your files without your confirmation.

![SlopStop dashboard: scan results](docs/img/scan.png)

## Results

Measured by `node corpus/benchmark/run.js` on our 30-app corpus (25 apps with 56 planted flaws, 5 clean apps). The full method and caveats are in [docs/README.md](docs/README.md#6-official-benchmark-scorecard-from-resultsjson).

| | Target (problem statement) | SlopStop |
|---|---|---|
| Fewer critical + high findings | over 75% | **86%** (65 → 9) |
| Time per app (scan + fix + verify + re-scan) | under 1.5 s | **about 0.14 s** |
| Planted flaws found | | **56 / 56** |
| False alarms on clean apps | | **0** |
| Planted flaws auto-fixed | | **37 / 56** (all 14 secrets, all 12 auth, 11/12 injection) |
| Patches rejected by the verifier | | **0** |

The other 19 planted flaws (11 IDOR, 7 vulnerable dependencies, 1 string-built query) are **reported for human review by design**: fixing them needs business logic SlopStop will not guess.

**Compared with an existing scanner on the same apps** (`node corpus/baselines/run-all.js`):

| Tool | Planted flaws found | Fixes | Alarms on clean apps |
|---|---|---|---|
| **SlopStop** | **56 / 56** | 37 planted flaws auto-fixed | 0 |
| Semgrep 1.186 (JS, Express, NodeJsScan and secrets rulesets) | 12 / 56 | none (detection only) | 1 |

**Caveat:** the team wrote the corpus from the same list of flaw types the scanner targets, so expect lower numbers on real-world code.

## What it checks

| Flaw | Example | Auto-fix |
|---|---|---|
| Hard-coded secrets | `const KEY = "sk_live_..."`, passwords in DB URIs | ✅ moved to `.env` as `process.env.*` |
| NoSQL / SQL injection | `User.find(req.body)`, template-string SQL | ✅ inputs cast / parameterised |
| Unauthenticated routes | `app.get("/api/users", ...)` with no auth middleware | ✅ `requireAuth` added |
| Vulnerable dependencies | `jsonwebtoken@8.5.1` | Reported, upgrade suggested |
| IDOR / BOLA | `Order.findById(req.params.id)` with no ownership check | Reported for human review |

**Scope:** JavaScript/TypeScript Express backends. Other languages and frameworks, plus flaw types such as XSS and CSRF, are out of scope.

## Quick start

Requires Node.js 20+ and npm 10+.

```bash
npm install                 # from the repo root (npm workspaces)
npm start -w server         # API on http://127.0.0.1:3001
npm run dev -w web          # dashboard on http://localhost:5173 (second terminal)
```

Open the dashboard, pick a sample app, click **Scan code**, then **Fix automatically**. Without the API, set `VITE_USE_MOCK=true` in `web/.env` (see `web/.env.example`) to run on built-in sample data.

## The four stages

1. **Scan.** Deterministic AST (acorn) and pattern rules find the flaws above, each with a line number and a fix preview.
2. **Fix.** Template rewrites: secrets go to `.env` (values are never written anywhere), auth middleware is added and query inputs are cast. IDOR and dependencies are reported, never guessed.
3. **Verify.** Every patched file must pass `node --check` and a re-scan. A patch is rejected if it breaks syntax, leaves its target flaw, or introduces a new critical/high finding.
4. **Prove it.** The exploit demo sends the same unauthenticated request to an unprotected route (HTTP 200, data leaked) and the patched route (HTTP 401). The scorecard shows the benchmark.

![Verified patch preview](docs/img/fix.png)

## Other ways to run it

**Pre-commit hook** blocks commits that contain critical/high findings:
```bash
npx slopstop-init                       # install the hook
npx slopstop scan --staged --fix        # see verified fix proposals (never written to disk)
npx slopstop scan src/ --json           # scan files or folders
npx slopstop compare dirA/ dirB/        # compare two sets of apps
```

**GitHub Action** fails a PR on critical/high findings in changed files and posts verified fixes to the job summary:
```yaml
- uses: actions/checkout@v4
  with: { fetch-depth: 0 }
- uses: AlgoWanderer/tech-habba@main
```
This repo gates its own pull requests with it ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)). Intentional cases can be suppressed with `.slopstopignore` or `// slopstop-ignore <ruleId>: reason`, and suppressed findings are still listed.

**Prompt Hardener** (dashboard tab, or `POST /api/harden-prompt`) strips API keys, tokens and DB passwords from a prompt before it reaches an AI model, and prepends 7 security rules for the generated code.

## Repository layout

| Folder | What |
|---|---|
| `core/` | Scanner, fixers and prompt hardener (deterministic, no LLM) |
| `server/` | Express API, verifier (`node --check` + re-scan) and exploit sandbox |
| `cli/` | `slopstop` CLI and pre-commit hook installer |
| `web/` | React + Vite + Tailwind dashboard |
| `corpus/` | 30 test apps, ground truth, benchmark and baselines |
| `contract/` | Frozen API/data contract and samples |
| `docs/` | Detailed docs, demo script, limitations |

## Tests

```bash
npm test --workspaces --if-present      # core, server and cli test suites
node corpus/benchmark/run.js            # regenerate the benchmark numbers
```

## Limitations

- **IDOR/BOLA** and other business-logic flaws are reported, never auto-fixed.
- **Dependency checks** use a built-in advisory list, not the live npm advisory database.
- **The corpus** shares its flaw list with the scanner (see the caveat above). A held-out set of model-generated apps is being added in `corpus/wild/`.
- **The LLM-only fixer baseline** is not yet measured. Real model outputs are scored by `corpus/baselines/run-all.js` once saved.
