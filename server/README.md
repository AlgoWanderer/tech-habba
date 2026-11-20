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

## Tests

```
npm test -w server   # verifier, pipeline, contract conformance (24 tests)
npm test -w cli      # report formatting and diff (3 tests)
```

`server/test/contract.test.js` fails on any renamed, missing or extra contract field. Run it after
every change.
