# SlopStop Benchmark Failure Analysis & Edge Cases

This document records concrete observed failure cases and limitations identified during benchmark execution across the 30 corpus applications. All items reflect real observed results.

---

## 1. IDOR (Insecure Direct Object Reference) / BOLA Flaws

Per the shared contract, IDOR flaws cannot be deterministically patched without understanding application domain logic and data schemas. All 11 IDOR flaws in the corpus are correctly categorized as `fixable: "review"`.

### Concrete Observed Cases:

1. **`corpus/apps/app02/index.js:29`**
   - **Endpoint:** `app.get("/api/notes/:id", requireAuth, async (req, res) => {`
   - **Observed Behavior:** The endpoint authenticates the user but performs `Note.findById(req.params.id)` without checking whether `note.userId === req.user.id`.
   - **Why Unpatchable Deterministically:** The engine cannot know whether notes are intended to be public, shared with a team, or strictly private without inspecting schema definitions and permissions matrices.

2. **`corpus/apps/app04/index.js:27`**
   - **Endpoint:** `app.delete("/api/posts/:id", requireAuth, async (req, res) => {`
   - **Observed Behavior:** Any authenticated user can delete any post by ID.
   - **Why Unpatchable Deterministically:** Automatic deletion logic requires determining which field (`authorId`, `creatorId`, `ownerId`, or `teamId`) holds the authorization principal.

3. **`corpus/apps/app06/index.js:33`**
   - **Endpoint:** `app.put("/api/projects/:id", requireAuth, async (req, res) => {`
   - **Observed Behavior:** Project updates accepted from any authenticated user without role or team membership verification.

4. **`corpus/apps/app09/index.js:28`**
   - **Endpoint:** `app.delete("/api/recipes/:id", requireAuth, async (req, res) => {`
   - **Observed Behavior:** Unchecked recipe deletion by document ID.

5. **`corpus/apps/app11/index.js:30`**
   - **Endpoint:** `app.get("/api/patients/:id/records", requireAuth, async (req, res) => {`
   - **Observed Behavior:** Sensitive patient medical records accessible by doctor ID parameter without doctor-to-patient relationship check.

6. **`corpus/apps/app13/index.js:27`**
   - **Endpoint:** `app.get("/api/invoices/:id", requireAuth, async (req, res) => {`
   - **Observed Behavior:** Cross-customer invoice disclosure via incrementable ID.

7. **`corpus/apps/app16/index.js:29`**
   - **Endpoint:** `app.put("/api/tickets/:id", requireAuth, async (req, res) => {`
   - **Observed Behavior:** Modification of support ticket status without verifying ticket submitter identity.

8. **`corpus/apps/app18/index.js:29`**
   - **Endpoint:** `app.delete("/api/comments/:id", requireAuth, async (req, res) => {`
   - **Observed Behavior:** Deletion of comment without checking commenter ownership.

9. **`corpus/apps/app21/index.js:25`**
   - **Endpoint:** `app.get("/api/files/:id/meta", requireAuth, async (req, res) => {`
   - **Observed Behavior:** Private file metadata fetched by arbitrary file ID.

10. **`corpus/apps/app23/index.js:27`**
    - **Endpoint:** `app.delete("/api/rsvp/:id", requireAuth, async (req, res) => {`
    - **Observed Behavior:** Event RSVP cancelled without confirming `rsvp.userId === req.user.id`.

11. **`corpus/apps/app25/index.js:24`**
    - **Endpoint:** `app.put("/api/episodes/:id", requireAuth, async (req, res) => {`
    - **Observed Behavior:** Podcast episode details modified without validating `creatorId`.

---

## 2. False Positives on Clean Apps

- **`corpus/apps/app28/index.js:15`**
  - **Code:** `app.get("/api/docs/:slug", (req, res) => { ... })`
  - **Issue:** Naive regex matching parameter patterns in route paths (`:slug`, `:id`) can falsely trigger IDOR warnings on completely public, non-sensitive documentation resources.
  - **Mitigation:** The scanner must distinguish between private stateful resources and explicitly public reference endpoints (e.g. `/docs`, `/public`, `/health`).

---

## 3. Auto-Patching Verification & AST Constraints

1. **Missing Middleware Injections:**
   - When auto-patching an unauthenticated route by adding `requireAuth` to the Express route handler signature, the verifier rejects the patch unless `requireAuth` is either imported at the top of the file or already defined in module scope.
2. **Deterministic String Injection Sanitization:**
   - Casting `req.body.x` to `String(req.body.x)` neutralizes MongoDB NoSQL query selector injections (`{ "$gt": "" }`), but if an application legitimately expects an array or nested object, the runtime schema may reject it. Stronger typed schemas (Zod or Joi) should be recommended for human review.
