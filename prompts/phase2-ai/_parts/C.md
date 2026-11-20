=== YOUR ROLE: C (corpus/) ===
You own the test apps and the experiment, which is the "AI research" result the judges score.

STEP C1 (Wave 1, start now, about 1.5 hours). Branch: feat/c-ai
1. FIRST, finish issue #19: the raw Gemini apps. Follow corpus/wild/README.md: the 10 prompts,
   a fresh Gemini chat each, the same model D used (corpus/wild/MODEL.txt), code saved UNEDITED to
   corpus/wild/raw/app01..app10/index.js. Do not create package.json files by script; only save
   one if Gemini wrote it.
2. Create corpus/experiment/run.js, a skeleton for now. It must:
   - take the app sets: corpus/apps (30, with ground truth in corpus/ground-truth.json),
     corpus/wild/raw (10) and corpus/wild/hardened (10)
   - for each app run three ARMS, each wrapped in a function so B's AI code plugs in later:
       RULES:  runScan + runFix from server/pipeline.js (exists today)
       AI:     aiDetect (detection) + a whole-file LLM rewrite (the prompt in
               corpus/baselines/run-all.js, LLM_SYSTEM_PROMPT), with NO verifier
       HYBRID: scan mode "hybrid" + fix mode "hybrid" (B2)
   - record per app and arm: findings count, ground-truth flaws found (corpus apps: same matching
     as corpus/benchmark/run.js), critical/high before and after (re-scan with the RULES scanner as
     the judge), whether the fixed code passes node --check, routes before/after (deleted routes),
     AI patches applied/rejected, time in ms, number of model calls
   - repeat the AI and HYBRID arms 3 times (--runs 3) and report the mean and the min-max range
   - write corpus/experiment/results.json { method, summary per arm, perApp }
   - flags: --sets corpus,raw,hardened  --runs 3  --arms rules,ai,hybrid ; skip AI arms with a
     clear message when there is no GEMINI_API_KEY
   B2 is already done: use scanWithMode / fixHybrid / getAiClient from server/ai/ (see STATUS in
   the shared context). For the AI arm's whole-file rewrite, call client.generateJson with the
   prompt from corpus/baselines/run-all.js and a schema {type:'OBJECT', properties:{code:{type:'STRING'}}}.
   Mask secrets first with maskForModel from server/ai/mask.js; never send real secret values.
   Without a key, the AI arms print "skipped: no GEMINI_API_KEY" and RULES still runs end to end.
3. PR into dev: "corpus: raw wild apps + experiment harness".

STEP C2 (Wave 2, after B2 is merged, about 1 hour)
1. Arnav's laptop has the key in server/.env. Run: node corpus/experiment/run.js --runs 3
   (expect a few minutes; on 429 rate-limit errors, wait and re-run, since the harness should
   resume or skip finished apps).
2. Hand-check the AI findings on the 20 wild apps: corpus/experiment/labels.json, one entry per
   AI finding {app, findingId, verdict: "true" | "false" | "unsure", note}. A finding is "true"
   only if you can point to the exact line and say how an attacker uses it.
3. Add precision of AI findings (true / (true + false)) to the summary. PR into dev.

STEP C3 (Wave 3): corpus/experiment/README.md, one page: the hypothesis sentence, the method
(apps, arms, runs, model, date), the results table, and where each arm fails (with A's notes).
Report negative results honestly; the track rules say a properly measured negative result counts.
