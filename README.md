# SlopStop

**A pre-ship security gate and verified auto-patcher for AI-generated ("vibe-coded") Node.js / Express / MongoDB apps.**

Track 03 · R1 *Vibe-coded and vulnerable* · Team Skuld

AI coding tools ship working apps in minutes, and the same flaws keep showing up: hard-coded keys, routes with no login check, raw request bodies passed into database queries, and outdated packages. Asking another LLM to "fix it" often swaps those bugs for broken syntax or deleted features.

SlopStop **scans**, **fixes** and **verifies** before anything ships. **Rules mode** is fully deterministic. **Hybrid mode** adds an LLM to find and fix what the rules miss: **QwenSkuld**, our fine-tuned Qwen2.5-Coder-1.5B running offline through Ollama. Every AI fix must pass six checks the model does not control, including a real HTTP attack test, and anything that fails is rejected. **AI proposes, deterministic code proves.** SlopStop never writes to your files without your confirmation.

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

**Caveat:** the team wrote the corpus from the same list of flaw types the scanner targets, so expect lower numbers on real-world code. The outside test below confirms this.

## AI + verifier: the experiment

**Hypothesis:** an LLM finds and fixes flaws that rules miss, but only a deterministic verifier makes its output safe to ship.

**Experiment:** three arms run on the same 51 apps: the 30 corpus apps, 20 AI-generated apps (10 from raw prompts, 10 from hardened prompts) and DVNA.

| Arm | What it does |
|---|---|
| **Rules** | The deterministic engine |
| **AI only** | QwenSkuld detects flaws, then rewrites each file, with no verification |
| **Hybrid** | Rules plus QwenSkuld; every AI patch must pass six checks |

The six checks are: `node --check`, a rule re-scan, real names only, an independent AI re-check, **HTTP attack mode** (the exploit must be blocked) and **HTTP normal mode** (the real user must still get through).

QwenSkuld running locally in Ollama, 1 run. Results: [`corpus/experiment/results-qwenskuld.json`](corpus/experiment/results-qwenskuld.json) and [`results-qwenskuld-dvna.json`](corpus/experiment/results-qwenskuld-dvna.json); method and failure analysis: [corpus/experiment/README.md](corpus/experiment/README.md).

| | Rules | AI only | **Hybrid** |
|---|---|---|---|
| Corpus (30 apps): planted flaws found | 56/56 | 19/56 | **56/56** |
| Corpus: critical/high removed | 86% (65 → 9) | 29% (65 → 46) | **86%** (65 → 9) |
| AI-generated apps (raw prompts): critical/high removed | 95% (41 → 2) | 27% (41 → 30) | **98%** (41 → 1) |
| **DVNA** (outside app we did not write): documented flaws found | 1/6 | 1/6 | 1/6 |
| **Apps broken** (syntax errors or deleted routes) | 0 | **8 of 51** (35 routes deleted) | **0** |
| AI patches rejected by the verifier | | | **28 of 46 (61%)** |

- **The AI alone breaks apps.** QwenSkuld rewriting files with no checks broke 8 of 51 apps and deleted 35 routes, including DVNA, which it no longer parsed.
- **The verifier makes it safe.** In Hybrid the verifier rejected 61% of QwenSkuld's patches and **no app broke**. On the AI-generated apps it rejected 12 of 14. In live testing it caught an ownership check that compiled and passed the re-scan but locked users out of their own records; only the HTTP normal-mode test caught it.
- **Hybrid matches the rules on our corpus and does slightly better on AI-generated apps** (41 → 1 vs 41 → 2), but does not yet find more flaws than the rules on outside code: on DVNA all three arms found 1 of 6. QwenSkuld's recall is the weak point (see the model comparison below).
- **Prompt Hardener:** AI-generated code from hardened prompts had **63% fewer** critical/high findings than from raw prompts (15 vs 41).
- **Small sample:** 1 run on one laptop. AI output varies between runs.

**Fine-tuning an open model: QwenSkuld** ([training/README.md](training/README.md)). We trained our own model so it learns our exact task and the code never leaves the machine. We fine-tuned **Qwen2.5-Coder-1.5B** with LoRA on vulnerable/secure JavaScript pairs from CyberNative/Code_Vulnerability_Security_DPO and SecureCodePairs (comments stripped, so the model reads code, not hints). Training took **5.4 minutes on a laptop RTX 4060** and the model runs locally via Ollama as **QwenSkuld** (`slopstop-qwen` in the training scripts).

