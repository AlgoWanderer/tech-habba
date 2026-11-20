# Phase 2: AI + verifier

Adds an LLM (Gemini) to SlopStop as a **measured part of the method**: an AI detector, an AI patcher, our existing verifier as the safety net, and a three-way experiment (rules only vs AI only vs hybrid). This is what Track 03's rules ask for: a hypothesis, a baseline comparison and a failure analysis.

## How to use these prompts

1. Each person opens **their own file** (`PROMPT-A.md` … `PROMPT-D.md`) and pastes the **whole file** into their model (Claude or Gemini). Each file already contains the shared context, so nothing else is needed.
2. Do the steps **in order**. Each step says what it waits for.
3. Open a PR into `dev` after each step and tell the next person when it is merged.

## Order of work

| Wave | A (contract/, core/) | B (server/, cli/) | C (corpus/) | D (web/, docs/) |
|---|---|---|---|---|
| **0** | | Arnav puts `GEMINI_API_KEY` in `server/.env` | | |
| **1** (parallel) | A1: contract fields, `maskSecrets`, `mergeFindings` | B1: Gemini client, AI detector, AI patcher (tests use a fake model) | C1: raw Gemini apps (#19), experiment harness | D1: mode switch, AI badges, AI patch results (mock data) |
| **2** (after A1 + B1) | A2: failure analysis | B2: modes in `/api/scan` and `/api/fix`, `/api/experiment` | C2: run the experiment, hand-label AI findings | D2: test against the live API |
| **3** | | B3: README numbers | C3: experiment write-up | D3: scorecard card, demo script, slides |

**Rules for everyone:** edit only your own folders; no new npm dependencies; never commit or paste the API key; tests and CI stay green; numbers in docs come only from `results.json` files.

`_parts/` holds the pieces these files are built from. To change a prompt, edit the part, then rebuild (Git Bash, from `prompts/phase2-ai`):
```bash
for r in A B C D; do cat _parts/CONTEXT.md <(echo) _parts/$r.md > PROMPT-$r.md; done
```
