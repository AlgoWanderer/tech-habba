You are Role D (Dashboard and Pitch) on a 4-person, 10-hour hackathon team building SlopStop.
The shared context is above. Read contract/sample-scan.json and contract/sample-fix.json first.

YOUR ROLE: D, Dashboard and Pitch. You own web/, core/promptHardener.js, and docs/.
Never touch any other file. Use the contract samples as mock data in web/src/mocks/ with a
VITE_USE_MOCK env flag. The real API base URL is VITE_API_URL (default http://localhost:3001).
Switching from mock to real must change nothing except that flag.
Plan first, then implement; do not ask questions unless truly blocked, and make a sensible default.
After each step print a 3-line status.

DESIGN: clean, neutral, professional (think a developer tool, not a landing page). Light theme with
good contrast, one accent colour. Absolutely NOT purple gradients or any crypto/neon look. Responsive.

1. Scaffold web/ (Vite + React + TS + Tailwind, dev server on port 5173, own package.json).
   Layout: header, left = code input (paste or upload one or more .js files, with a few built-in
   sample apps), right = results. Typed API client in web/src/api.ts that mirrors the contract
   types exactly.
2. Scan view: findings grouped by severity with category icons, file:line, message, fixable badge
   (auto or review). Safety meter: a semicircular gauge showing RISK % (= 100 - safety) with colour
   bands, plus counts per severity. A "Fix all auto-fixable" button.
3. Fix view: after /api/fix, a side-by-side diff of original against patched (use Monaco DiffEditor
   or react-diff-viewer-continued; tell the team which one you add), a tab per file,
   per-finding status chips (applied, rejected with reason, review), the generated .env shown with a
   "values are NOT included, fill them locally" note, and the before/after meter animating from the old
   risk % to the new rescan risk %. Never present a patch as applied to the user's disk.
4. Exploit simulator panel: a button calling /api/exploit, showing the two requests as
   "Before: 200 OK, data exposed" against "After: 401 Unauthorized, attack blocked", with the raw
   status and body.
5. core/promptHardener.js (pure function, no LLM, no network): harden(prompt) -> {hardened,
   redactions, rules}. It (a) redacts anything that looks like a secret (API-key shapes, JWTs,
   mongodb URIs with passwords, long high-entropy tokens, passwords after "password:") replacing
   with placeholders like <API_KEY_1>, recording each in redactions, (b) wraps the user's request
   in a fixed rule block: use environment variables for all secrets, never hard-code credentials,
   validate and sanitise all input, parameterise queries, add auth middleware to non-public routes,
   check resource ownership, pin and audit dependencies, (c) returns the rules list. Add a
   vitest. Build a "Prompt Hardener" page: type a simple prompt, see the redacted and hardened prompt,
   copy button, and a note that redacted values are not sent anywhere beyond the local server.
6. Scorecard page that loads corpus/benchmark/results.json (role C produces it; mock until then):
   baseline vs SlopStop vulnerability counts, ms per file, rejection rate, and a failure analysis list
   (IDOR first). Show only numbers that exist in the file; show "not measured" otherwise.
7. docs/README.md (what it is, how to run, architecture diagram in mermaid, demo steps, honest
   limitations), and a demo script (3 minutes, the order of screens). Pitch deck numbers
   come only from results.json.
Start now with step 1.
