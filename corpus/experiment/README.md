# Three-way experiment: rules vs AI only vs hybrid

## Hypothesis

> An LLM finds and fixes flaws that rules miss, but only a deterministic verifier makes its output safe to ship: rules + LLM + verifier (hybrid) finds more flaws than rules alone and breaks no apps, while the LLM alone breaks some.

## Method

**Arms**, all run on the same apps:

| Arm | Detection | Fixing | Verification |
|---|---|---|---|
| **Rules** | Deterministic rules (`core/`) | Template fixes | `node --check` + re-scan |
| **AI only** | Gemini reads the code (secrets masked) | Gemini rewrites each whole file (the "just ask an LLM" baseline) | **None** |
| **Hybrid** | Rules + Gemini; a rule finding wins on overlap | Rule fixes, then Gemini patches what the rules leave for review | All 6 checks: syntax, re-scan, real names, AI re-check, HTTP attack mode, HTTP normal mode. Rejected patches are never applied, and a rejected patch gets one retry with the verifier's reason |

**Sets:**

| Set | Apps | Ground truth | Notes |
|---|---|---|---|
| `corpus` | 30 | 56 planted flaws (`corpus/ground-truth.json`) | Team-written; shares its flaw list with the rules (upper bound) |
| `raw` | 10 | none | Gemini output from plain prompts (`corpus/wild/raw`) |
| `hardened` | 10 | none | Gemini output from Prompt-Hardener prompts (`corpus/wild/hardened`) |
| `dvna` | 1 (13 files) | 6 documented flaws in scope, 10 out of scope (`corpus/external/dvna-ground-truth.json`) | **Outside code**, never executed (no HTTP test) |

**Measures:**
- **Ground-truth flaws found:** same file and category, line within ±1, matched one-to-one.
- **Critical/high before and after:** re-scanned with the rules scanner as the judge.
- **Broken apps:** fails `node --check` or deleted a route.
- **AI patches applied/rejected:** hybrid only.
- **Time and model calls per app.**

AI arms run 2 times per app (mean and range reported), because model output varies. Run it with:
```
node corpus/experiment/run.js --sets corpus,raw,hardened,dvna --arms rules,ai,hybrid --runs 2
```
The model and date are recorded in `results.json` under `method`.

## Results

Run on 2026-11-21 with Gemini 3.1 Flash-Lite, falling back to 3.5 Flash-Lite and 3.5 Flash (recorded in `results.json`, `method.model`), 2 runs per AI arm. Numbers are means over the runs. Source: `results.json` → `bySet`.

**Corpus (30 apps, 56 planted flaws)**

| Arm | Flaws found | Critical + high | Apps broken | Model calls |
|---|---|---|---|---|
| Rules | 56 / 56 | 65 → 9 (−86.2%) | 0 | 0 |
| AI only | 37 / 56 (range 36–38) | 65 → 29.5 (−54.6%) | 0 | 94 |
| **Hybrid** | **56 / 56** | **65 → 0.5 (−99.2%)** | **0** | 88 |

**DVNA (outside code, 6 documented flaws in scope)**

| Arm | Flaws found | Critical + high |
|---|---|---|
| Rules | 1 / 6 | 13 → 7 (−46.2%) |
| AI only | 4 / 6 | 13 → 9.5 (−26.9%) |
| Hybrid | 3 / 6 | **13 → 5 (−61.5%)** |

**Gemini-written apps (no ground truth, judged by the rules re-scan)**

| Set | Critical + high in the generated code | After hybrid |
|---|---|---|
| raw prompts (10) | 41 | 2 |
| hardened prompts (10) | **15 (−63% vs raw)** | 0 |

**AI patches in hybrid mode:** corpus 21 applied / 0.5 rejected; raw 3 applied / 13 rejected; hardened 2.5 applied / 5 rejected; DVNA 5.5 applied / 0.5 rejected. A rejected patch is never applied.

**AI findings (hybrid, AI-only ones):** 5 across raw, hardened and DVNA, all labelled true (`labels.json`, labelled by role B with Claude). Precision 5/5, but this is a very small sample.

### Verdict on the hypothesis

- ✅ **Hybrid fixes more than rules alone:** −99.2% vs −86.2% critical/high on the corpus, and −61.5% vs −46.2% on DVNA.
- ✅ **Hybrid breaks no apps:** 0 broken in every set (syntax checks pass and no routes are deleted).
- ✅ **The LLM finds flaws the rules miss:** on DVNA, AI only finds 4/6 vs 1/6 for rules. It also found a Stripe secret key returned in an API response (raw/app03) that no rule catches.
- ❌ **"The LLM alone breaks some apps": not supported.** The AI-only arm broke 0 apps by our two measures (syntax and deleted routes). It fixed much less (−54.6% vs −99.2%) but did not break anything we measured. This is a negative result. We did not measure behaviour in the AI-only arm (no HTTP test there), so behavioural breakage is unmeasured, not shown to be zero.
- **Prompt Hardener:** Gemini code from hardened prompts had 63% fewer critical/high findings than code from raw prompts, but still not zero, so the gate is still needed.

## Where each arm fails

**Rules**
- **Built around the corpus:** 56/56 there, but only **1/6 on DVNA**.
- **Missed on DVNA:**
  - command injection (`exec`): no rule for it
  - a short session secret (`'keyboard cat'`): too little entropy to be caught
  - a missing **admin role** check: the rules only check that some login check exists
  - IDOR via `req.body.id`: the rule only follows `req.params`
  - `mathjs 3.10.1`: not on the built-in advisory list
- **False alarms on DVNA:** public routes (`/forgotpw`, `/resetpw`) are flagged as missing auth, and Sequelize queries are labelled "MongoDB operator injection".

**AI only**
- **Misses about a third of the planted flaws** (37/56).
- **Fixes much less:** −54.6% critical/high on the corpus.
- **Nondeterministic:** 36–38 flaws found across runs.
- **Expensive:** about 4.7 s per app, and 52 model calls on DVNA alone.

**Hybrid**
- **"Rule wins" merge hides correct AI findings.** On DVNA, the rule's wrong label ("MongoDB injection") on the `req.body.id` lookup keeps the AI's correct IDOR finding out, so hybrid finds 3/6 vs AI only's 4/6. Merging by line instead of by line *and* category is future work.
- **Line-tolerant matching undercounts.** The AI's IDOR finding sits on line 147, but the label is on 145, outside the ±1 tolerance, so it is not counted (`labels.json`).
- **The verifier rejected most AI patches on real Gemini apps** (13 of 16 on raw). That is safe, but it means fewer automatic fixes there.
- **Slow on large inputs:** about 2 minutes and 96 calls for DVNA.

**Outside our scope:** XSS, XXE, CSRF, open redirect, insecure deserialization, weak reset tokens (DVNA `outOfScope`). The AI flagged two of these (deserialization, the `mathjs.eval` sink), but they are not counted.
