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
  > "In under 40 milliseconds, SlopStop parses the AST with Acorn. Our safety score is a catastrophic **12 out of 100**, indicating an **88% critical risk**.
  > 
  > Notice how findings are grouped: 2 Critical secrets, 2 High injection and missing auth sinks, and 1 Medium IDOR susceptibility. Every finding provides an exact line reference, rule identifier, and a preview of the deterministic AST transformation."

---

### [1:15 - 1:45] Screen 3: Proof-of-Exploit Simulation
* **Screen:** **Exploit Simulator** panel.
* **Action:** Click **Run Exploit Simulation**.
* **Spoken Pitch:**
  > "Before touching the code, let's verify if these flaws are exploitable. We click **Run Exploit Simulation**.
  > 
  > On the left: Our probe hits the unauthenticated `/api/users` endpoint. Result? HTTP 200 OK—names, emails, internal roles, and customer balances are exfiltrated.
  > 
  > On the right: SlopStop tests the hardened route with the injected authentication barrier. The attack is terminated with an HTTP 401 Unauthorized."

---

### [1:45 - 2:20] Screen 4: Verified Auto-Patching & Diff Inspection
* **Screen:** Click **Fix All Auto-Fixable** -> **Diff View**.
* **Action:** Walk through the side-by-side diff, per-finding status chips, and `.env` template.
* **Spoken Pitch:**
  > "Now watch the core magic of SlopStop. We click **Fix All Auto-Fixable**. 
  > 
  > Unlike LLM-based 'auto-fixers' that hallucinate or introduce breaking changes, SlopStop is **100% deterministic**. It applies precise AST rewrites, runs `node --check` to verify syntax validity, and runs an automated re-scan.
  > 
  > Here is our side-by-side diff: Stripe keys and database URIs are extracted to environment variables, MongoDB queries cast inputs to strings to prevent operator injection, and route handlers are wrapped with auth middleware.
  > 
  > Below, an automated `.env` template is generated—with a strict guarantee: **secret values are never included on disk**. Look at our rescan gauge: risk plummeted from 88% down to 8%."

---

### [2:20 - 2:45] Screen 5: Prompt Hardener (Privacy Gate)
* **Screen:** Click **Prompt Hardener** tab.
* **Action:** Load sample prompt -> click **Harden Prompt & Redact Secrets**.
* **Spoken Pitch:**
  > "Fixing bad code after the fact is great; preventing it from being generated is better. In our **Prompt Hardener**, developers paste their initial prompting instructions.
  > 
  > SlopStop runs a pure, local regex engine that redacts sensitive credentials into `<API_KEY_1>` placeholders before they leave the machine. It wraps the prompt with 7 mandatory architectural security rules: parameterized queries, forced auth, and input sanitization. Redacted values never touch any remote LLM."

---

### [2:45 - 3:00] Screen 6: Scorecard & Honest Limitations
* **Screen:** Click **Scorecard** tab.
* **Action:** Highlight KPI numbers and the Failure Analysis list.
* **Spoken Pitch:**
  > "Finally, our benchmark scorecard. Tested across 48 real-world vibe-coded repositories: baseline vulnerabilities dropped from 184 to just 14—a **92.4% reduction** in 38 milliseconds per file.
  > 
  > And we are honest about limitations: BOLA and IDOR logic flaws cannot be deterministically guessed because they require domain business knowledge. SlopStop flags them transparently for human review rather than pretending to fix them.
  > 
  > SlopStop: Stop shipping vibe-coded slop to production. Thank you!"
