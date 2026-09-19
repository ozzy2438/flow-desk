# data/

This folder holds the three CSVs that ground the entire product:

- `decision-policy.csv` — hard blockers, preferences, review triggers, wording rules, and thresholds.
- `candidate-profile.csv` — canonical candidate facts, evidence library, verified projects.
- `candidate-profile.schema.csv` — machine-readable schema contract that governs `candidate-profile.csv`.

## How to load your files

Use the in-app importers, not a manual file drop — they validate every row and version each
import instead of silently overwriting the last one:

1. Run the app (`pnpm dev`), then open **Candidate Profile** and upload `candidate-profile.schema.csv`
   and `candidate-profile.csv` together.
2. Open **Policy Inspector** and upload `decision-policy.csv`.
3. A failed import is stored (for the error report shown on that page) but never activated —
   evaluation keeps running against the last valid version until you fix and re-upload.

Files never touch git: `data/*.csv` is gitignored, and each import is versioned inside Postgres
(`CandidateProfileImport`, `DecisionPolicyImport`) with a source-file hash, not as a file on disk.

No files uploaded yet? Run `pnpm db:seed` to load a synthetic demo profile and policy from
`fixtures/demo-data/` so the whole product works before you drop in real data. The demo importer
only runs when nothing has been imported for your account yet — it never overwrites real data.

## `candidate-profile.schema.csv` columns

| column | meaning |
|---|---|
| `column_name` | a column name that appears in `candidate-profile.csv` |
| `data_type` | one of `STRING`, `NUMBER`, `BOOLEAN`, `LIST` (pipe- or semicolon-separated), `DATE` |
| `required` | `TRUE` or `FALSE` |
| `description` | free text |

`candidate-profile.csv` may use three reserved column names, all optional: `kind` (one of
`PROJECT`, `SKILL`, `EXPERIENCE`, `EDUCATION`, `FACT`, `CONSTRAINT` — rows outside this list are
kept as `GENERIC`), `evidence_id` (a stable ID other records and cover-letter claims reference),
and `title`. Every other column is whatever you declare in the schema file. See
`fixtures/demo-data/candidate-profile.csv` for a worked example.

## `decision-policy.csv` columns

This file has no separate schema — the columns are fixed by the importer:

| column | meaning |
|---|---|
| `rule_code` | unique identifier for the rule |
| `category` | `ROLE_EXCLUSION`, `LOCATION`, `WORK_RIGHTS`, `COMPENSATION`, `EMPLOYMENT_BASIS`, `SENIORITY`, `DUPLICATE`, `DEEP_REVIEW`, `EVIDENCE_GAP`, `CLAIM_POLICY`, or `OTHER` |
| `field` | the `JobPosting` field the rule reads (e.g. `location`, `salaryMax`, `title`) |
| `operator` | `EQUALS`, `NOT_EQUALS`, `CONTAINS`, `NOT_CONTAINS`, `IN`, `NOT_IN`, `LESS_THAN`, `GREATER_THAN`, `IS_UNKNOWN`, `ALWAYS` |
| `value` | comparison value; pipe-separate multiple options for `CONTAINS`/`NOT_CONTAINS`/`IN`/`NOT_IN` |
| `action` | `HARD_BLOCK`, `BOOST`, `PENALTY`, `REVIEW`, `NEUTRAL` |
| `reason` | human-readable explanation surfaced in the audit trail |
| `active` | `TRUE` or `FALSE` |

A rule never fires against a field that is genuinely unknown on the posting — an unknown field
is treated as missing information, not a negative fact, per `docs/policy-engine.md`. See
`fixtures/demo-data/decision-policy.csv` for a worked example covering every category.

## Why the files are not committed by the blueprint

This repository is an infrastructure blueprint, not a data repository. Personal profile data, evidence records, and decision-policy tuning belong to you and should be committed by you into `main` in a single upload once you have reviewed this blueprint.

## Sensitivity

- `candidate-profile.csv` and its schema hold personal information. Keep the repository private if it will contain real personal data.
- `decision-policy.csv` is less sensitive but still reflects your personal application strategy.
