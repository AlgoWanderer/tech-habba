# Failure analysis: rules vs AI vs hybrid (Phase 2, step A2)

Source: `results.json` (51 apps: 30 team corpus, 10 raw and 10 hardened Gemini apps, DVNA; **2 runs
per AI arm**, so AI numbers are means and can end in .5), `labels.json`, `ai-findings.json`,
`../ground-truth.json`, `../external/dvna-ground-truth.json`. Every number below is from those files
or from re-running the rules engine on DVNA's committed code.

## 1. Headline

| Arm | Planted flaws found (corpus) | Critical/high, all 51 apps | Apps broken* | Time per app |
|---|---|---|---|---|
| Rules | **56/56** | 134 -> 18 (86.6%) | 0 | 0.12 s |
| AI only | 37/56 (66%) | 134 -> 52 (61.2%) | 0 | 6.4 s |
| Hybrid | **56/56** | 134 -> **7.5 (94.4%)** | 0 | 8.2 s |

\*Broken = a patched file fails `node --check` or loses a route. See section 6 for what this does not cover.

All three arms report **0 findings on the 5 clean apps** (app26-app30), in both runs.

## 2. Where the AI alone fails: 19 of 56 planted flaws missed

- The misses are spread over 18 of the 25 flawed apps. Rules, and therefore hybrid, find every one of them.
- **All 7 apps with a planted dependency flaw are among the misses** (app02, 05, 08, 12, 15, 20, 25).
  This is structural: a vulnerable version lives in `package.json` and needs CVE knowledge, not
  code reading. The rule (advisory list / npm audit) is the right tool.
- The other misses fall in apps mixing secret, auth, IDOR and injection flaws. `results.json` stores
  counts per app, not which flaw was missed, so we cannot attribute them further. Worst case:
  app12, 0 of 2 found in both runs.
- Run-to-run variance: in 2 apps (app10, app19) the two AI runs found a different number of planted
  flaws. In 6 of 51 apps the AI reported a different number of findings between runs.

## 3. Wrong AI findings: none observed, but the sample is too small to claim precision

- Only **5** AI findings survived merging in hybrid mode (an AI finding on the same file + category,
  within 1 line of a rule finding, is dropped). All 5 were labelled **true**: raw/app03 (secret
  returned to the client in JSON) and 4 in DVNA.
- **Caveat:** the labels were made by role B with Claude, not by an independent human reviewer, and
  5 is far too few to state an AI precision.
- No false alarms on the clean apps.

## 4. What both miss: DVNA, the outside app nobody tuned on

DVNA has 6 documented flaws. Found: rules **1/6**, AI only **4/6**, hybrid **3/6**.

| DVNA flaw | Rules | Why the rules miss it | AI (hand-labelled hybrid AI finding) |
|---|---|---|---|
| SQL injection `core/appHandler.js:10` | found | | |
| Command injection `exec('ping ' + req.body.address)` `:39` | missed | no `child_process.exec` rule | **found** (labelled true) |
| Session secret `'keyboard cat'` `server.js:24` | missed | the secret rule skips values containing spaces | |
| Admin role not checked `routes/app.js:42` | missed | authorisation logic; the rule only checks that a login check exists | |
| IDOR via `req.body.id` `core/appHandler.js:145` | missed | the IDOR rule only looks at `:id` URL parameters | **found** at line 147 (labelled true) |
| mathjs 3.10.1 `package.json:25` | missed | not in the built-in advisory list (npm audit would catch it) | |

- Hybrid still leaves **5 critical/high** on DVNA. The AI-only arm left 6 in one run and 13 in the
  other, which shows how much a single model run varies on unfamiliar code.
- **Hybrid found fewer DVNA flaws than AI only (3 vs 4).** The saved data cannot tell us which flaw
  was lost. Two candidates: run variance, or the merge rule dropping an AI finding next to a rule
  finding of the same category. This needs per-finding output to confirm.
- The rule gaps above are concrete and fixable in `core/`. They were **not** fixed before the demo,
  so the published numbers stay valid.

## 5. What the verifier rejected

| Set (mean per run of 51 apps) | AI patches applied (hybrid) | Rejected by the verifier |
|---|---|---|
| Team corpus | 21 | 0.5 |
| Raw Gemini apps | 3 | **13** |
| Hardened Gemini apps | 2.5 | 5 |
| DVNA | 5.5 | 0.5 |
| **Total** | **32** | **19 (37% of attempts)** |

- 18 of the 19 rejections are on the Gemini-written apps. Their code is messier and larger than the
  team corpus, and the model's patches fail more often there.
- **Gap:** `results.json` stores rejection counts, not reasons. By the verifier's rules, a rejection
  means one of: the patch fails `node --check`, the target finding remains, a new critical/high
  appears, or a route is deleted. Saving the reason string per rejection is the first thing to add.

## 6. The verifier's own failure (found after the experiment)

In a pre-demo smoke test, hybrid mode AI-patched a **TypeScript** file:
- The "fix" replaced the whole file (imports, app, hard-coded key) with a single route.
- `node --check` only runs on `.js`, and the parser cannot read TypeScript.
- The re-scan saw the secret "gone", so the dashboard showed a **false safety 100**.

It was fixed in #44: only `.js/.mjs/.cjs` files that parse are AI-patched now, and a regression test
covers it. This is the clearest example that **a verifier is only as good as what it checks**.

## 7. Hypothesis check

> "rules + LLM + verifier (hybrid) finds more flaws than rules alone and breaks no apps, while the
> LLM alone breaks some."

- **Supported:** hybrid has the same recall as rules on the corpus (56/56), finds more on DVNA (3 vs
  1), has the best critical/high reduction (94.4% vs 86.6%), and breaks 0 apps.
- **Not supported:** "the LLM alone breaks some". The AI-only arm applied about 60 patches per full
  run (2 runs, 102 app-runs) with **0 syntax failures and 0 deleted routes**.
  - Breakage is measured narrowly (syntax plus route count). The two-mode HTTP behaviour test runs
    only in the hybrid arm, so behavioural breakage by the AI-only arm is unmeasured.
  - The measured cost of AI alone is **missed flaws** (66% recall), a smaller reduction (61%), and
    being about 54x slower than rules.
- **Suggested wording:** "AI alone misses a third of the flaws; rules miss what they were not written
  for; hybrid catches both, and the verifier rejected 37% of AI patches before they could ship."

## 8. Limits

- Only 2 runs per AI arm, so the means hide real variance (DVNA: 6 vs 13 critical/high left).
- The rules were built on the team corpus, which flatters the rules there. DVNA is the only outside
  app with ground truth.
- The raw and hardened Gemini apps have no ground truth, so only critical/high counts are reported
  for them.
- Only 5 hand-labelled AI findings, labelled with AI help.