**Model comparison** (`node server/eval/models.js`): each model sees the same task it was trained on (snippet → vulnerable? + category). There are 122 labelled snippets (61 vulnerable) from the 30 corpus apps and DVNA, and none of these apps were in the training data.

Both Qwen rows are like-for-like: 8-bit, the same code-only input as in training, and the same output-length cap. Invalid answers are never dropped. One on a vulnerable snippet counts as a miss, and every invalid answer counts as wrong in accuracy.

| Model | Accuracy | Precision | Recall | F1 | Category correct | Invalid answers | Time per snippet |
|---|---|---|---|---|---|---|---|
| Rules | **95%** | 0.94 | **0.97** | **0.95** | 0.81 | 0 | instant |
| Qwen2.5-Coder-1.5B, base (local) | 44% | 0.55 | 0.59 | 0.57 | 0.28 | 36 of 122 | 2.6 s |
| **QwenSkuld** (Qwen2.5-Coder-1.5B fine-tuned, local) | **66%** | 0.72 | 0.54 | **0.62** | **0.70** | **0** | 0.6 s |

- **Fine-tuning made the small model usable** on apps it never saw:
  - accuracy rose from 44% to 66%
  - correct categories rose from 28% to 70%
  - invalid answers fell from 36 to 0
  - it answers about 4× faster than the base model
- **The gain is smaller than on the training validation set** (85% there vs 66% here). The corpus apps are different code from the training data, and recall is still low (0.54).
- **Recall fell from 0.74 to 0.54** once the `File: <path>` line was removed from the prompt so the input matched the training format exactly. The file name was apparently giving the model useful context. The training data was also skewed: 260 injection, 37 IDOR, 6 auth, 3 secret and 0 dependency examples.
- **The rules still lead on this corpus** (95%), because they were built from its flaw list. That is why the product is rules first, AI for what rules cannot express, and every AI fix verified.
- **Measurement note:** an earlier version of this table showed base F1 0.09 vs fine-tuned 0.75. That comparison was not like-for-like (a 4-bit base, and an extra file-name header in the input), and the scorer dropped invalid answers. Role A caught both; the numbers above are the corrected ones.

### Why QwenSkuld: our own fine-tuned model

| | **QwenSkuld** |
|---|---|
| Trained for this task | Open weights, LoRA fine-tuned on vulnerable/fixed code pairs, answers in the exact JSON the pipeline needs |
| Privacy | **Code never leaves the laptop**: runs offline in Ollama |
| Speed | **0.6 s** per snippet |
| Cost | **Free** to run, after a 5.4-minute training run |
| Hardware | A laptop RTX 4060 (8 GB); the model is 1.6 GB |

**What fine-tuning bought us** (122 snippets from 31 apps it never saw, same base model before and after):
- **Accuracy 44% → 66%** (+22 points), and the correct flaw category 28% → 70%.
- **Unusable answers 36 → 0.** It always answers in the JSON format the pipeline expects, so every reply can be checked.
- **On held-out training-style pairs: 54% → 85%** accuracy, with false alarms on safe code down from 9/34 to 3/34.
- **Proven which model runs:** the served model is tied to its weights file by hash (see the fingerprint below).

**Why it is safe to use a smaller model:** QwenSkuld never acts alone. The rules run first, its findings are always "review", and every patch it proposes must pass the verifier, including a live attack and a real-user check. In the 51-app experiment above (1 run), QwenSkuld on its own broke 8 apps. With the verifier in front of it, the verifier rejected 61% of its patches and **0 apps broke**.

**The honest trade-off:** the rules are still more accurate on our corpus (95% vs 66%), and QwenSkuld's recall is its weak point. That is why it sits behind the rules and every patch it proposes is verified. Next step: retrain on full AI-generated apps with more auth, secret and dependency examples, which it barely saw in training.

### QwenSkuld blueprint (how it is built)

All values come from `training/train.py`, `training/Modelfile`, `training/Modelfile.qwenskuld`, the training run's `training/out/metrics.json` and the adapter file itself.

