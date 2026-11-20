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
* **The Trap:** Existing "AI fixers" hallucinate code, delete existing routes, or introduce syntax errors that break production.
* **Our Core Thesis:** **AI proposes, deterministic code proves.**

---

## Slide 2: The Core Innovation: The 6-Stage Verifier
### *Judge Question 1: "How do you verify if the AI is wrong?"*
When an LLM (Gemini 3.1 Flash-Lite) proposes a patch for a security flaw, **it is never trusted blind**. Every single patch must pass through an automated 6-stage verification pipeline before the developer even sees it:

1. **Syntax Check (`node --check`)**: Executes native V8 parsing in a sandbox. If the LLM dropped a closing brace, comma, or tag, the patch is discarded immediately.
2. **Deterministic Re-Scan**: The modified file is re-scanned with Acorn AST rules. If the patch failed to remove the target vulnerability or introduced any new Critical/High vulnerability, it is rejected.
3. **Structure & Real-Names Check**: Verifies that the patch only references identifiers, models, and middleware that actually exist in the file's AST scope.
   - *Real Bug Caught in Experimentation:* Gemini wrote a fix referencing `req.user.organizationId`, which didn't exist in the project schema. It passed syntax validation, but our structure/name check caught it and rejected the patch!
4. **Independent AI Re-Check**: An independent model prompt verifies that the flaw was genuinely mitigated without logic regression.
5. **HTTP Attack Mode (Attacks Blocked)**: Automated sandboxed HTTP probe sends the known exploit vector (e.g. NoSQL operator injection or unauthenticated fetch). Result must change from `HTTP 200 Exfiltrated` to `HTTP 401/403/400 Blocked`.
6. **HTTP Normal Mode (Real Users Still Work)**: Normal user requests with valid credentials are sent to ensure business logic remains operational and routes were not deleted.

**Result:** If a patch fails ANY of these 6 gates, it is marked **RED "Rejected"** and discarded. The verifier is the safety net that makes AI output safe to ship.

---

## Slide 3: Why Not Rules Alone or AI Alone? The 3-Way Experiment
### *Judge Question 2: "What is the innovation if you just use AI?"*
"A submission that only sends prompts to a hosted model and shows the reply is not accepted."  
SlopStop is not an AI wrapper; it is a **measured hybrid system**. We evaluated three paradigms across 51 applications (30 corpus apps, 10 raw AI apps, 10 hardened AI apps, 1 external DVNA suite):

#### Corpus Benchmark (30 apps, 56 planted flaws)
| Arm | Flaws Found | Critical + High | Apps Broken | Verification | Model Calls |
|---|:---:|:---:|:---:|:---:|:---:|
| **Rules Only** | 56 / 56 (100%) | 65 → 9 (−86.2%) | 0 | `node --check` + re-scan | 0 |
| **AI Only** | 37 / 56 (66.1%) | 65 → 29.5 (−54.6%) | 0 | None (unverified) | 94 |
| **Hybrid** | **56 / 56 (100%)** | **65 → 0.5 (−99.2%)** | **0** | **All 6 verification checks** | 88 |

#### DVNA (External Codebase, 6 documented in-scope flaws)
| Arm | Flaws Found | Critical + High Reduction | Notes |
|---|:---:|:---:|---|
| **Rules Only** | 1 / 6 (16.7%) | 13 → 7 (−46.2%) | Misses command injection, body IDOR, role auth |
| **AI Only** | **4 / 6 (66.7%)** | 13 → 9.5 (−26.9%) | Finds semantic flaws rules miss; unverified rewrites |
| **Hybrid** | 3 / 6 (50.0%) | **13 → 5 (−61.5%)** | Safe AI patches applied with verified gate |

#### Prompt Hardener (Gemini-Written Apps: Raw vs Hardened Prompts)
- **Raw prompts (10 apps):** 41 critical/high in generated code → 2 after hybrid.
- **Hardened prompts (10 apps):** **15 critical/high (−63% vs raw)** → 0 after hybrid.
- *Prompt Hardener produces 63% fewer vulnerabilities before code is even written; SlopStop eliminates the rest.*

#### Key Findings & Negative Result (Honest AI Research):
- **AI-only's real weakness is low fix efficacy, not app breakage:** The experiment showed 0 broken apps across all arms (the LLM did not fail syntax or delete routes), but **AI-only fixes far less (54.6% vs 99.2% for Hybrid)** and leaves changes completely unverified.
- **LLMs find semantic flaws rules miss:** On DVNA, AI caught 4/6 vs rules' 1/6 (including command injection and exposed Stripe keys).
- **Hybrid wins:** Combines deterministic rule precision with model reasoning, achieving a **99.2% flaw reduction** with verified safety.

---

## Slide 4: AI Model & Fine-Tuning
### *Judge Question 3: "Did you train or fine-tune on datasets?"*
* **Current Production Hybrid Model:** Google Gemini 3.1 Flash-Lite via native REST API (zero heavyweight SDK).
* **Privacy Guarantee (Privacy Gate):** Before ANY code is sent to an external model, SlopStop's `promptHardener` masks all secrets into `<REDACTED_SECRET_n>` tokens. Real API keys and passwords never reach model servers.
* **Fine-Tuning Track (Role A Evaluation):**
  - Fine-tuned `Qwen2.5-Coder-1.5B` on custom security transformation pairs vs. base Qwen vs. Gemini vs. deterministic rules on unseen applications.
  - *Status:* If model weights/evals are completed by final judging, figures populate directly from `corpus/experiment/results.json`. Otherwise: documented as ongoing research track with Gemini 3.1 Flash-Lite as the reference baseline.
* **Future Work:**
  - Fine-tuning a dedicated 7B security model on the OWASP NodeGoat dataset.
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
  - Critical/High findings reduced by **99.2% in Hybrid mode** (65 → 0.5) and 86.2% in Rules mode.
  - **Prompt Hardener produces 63% fewer vulnerabilities upfront** (15 vs 41 critical/high).
  - 0 broken apps across all verification passes.
  - Semgrep baseline comparison: Semgrep detected only 12 / 56 flaws; SlopStop detected 56 / 56.
* **Live Demo Readiness:**
  - Real mode connected to local server on port 3001.
  - Seamless fallback to deterministic mock contract data if offline.
  - Pre-commit hook (`npx slopstop-init`) and GitHub Action composite action ready for CI/CD pipelines.

**SlopStop: The verified pre-ship security gate for the AI era.**
