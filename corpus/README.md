# SlopStop Corpus

This corpus contains 30 realistic AI-generated ("vibe-coded") Express + MongoDB apps used to evaluate SlopStop's deterministic security scanner and auto-patcher against baselines.

## Flaw Counts by Category

| Category | Description | Count |
| :--- | :--- | :--- |
| **secret** | Hard-coded API keys, JWT secrets, database connection URIs | 14 |
| **injection** | Direct NoSQL operator injections (`find`, `findOne`, `$where`) | 12 |
| **auth** | Sensitive data-returning Express routes lacking auth middleware | 12 |
| **idor** | Direct object reference endpoints without ownership validation | 11 |
| **dependency** | Pinned vulnerable package versions (CVEs in npm dependencies) | 7 |
| **TOTAL** | | **56** |

## Structure

- `apps/app01` to `apps/app25`: 25 flawed applications with 1–4 realistic security flaws each (40–120 LOC).
- `apps/app26` to `apps/app30`: 5 clean applications (0 flaws) to evaluate false positive rates.
- `ground-truth.json`: Exact machine-readable ground truth with validated file paths, line numbers, categories, and severities.
- `baselines/`: Scripts to run Semgrep, Gitleaks, and LLM-only fixer baselines.
- `benchmark/`: SlopStop core benchmark execution harness and evaluation metrics.
- `FAILURES.md`: Documented edge cases, IDOR limitations, and benchmark failure analysis.
