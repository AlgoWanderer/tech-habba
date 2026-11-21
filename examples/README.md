# Example apps

Deliberately vulnerable single-file Express apps for trying SlopStop. Paste one into the dashboard
(http://localhost:5173), choose **Hybrid**, click **Scan code**, then **Auto-fix & HTTP verify**.
They are listed in `.slopstopignore`, so the repo's own gate skips them.

Results below are from the local three-stage gate (rules -> QwenSkuld via Ollama -> live HTTP test),
each app run 2-3 times with the same outcome.

| File | Expected | What happens |
|---|---|---|
| `pass-1-events-app.js` | **Pass** (safety 30 -> 100) | Hard-coded secret moved to `.env`; NoSQL login injection cast with `String()` (HTTP test: `{"$ne": null}` 200 -> 401, real login 200); two routes without login get `requireAuth` (HTTP test: 200 -> 401, logged-in user 200). All fixes are deterministic. |
| `pass-2-notes-app.js` | **Pass** (safety 30 -> 100) | Same three rule fixes, all HTTP-proven. QwenSkuld also flags `/api/notes`, which is already owner-scoped: a **false positive**. Its patch passes the checks, but the HTTP test reports "not testable". |
| `fail-converter-app.js` | **Fail** (safety 55 -> 85, still blocked) | Missing auth is fixed. Command injection via `exec()` has no rule; QwenSkuld finds it, but its patch is rejected (the independent re-check says the flaw is still there). **Path traversal** in `/api/download` is not detected by either layer. |
| `demo-library-app.js` | **Pass** | The main live demo: NoSQL injection, missing login and an IDOR, each proven 200 -> 401 with the real user still 200. |
| `demo-verifier-catches-ai.js` | **Blocked** | QwenSkuld flags the order IDOR, but its patch locks owners out of their own orders; the HTTP normal-mode test rejects it. The `exec()` command injection is missed by both layers. The Stripe key is fake. |

AI output varies between runs; the deterministic rule fixes do not.
