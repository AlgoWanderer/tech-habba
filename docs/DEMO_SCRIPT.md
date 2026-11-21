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
  > On the left: Our probe hits the unauthenticated `/api/users` endpoint. Result? HTTP 200 OK: names, emails, internal roles, and customer balances are exfiltrated.
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

### [2:20 - 2:50] Screen 4b: The Three-Stage Gate (Verifier Catches AI Mistakes)
* **Screen:** Return to **Security Gate** -> Select **Hybrid** mode -> load the **Library API (live HTTP demo)** sample -> Click **Scan code**.
* **Action:**
  1. Watch the three stage cards fill in: **1. Static rules** -> **2. QwenSkuld** (our fine-tuned model, running locally in Ollama) -> **3. Live HTTP test**.
  2. Click **Auto-fix & HTTP verify**.
  3. Point at the HTTP chips: each attack goes **200 -> 401** while a real user still gets **200**. The ship gate turns to **Ready to ship**.
* **Spoken Pitch:**
  > "Now let's switch to **Hybrid Mode**: rules first, then QwenSkuld, our own fine-tuned Qwen model running offline on this laptop, then a live attack on the patched app.
  >
  > Every fix here is proven: the same exploit that got in before (200) is refused after (401), and a logged-in user still gets in (200).
  >
  > And when the AI is wrong, the gate catches it. On our test app QwenSkuld correctly flags an order IDOR, but its patch would lock owners out of their own orders. The live HTTP test sees that, rejects the patch, and nothing ships.
  >
  > **AI proposes, deterministic code proves.**"

---

### [2:50 - 3:15] Screen 5: Why QwenSkuld (Scorecard Model Chart)
* **Screen:** Click **Scorecard** tab -> **Why QwenSkuld** chart.
* **Action:** Point at the four accuracy bars and the win tiles.
* **Spoken Pitch:**
  > "We started with the Gemini API, but a hosted model can only be prompted, not fine-tuned, and every call sends code off the machine. So we fine-tuned Qwen2.5-Coder-1.5B with LoRA in 5.4 minutes on a laptop GPU.
  >
  > On 122 snippets it never saw, fine-tuning took it from 44% to 66% accuracy, from 36 unusable answers to 0, and it is 8.5x faster than Gemini, fully offline. Gemini and the rules are still more accurate, which is exactly why QwenSkuld sits behind the rules and every fix is verified."

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
