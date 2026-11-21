# SlopStop 3-Minute Live Demo Script & Pitch

**Speaker / Presenter Guide**  
**Total Target Time:** 3:00 Minutes  
**Target Audience:** Judges, Security Engineers, Hackathon Evaluators  

---

### [0:00 - 0:40] Screen 1: The Problem & The Pre-Ship Scanner
* **Screen:** Dashboard -> **Security Gate** tab.
* **Initial State:** Target file selector shows `index.js` (Contract Sample: Vibe-Coded E-Commerce).
* **Action:** Point out lines 5, 7, 14, 20 in the code editor.
* **Spoken Pitch:**
  > "Hello everyone. AI coding tools like Cursor and v0 allow anyone to 'vibe-code' full-stack applications in minutes. But here's the dirty secret: they produce code riddled with critical vulnerabilities. Look at this generated Express & MongoDB app: hard-coded live Stripe API keys on line 5, a cleartext MongoDB database URI on line 7, NoSQL operator injection on line 14, and sensitive user endpoints left wide open with zero authentication.
  > 
  > Instead of hoping developers remember to audit this, SlopStop acts as a pre-ship, deterministic security gate. Let's hit **Scan Code**."

---

### [0:40 - 1:15] Screen 2: Risk Meter & Findings Analysis
* **Screen:** **Scan View** (Risk Meter + Findings List).
* **Action:** Highlight the semicircular gauge and findings list.
* **Spoken Pitch:**
  > "In a fraction of a second, SlopStop parses the code with Acorn. *(Read the safety score and risk % off the gauge; they depend on the sample app you load.)*
  > 
  > Notice how findings are grouped by severity: hard-coded secrets, injection sinks, missing auth and IDOR suspects. Every finding provides an exact line reference, rule identifier, and a preview of the deterministic AST transformation."

---

### [1:15 - 1:45] Screen 3: Proof-of-Exploit Simulation
* **Screen:** **Exploit Simulator** panel.
* **Action:** Click **Run Exploit Simulation**.
* **Spoken Pitch:**
  > "Before touching the code, let's verify if these flaws are exploitable. We click **Run Exploit Simulation**.
  > 
  > On the left: Our probe hits the unauthenticated `/api/users` endpoint. Result? HTTP 200 OKâ€”names, emails, internal roles, and customer balances are exfiltrated.
  > 
  > On the right: SlopStop tests the hardened route with the injected authentication barrier. The attack is terminated with an HTTP 401 Unauthorized."

---

### [1:45 - 2:20] Screen 4: Verified Auto-Patching & Diff Inspection
* **Screen:** Click **Fix All Auto-Fixable** -> **Diff View**.
* **Action:** Walk through the side-by-side diff, per-finding status chips, and `.env` template.
* **Spoken Pitch:**
  > "Now watch the core magic of SlopStop. We click **Fix All Auto-Fixable**. 
  > 
  > These fixes are **deterministic**: precise AST rewrites, each one checked with `node --check` and an automated re-scan before you see it. In our experiment, AI alone found 37 of 56 planted flaws; rules + AI + verifier found all 56, and the verifier rejected 37% of AI patches before they could ship.
  > 
  > Here is our side-by-side diff: Stripe keys and database URIs are extracted to environment variables, MongoDB queries cast inputs to strings to prevent operator injection, and route handlers are wrapped with auth middleware.
  > 
  > Below, an automated `.env` template is generated—with a strict guarantee: **secret values are never included on disk**. Look at our rescan gauge: risk plummeted from 88% down to 8%."

---

### [2:20 - 2:50] Screen 4b: The 30-Second Hybrid Step (Verifier Catches AI Mistakes)
* **Screen:** Return to **Security Gate** -> Select **Hybrid** mode -> Click **Scan code**.
* **Action:** 
  1. Point at the violet **AI 82%** finding (e.g. `ai-xss` reflected query injection).
  2. Click **Fix all (rules + AI, verified)**.
  3. In the Patch Results list, point directly at the **RED "Rejected"** AI patch.
* **Spoken Pitch:**
  > "Now let's switch from pure deterministic Rules to **Hybrid Mode** (Rules + Gemini 3.1 Flash-Lite + Verifier).
  > 
  > Watch the scanner: in addition to deterministic rules, Gemini surfaces deep flaws the rules missed, tagged with a violet **AI 82%** badge and confidence score.
  > 
  > When we click **Fix all (rules + AI, verified)**, the model proposes patches for complex review findings. But look at this red **Rejected** row: the LLM proposed a patch that broke syntax.
  > 
  > In any other tool, that broken code ships to production. In SlopStop, our 6-stage verifier caught the AI's mistake instantly and blocked it.
  > 
  > **AI proposes, deterministic code proves.**"

---

### [3:15 - 3:30] Screen 6: Scorecard & Honest Limitations
* **Screen:** Click **Scorecard** tab.
* **Action:** Highlight KPI numbers and the Failure Analysis list.
* **Spoken Pitch:**
  > "Finally, our benchmark scorecard. On our 30-app vibe-coded test corpus, SlopStop found all 56 planted flaws with zero false alarms on the 5 clean apps, and cut critical and high findings from 65 to 9, an **86% reduction**, in about 140 milliseconds per app. Every applied fix passed the syntax check and re-scan.
  > 
  > And we are honest about limitations: BOLA and IDOR logic flaws cannot be deterministically guessed because they require domain business knowledge. SlopStop flags them transparently for human review rather than pretending to fix them.
  > 
  > SlopStop: Stop shipping vibe-coded slop to production. Thank you!"