| Part | Value |
|---|---|
| Base model | `Qwen/Qwen2.5-Coder-1.5B-Instruct` (about 1.5 billion parameters) |
| Method | LoRA (PEFT) in bf16. The base weights are frozen and only a small adapter is trained. Loss is computed on the assistant's JSON answer only. |
| LoRA settings | rank 16, alpha 16, dropout 0, on all attention and MLP projections (`q,k,v,o,gate,up,down`). That is **18,464,768** trainable parameters (counted in the saved adapter, `adapter_model.safetensors`), roughly 1.2% of the model. |
| Data | 612 training and 68 validation examples: vulnerable/secure JavaScript pairs from CyberNative/Code_Vulnerability_Security_DPO and SecureCodePairs, with comments stripped |
| Training | 2 epochs, learning rate 2e-4 (linear, 10 warm-up steps), batch 2 × 4 gradient accumulation, max length 2048, seed 42 |
| Hardware and time | NVIDIA RTX 4060 Laptop GPU (8 GB), **5.4 minutes** |
| Loss | train 1.29 → 0.16; validation 0.272 → 0.245 |
| Packaging | The adapter is merged into the base model, converted to GGUF (8-bit, `q8_0`) with llama.cpp, then imported into Ollama: as `slopstop-qwen` from `training/Modelfile`, and as **QwenSkuld** from `training/Modelfile.qwenskuld` (same GGUF) |
| Runtime settings | temperature 0.1 and a fixed system prompt. **QwenSkuld** (what the server uses) allows up to 4096 output tokens with an 8192-token context, so the AI patcher can return whole files. The 122-snippet evaluation used `slopstop-qwen`: the same weights, capped at 256 output tokens. |
| Task (input → output) | code snippet → `{"vulnerable": bool, "category": "secret\|injection\|auth\|idor\|dependency\|none", "reason": string}` |

### QwenSkuld fingerprint (proof of which model is running)

A model's fingerprint is the hash of its weights. Changing even one weight changes it, so it shows that the fine-tuned model is the one answering, not the base Qwen or another model.

- **The server says which model it uses.** `GET /api/health` returns `aiModel`: `ollama:QwenSkuld` for the fine-tuned model.
- **Ollama's ID:** `ollama list` shows an ID for `QwenSkuld` that differs from the base `qwen-base-q8`. The ID also covers the settings, so `QwenSkuld` and `slopstop-qwen` have different IDs even though the weights are identical. `ollama show QwenSkuld --modelfile` prints the exact recipe (it should match `training/Modelfile.qwenskuld`).
- **The weights file:** `certutil -hashfile training\out\gguf\slopstop-qwen-q8_0.gguf SHA256` on Windows, or `sha256sum` on Linux/macOS. The base model's GGUF gives a different hash.
- **The link between the two:** Ollama stores the imported GGUF under its SHA-256. `ollama show QwenSkuld --modelfile` prints `FROM …\blobs\sha256-c292045f…`, the same hash as `slopstop-qwen-q8_0.gguf` below, so the model answering is provably built from that file.
- **Behaviour:** on the 122 evaluation snippets the base model gives 36 invalid answers and QwenSkuld gives 0 (table above), which is a quick behavioural check.

The weights and the GGUF are git-ignored (too large for the repo). Measured on the training laptop (Ollama 0.40.16):

| | Ollama ID | SHA-256 of the GGUF |
|---|---|---|
| **QwenSkuld** (served; 4096 output tokens) | `7d93937e52e2` | `C292045F8E822F7E3AE9709625DEAAB1C1E7BC64547EF4F01376BCD30C3FE015` |
| `slopstop-qwen` (evaluation; 256 output tokens) | `e4096e45da06` | same file as QwenSkuld |
| `qwen-base-q8` (base model) | `8185ec8a66ee` | `5EF260AA72C9692D664982923DD66EE8D91E7BA325099967FF8CFA496976D1CE` |

## What it checks

| Flaw | Example | Auto-fix |
|---|---|---|
| Hard-coded secrets | `const KEY = "sk_live_..."`, passwords in DB URIs | ✅ moved to `.env` as `process.env.*` |
| NoSQL / SQL injection | `User.find(req.body)`, template-string SQL | ✅ simple cases (field values cast, simple SQL parameterised); whole-filter, `$where` and `LIKE` patterns are reported for review |
| Unauthenticated routes | `app.get("/api/users", ...)` or `router.get(...)` with no auth middleware | ✅ `requireAuth` added |
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

