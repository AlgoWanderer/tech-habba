# SlopStop: Pitch Deck & Judge Defense Guide

> **Track 03:** AI Research | **Round 1:** Vibe-Coded and Vulnerable  
> **Team Skuld (Role D: Dashboard & Pitch)**  
> **Research Question:** *"Does an LLM find and fix flaws that rules miss, and does a deterministic verifier make its output safer to ship? We compared Rules vs. AI Only vs. Hybrid across 51 apps."*

---

## Slide 1: Title & The Core Problem
* **Headline:** Stop Shipping Vibe-Coded Slop.
* **Problem:** AI tools (Cursor, v0, Copilot, ChatGPT) allow non-experts to vibe-code full-stack web applications in minutes. But the output is notoriously insecure:
  - Hardcoded live credentials (Stripe keys, DB connection strings with cleartext passwords).
  - Unauthenticated Express endpoints exposing entire databases.
  - NoSQL injection sinks passing raw query objects into MongoDB.
* **The Trap:** Existing "AI fixers" rewrite code with **no verification**: nothing guarantees the fix actually blocks the attack or that nothing else broke.
* **Our Core Thesis:** **AI proposes, deterministic code proves.**

---

## Slide 2: The Core Innovation: The 6-Stage Verifier
### *Judge Question 1: "How do you verify if the AI is wrong?"*
When our AI model (**QwenSkuld**, fine-tuned Qwen2.5-Coder-1.5B running locally in Ollama) proposes a patch for a security flaw, **it is never trusted blind**. Each AI patch must pass up to six automated checks before the developer sees it (the independent re-check runs for AI-found flaws; the HTTP tests run where the app can be started, not on DVNA):

1. **Syntax Check (`node --check`)**: Executes native V8 parsing in a sandbox. If the LLM dropped a closing brace, comma, or tag, the patch is discarded immediately.
2. **Deterministic Re-Scan**: The modified file is re-scanned with Acorn AST rules. If the patch failed to remove the target vulnerability or introduced any new Critical/High vulnerability, it is rejected.
3. **Structure & Real-Names Check**: Verifies that the patch only references identifiers, models, and middleware that actually exist in the file's AST scope.
   - *Why it exists:* a patch can pass `node --check` yet reference a `req.X` property or schema field the app never defines, which would break the app at runtime. This check rejects it.
   - *Measured:* across the experiment, the verifier rejected **28 of 46 QwenSkuld patches (61%)**, 12 of 14 on the AI-generated apps (`corpus/experiment/results-qwenskuld.json`).
4. **Independent AI Re-Check**: An independent model prompt verifies that the flaw was genuinely mitigated without logic regression.
5. **HTTP Attack Mode (Attacks Blocked)**: Automated sandboxed HTTP probe sends the known exploit vector (e.g. NoSQL operator injection or unauthenticated fetch). Result must change from `HTTP 200 Exfiltrated` to `HTTP 401/403/400 Blocked`.
6. **HTTP Normal Mode (Real Users Still Work)**: Normal user requests with valid credentials are sent to ensure business logic remains operational and routes were not deleted.

**Result:** If a patch fails any of these checks, it is marked **RED "Rejected"** and discarded. The verifier is the safety net that makes AI output safer to ship. It is only as good as what it checks: before #44, a TypeScript file could slip past `node --check` (see `FAILURES.md`, section 6), and that hole is now closed.

---

## Slide 3: Why Not Rules Alone or AI Alone? The 3-Way Experiment
### *Judge Question 2: "What is the innovation if you just use AI?"*
"A submission that only sends prompts to a hosted model and shows the reply is not accepted."  
SlopStop is not an AI wrapper; it is a **measured hybrid system**. We evaluated three paradigms across 51 applications (30 corpus apps, 10 raw AI apps, 10 hardened AI apps, 1 external DVNA suite), with QwenSkuld as the AI (1 run, `results-qwenskuld.json`):

#### Corpus Benchmark (30 apps, 56 planted flaws)
| Arm | Flaws Found | Critical + High | Apps Broken | Verification | Model Calls |
|---|:---:|:---:|:---:|:---:|:---:|
| **Rules Only** | 56 / 56 (100%) | 65 → 9 (−86.2%) | 0 | `node --check` + re-scan | 0 |
| **AI Only** | 19 / 56 (33.9%) | 65 → 46 (−29.2%) | **4** | None (unverified) | 60 |
| **Hybrid** | **56 / 56 (100%)** | **65 → 9 (−86.2%)** | **0** | **All 6 verification checks** | 62 |

#### DVNA (External Codebase, 6 documented in-scope flaws)
| Arm | Flaws Found | Critical + High Reduction | Notes |
|---|:---:|:---:|---|
| **Rules Only** | 1 / 6 (16.7%) | 13 → 7 (−46.2%) | Misses command injection, body IDOR, role auth |
| **AI Only** | 1 / 6 (16.7%) | 13 → 4 (−69.2%) | Unverified rewrites broke DVNA (it no longer parsed) |
| **Hybrid** | 1 / 6 (16.7%) | **13 → 6 (−53.8%)** | Only verified patches applied; nothing broken |

