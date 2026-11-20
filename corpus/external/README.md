# External test set: DVNA

**DVNA**, the "Damn Vulnerable NodeJS Application" by Appsecco, is a deliberately vulnerable Express app. SlopStop was **not** built from it, so it measures how the tool does on code we did not write.

- **Source:** https://github.com/appsecco/dvna, commit `9ba473add536f66ac9007966acb2a775dd31277a`
- **License:** MIT (see `dvna/LICENSE`)
- **What was copied:** only the server code (`server.js`, `config/`, `core/`, `models/`, `routes/`, `package.json`). No `views/`, `public/`, `docs/` or Docker files, and no `node_modules`.
- **Never executed by SlopStop:** the app is intentionally exploitable, including command injection. The experiment scans it and asks the AI about it, but the HTTP sandbox test is switched off for this set.

## Labels (`dvna-ground-truth.json`)

Only flaws that DVNA's **own documentation** (`docs/solution/*.md` in the source repo) describes are labelled, at the line where they sit in this copy:

- **6 flaws in SlopStop's five categories:** 2 injection (SQL, command), 1 secret, 1 auth (no admin check), 1 IDOR, 1 vulnerable dependency.
- **10 flaws outside them:** XSS, XXE, insecure deserialization, open redirect, weak reset token, sensitive data exposure, CSRF, security misconfiguration, logging, and the `mathjs.eval` sink. These are listed in `outOfScope` and not counted. They are what SlopStop does **not** claim to cover.

Note: this code version names the users API `/admin/usersapi`, while the docs say `/admin/api/users`. The label points at the route in the code.

Labelled by role B (with Claude) from the documentation, at 3 am on 2026-11-21.