**Hybrid mode with QwenSkuld (offline).** Build the model as in [training/README.md](training/README.md#ollama) (`cd training && ollama create QwenSkuld -f Modelfile.qwenskuld`), then start the API with:

```bash
AI_PROVIDER=ollama OLLAMA_MODEL=QwenSkuld npm start -w server   # OLLAMA_URL defaults to http://localhost:11434
```

Or put `OLLAMA_MODEL=QwenSkuld` in `server/.env` once and just run `npm start -w server`. QwenSkuld is the only AI model the product uses; without it, Rules mode still works and the AI modes report "AI not configured". To use QwenSkuld running on a teammate's laptop, set `OLLAMA_URL=http://<their-ip>:11434` (their Ollama must listen on the network: `OLLAMA_HOST=0.0.0.0`).

`GET /api/health` shows which model is active. Example apps to try (two that pass, one that fails, and the demo apps) are in [examples/](examples/README.md).

## The dashboard: a three-stage security gate

In Hybrid mode the **Security Gate** tab runs the code through three animated stages, with a live activity log:

1. **Static rules.** The deterministic engine; secrets are masked (`maskSecrets`) before any model sees the code.
2. **QwenSkuld.** The fine-tuned model looks for what the rules cannot express (for example IDOR). Its findings are always "review".
3. **Live HTTP test.** **Auto-fix & HTTP verify** patches the app, runs it in a sandbox and attacks it: each exploit must go from 200 to 401 while a logged-in user still gets 200.

The ship gate then shows **Blocked**, **Needs review** or **Ready to ship**. The **Scorecard** tab mirrors the same three stages and adds a **Why QwenSkuld** chart (QwenSkuld's accuracy on 122 unseen snippets compared with the rules and the base Qwen, with where it is *not* better).

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

**Prompt Hardener** (`POST /api/harden-prompt`; removed from the dashboard to keep the demo on the gate) strips API keys, tokens and DB passwords from a prompt before it reaches an AI model, and prepends 7 security rules for the generated code.

## Repository layout

| Folder | What |
|---|---|
| `core/` | Scanner, fixers and prompt hardener (deterministic, no LLM) |
| `server/` | Express API, verifier (`node --check` + re-scan) and exploit sandbox |
| `cli/` | `slopstop` CLI and pre-commit hook installer |
| `web/` | React + Vite + Tailwind dashboard (three-stage gate, scorecard) |
| `training/` | Fine-tuning scripts for QwenSkuld (data and weights are git-ignored) |
| `examples/` | Deliberately vulnerable apps for trying the gate |
| `corpus/` | 30 test apps, ground truth, benchmark and baselines |
| `contract/` | Frozen API/data contract and samples |
| `docs/` | Detailed docs, demo script, limitations |

## Tests

```bash
npm test --workspaces --if-present      # core, server and cli test suites
node corpus/benchmark/run.js            # regenerate the benchmark numbers
```

## Limitations

- **IDOR/BOLA** and other business-logic flaws are never auto-fixed by rules. In Hybrid mode the AI may fix them, and the fix is applied only if the HTTP test proves strangers are refused and the owner still gets their data.
- **The rules miss what they were not built for:** on DVNA they missed command injection, a low-entropy session secret, a missing admin-role check, IDOR via `req.body.id` and `mathjs`.
- **Node 25+:** the HTTP-test sandbox uses Node's permission model, so it now also passes `--allow-net` when the runtime supports it (the app under test still only reads its own sandbox folder). Without that flag the test silently never ran on newer Node versions.
- **The HTTP test** covers missing auth, IDOR and NoSQL injection in apps the sandbox can run (mongoose and JWT stubs). Anything else is reported as not testable. It runs the submitted code locally, so the API must stay local-only.
- **AI output varies between runs**, so the experiment reports means and ranges. QwenSkuld can also raise false positives (see `examples/pass-2-notes-app.js`) and its fixes for IDOR are sometimes rejected; only HTTP-proven fixes carry an attack proof.
- **Not detected by either layer:** path traversal and command injection via `exec()` (QwenSkuld sometimes flags `exec`, but cannot yet produce an accepted fix). See `examples/fail-converter-app.js`.
- **Custom auth middleware** is recognised by name patterns (e.g. `requireAuth`, `protect`, `verifyJwt`, `checkToken`) or by an inline 401/403 check in the handler. A route protected by a check with an unusual name can be reported as unauthenticated. Review the proposed patch before applying it.
- **Dependency checks** use a built-in advisory list, not the live npm advisory database.
- **The corpus** shares its flaw list with the scanner (see the caveat above), which is why we also test on DVNA and on 20 AI-generated apps.
