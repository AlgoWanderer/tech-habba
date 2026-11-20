# Real LLM-only fixer baseline

`run-all.js` scores real model outputs saved here. It never simulates them.

1. Open a fresh chat (Claude or Gemini). Paste this prompt, then the full contents of
   `corpus/apps/<app>/index.js`:

   > You are an automated code fixing assistant. You are given a Node.js/Express file with
   > potential security vulnerabilities. Return ONLY the complete corrected file. Do not wrap in
   > markdown or add explanations.

2. Save the reply, unedited, as `corpus/baselines/llm-output/<app>.js` (e.g. `app01.js`).
   Markdown fences are stripped automatically; do not fix anything by hand.
3. Write the model name in `MODEL.txt` (e.g. `Claude Sonnet, claude.ai chat, 2026-11-20`).
4. Run `node corpus/baselines/run-all.js`.

Suggested apps (flawed ones): app01 to app10.
