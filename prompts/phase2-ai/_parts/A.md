=== YOUR ROLE: A (contract/ and core/) ===
You own the data contract and the rule engine. Your Wave 1 work unblocks B and D, so do A1 first.

STEP A1 (Wave 1, do first, about 1 hour). Branch: feat/a-ai
1. contract/finding.schema.json: in definitions.Finding.properties add
     "source": { "enum": ["rule", "ai"] },
     "confidence": { "type": "number", "minimum": 0, "maximum": 1 }
   Do NOT add them to "required". In the fix result item schema add the same optional "source".
   Add one AI finding example to contract/sample-scan.json only if the existing tests still pass;
   otherwise leave the samples unchanged.
2. core/maskSecrets.js: export function maskSecrets(files)
   -> { files: [{path, content}], count }
   Run the existing secret rules, and replace every detected secret LITERAL (the string value, not
   the whole line) with "<REDACTED_SECRET_1>", "<REDACTED_SECRET_2>"... Line numbers must not change
   (the same number of lines per file). Code that is not a secret stays byte-for-byte identical.
3. core/merge.js: export function mergeFindings(ruleFindings, aiFindings) -> Finding[]
   - every rule finding is kept, with source "rule" added
   - an AI finding is DROPPED when a rule finding has the same file, the same category and a line
     within +-1 (the rule finding wins: it is deterministic and may be auto-fixable)
   - the remaining AI findings are kept (source "ai")
   - result sorted by file, then line
4. Export both from core/index.js (do not change any existing export).
5. Tests in core/test: maskSecrets keeps line counts and removes the literal (use a Stripe key, a
   mongodb URI with a password and a JWT secret); mergeFindings drops the duplicate, keeps the rest,
   and adds source "rule". All existing tests must still pass:
     npm test --workspaces --if-present
     node corpus/benchmark/run.js   -> still 56/56, 65 -> 9, 37/56, 0 rejected
6. PR into dev: "core: contract source/confidence, maskSecrets, mergeFindings". Tell B and D it is merged.

STEP A1b (optional carry-over, if time): IDOR suggested fix. In core/idor.js give idor-suspect
findings a fixPreview with a suggested ownership check, e.g.
  Loan.findById(req.params.id)  ->  Loan.findOne({ _id: req.params.id, memberId: req.member.id })
ownerField = first schema field matching /^(user|owner|member|author|customer|patient|account)Id$/i
(fallback ownerId); authProp = what the same-file auth middleware assigns to req (fallback user).
It stays fixable "review" and is never auto-applied. Add tests.

STEP A2 (Wave 2, after C2 has results, about 45 min): failure analysis.
Read corpus/experiment/results.json and C's hand labels. Write docs-ready notes in
corpus/experiment/FAILURES.md (C owns corpus/, so send it to C as a PR comment or ask C to add it):
which AI findings were wrong and why (false alarms, wrong lines, invented flaws), which flaws BOTH
rules and AI missed, and which AI patches the verifier rejected, with the reasons. Short, with counts.
