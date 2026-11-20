# SlopStop server and CLI (role B)

## Run the API

```
npm install          # once, at the repo root
npm start -w server  # http://localhost:3001
```

On startup it prints whether it is using the **real** engine (`core/index.js`) or **MOCK** data
(`contract/sample-*.json`). It switches automatically: no config change when role A's core lands.

| Env var | Default | Effect |
|---|---|---|
| `PORT` | `3001` | API port |
| `CORS_ORIGIN` | `http://localhost:5173,http://127.0.0.1:5173` | allowed dashboard origins |
| `SLOPSTOP_MOCK_CORE` | unset | `1` forces mock data even if core/ exists |
| `SLOPSTOP_CORE` | `core/index.js` | path to an alternative engine module |

## Endpoints (exactly as in the contract)

- `GET  /api/health` -> `{ok, mockCore, mockHardener}`
- `POST /api/scan` `{files:[{path,content}]}` -> `{findings, score}`
- `POST /api/fix` `{files, findingIds}` -> `{patched, envFile, results, rescan, timingMs}`
- `POST /api/exploit` `{}` -> `{before:{status,body}, after:{status,body}}`
- `POST /api/harden-prompt` `{prompt}` -> `{hardened, redactions, rules}`

Bad input returns `400 {error}`.

Extra, read-only (not in the frozen contract):
- `GET /api/benchmark` -> role C's `corpus/benchmark/results.json`, mapped to the dashboard's
  `BenchmarkMetric` shape (`web/src/types.ts`). Returns `404 {error}` until results exist. Missing
  numbers are omitted, never invented, so the scorecard can show "not measured".

## How /api/fix works

1. Fresh `scan()` of the submitted files. Unknown ids are `rejected`; `fixable: "review"` ids stay `review`.
2. `applyFixes()` on the auto-fixable findings.
3. `verify()` (server/verify.js) on every patched file: `node --check` (the code is never executed),
   then a re-scan. A patch is rejected if the syntax check fails, the targeted finding is still there,
   or a new critical/high finding appears. All findings in a rejected file become `rejected` with the reason.
4. Only accepted patches are returned, and the patched file set is re-scanned for `rescan`.

Nothing is ever written to the user's files.

## For role C (benchmark)

```js
import { loadCore } from '../../server/coreAdapter.js';
import { runScan, runFix } from '../../server/pipeline.js';
const core = await loadCore();
const before = await runScan(core, files);
const after = await runFix(core, files, before.findings.map((f) => f.id));
```

## Pre-commit hook (cli/)

```
npx slopstop-init               # install in the current git repo
npx slopstop-init --force       # replace an existing hook (it is backed up first)
npx slopstop-init --remove
npx slopstop scan --staged --fix   # show verified patches for staged files (never writes)
npx slopstop scan src/app.js       # scan files on disk
```

The hook blocks commits with critical/high findings. Bypass once with `git commit --no-verify`
or `SLOPSTOP_SKIP=1`. While core/ is not installed it allows every commit with a warning.

## AI modes (Phase 2)

Put `GEMINI_API_KEY=...` in `server/.env` (git-ignored; never commit it). Optional: `GEMINI_MODEL` (default `gemini-2.5-flash`). Without a key everything works as before and the AI modes return 400 "AI not configured". `GET /api/health` reports `ai: true|false`.

| Request | What runs |
|---|---|
| `POST /api/scan {files, mode:"rules"}` (default) | Deterministic rules, unchanged |
| `POST /api/scan {files, mode:"ai"}` | The model only (the "AI only" baseline) |
| `POST /api/scan {files, mode:"hybrid"}` | Rules + model; a rule finding wins over an overlapping AI finding |
| `POST /api/fix {files, findingIds, mode:"hybrid", aiFindings}` | Rule fixes as usual, then a model patch for every requested finding the rules left for review, each verified |

AI findings carry `source:"ai"`, `confidence` (0-1) and `fixable:"review"`, with ids like `ai-injection:index.js:15`. For a hybrid fix, send back the AI findings from the hybrid scan as `aiFindings`: model output varies between calls, so the server re-checks the ones you send (their snippet must still be in the code) instead of asking again.

**Safety gates on the model** (`server/ai/`):
- **Privacy:** secrets found by the rules are masked (`<REDACTED_SECRET_n>`) before any code is sent. The key is sent only in a header, never logged.
- **Detector output is untrusted:** unknown files, out-of-range lines and confidence below 0.5 are dropped, and snippets come from the real file.
- **Every AI patch must pass:** no masked placeholder in the output, no deleted route, `node --check`, a rule re-scan (target gone, nothing new critical/high), and for AI-found flaws an independent re-check by the model. Anything else is reported as `rejected` with the reason and never applied. At most 10 AI patches per request.

CLI: `npx slopstop scan <files> --ai` runs hybrid detection and marks AI findings `[AI 82%]`; `--fix` stays rules-only.

## Tests

```
npm test -w server   # verifier, pipeline, contract conformance (24 tests)
npm test -w cli      # report formatting and diff (3 tests)
```

`server/test/contract.test.js` fails on any renamed, missing or extra contract field. Run it after
every change.