#### Prompt Hardener (AI-Generated Apps: Raw vs Hardened Prompts)
- **Raw prompts (10 apps):** 41 critical/high in generated code → 1 after hybrid.
- **Hardened prompts (10 apps):** **15 critical/high (−63% vs raw)** → 0 after hybrid.
- *Prompt Hardener produces 63% fewer vulnerabilities before code is even written; SlopStop eliminates the rest.*

#### Key Findings & Negative Result (Honest AI Research):
- **The AI alone breaks apps:** QwenSkuld rewriting files unchecked broke 8 of 51 apps (35 routes deleted), including DVNA.
- **The verifier makes it safe:** in Hybrid it rejected 61% of QwenSkuld's patches and **0 apps broke**.
- **Hybrid matches the rules on the corpus (86.2%) and is slightly better on AI-generated apps** (41 → 1 vs 41 → 2), with every AI fix verified.
- **Negative result (honest):** on DVNA all three arms found 1 of 6, so with QwenSkuld "AI finds what rules miss" is not shown yet. Recall is the model's weak point.

---

## Slide 4: AI Model & Fine-Tuning
### *Judge Question 3: "Did you train or fine-tune on datasets?"*
* **Production AI Model:** **QwenSkuld**, our fine-tuned Qwen2.5-Coder-1.5B, served locally by Ollama. Code never leaves the machine.
* **Privacy Gate:** before any code is sent to the model, core's `maskSecrets` replaces every secret the scanner recognises, plus known key formats (Stripe, OpenAI, AWS, GitHub, database URLs with passwords, private keys), with `<REDACTED_SECRET_n>` tokens, keeping line numbers intact. A secret in a shape the scanner does not recognise is not masked. (The Prompt Hardener is separate: it redacts secrets from prompts *before* code is generated.)
* **Fine-Tuning (done, `training/README.md`):**
  - Fine-tuned **Qwen2.5-Coder-1.5B** with LoRA on 612 examples (306 vulnerable/fixed pairs) from public datasets (CyberNative, SecureCodePairs). Comments were stripped so it reads code, not hints. **5.4 minutes on a laptop RTX 4060**; runs locally in Ollama.
  - On 122 snippets from 31 apps it never saw (`server/eval/model-eval-qwen.json`, invalid answers count as wrong):

    | Model | Accuracy | Category correct | Invalid answers |
    |---|:---:|:---:|:---:|
    | Rules | **95%** | 0.81 | 0 |
    | Qwen 1.5B, base | 44% | 0.28 | 36 of 122 |
    | Qwen 1.5B, fine-tuned | **66%** | **0.70** | **0** |

  - Honest read: fine-tuning made the small model usable, but the gain is smaller on our apps than on held-out training-style snippets (85%). Its training data had almost no auth, secret or dependency examples (6, 3, 0), and rules remain far ahead.
* **Future Work:**
  - Training data shaped like real AI-generated apps, with more auth, secret and dependency examples.
  - Expanding beyond Node/Express to FastAPI and Next.js App Router.

---

## Slide 5: Built for Vibe Coders (Plain-English UI)
* Non-developers who vibe-code apps cannot read raw git unified diffs.
* SlopStop's UI translates complex security findings into clear, color-coded human language:
  - 🟢 **Proven:** Status applied and verified with an active HTTP test passing.
  - 🟡 **Verified:** Passed native `node --check` and re-scan.
  - 🔴 **Rejected:** Reason explained in plain English (e.g., *"The patch had a syntax error that would crash your server, so SlopStop blocked it"*), with raw AST failure logs behind a "Technical details" drawer.
  - **Category Explanations:** Plain-English summaries explaining *why* the vulnerability existed and *how* the fix protected them.
  - **Code diff collapsed by default:** Vibe coders see safety explanations first; developers can toggle "Show code diff" to inspect the code.
  - **One-Click Apply to Editor:** Transfers verified patches and new middleware files directly into the editor buffer (never silently writing to disk without confirmation).

---

## Slide 6: Summary & Impact
* **Benchmark Numbers (from real results.json):**
  - 56 / 56 planted flaws detected across 30 applications (100% recall).
  - 0 false alarms on clean applications.
  - Critical/High findings reduced by **86.2%** on the corpus (65 → 9) and **97.6%** on AI-generated apps (41 → 1) in Hybrid mode with QwenSkuld.
  - **Prompt Hardener produces 63% fewer vulnerabilities upfront** (15 vs 41 critical/high).
  - With QwenSkuld, AI-only broke 8 of 51 apps; Hybrid broke **0** (by syntax and route checks, 1 run).
  - Fine-tuned Qwen 1.5B (**QwenSkuld**): 44% → 66% accuracy on unseen apps (0 invalid answers vs 36); rules: 95%.
  - Semgrep baseline comparison: Semgrep detected only 12 / 56 flaws; SlopStop detected 56 / 56.
* **Live Demo Readiness:**
  - Real mode connected to local server on port 3001.
  - Seamless fallback to deterministic mock contract data if offline.
  - Pre-commit hook (`npx slopstop-init`) and GitHub Action composite action ready for CI/CD pipelines.

**SlopStop: The verified pre-ship security gate for the AI era.**
