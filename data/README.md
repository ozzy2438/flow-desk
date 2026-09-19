# data/

This folder holds the three CSVs that ground the entire product:

- `decision-policy.csv` — hard blockers, preferences, review triggers, wording rules, and thresholds.
- `candidate-profile.csv` — canonical candidate facts, evidence library, verified projects.
- `candidate-profile.schema.csv` — machine-readable schema contract that governs `candidate-profile.csv`.

## How to drop your files here

1. Open this folder in the GitHub web UI: `data/`.
2. Click **Add file → Upload files**.
3. Drag and drop the three CSVs from your local machine.
4. Commit directly to `main`.

After the files are in place, the agency will:

- Parse the schema CSV to generate typed accessors.
- Load `candidate-profile.csv` into the canonical profile store on first boot.
- Load `decision-policy.csv` into the policy engine as a versioned policy record.
- Verify that every row in `candidate-profile.csv` validates against the schema.
- Refuse to boot in production mode if either file is missing or invalid.

## Why the files are not committed by the blueprint

This repository is an infrastructure blueprint, not a data repository. Personal profile data, evidence records, and decision-policy tuning belong to you and should be committed by you into `main` in a single upload once you have reviewed this blueprint.

## Sensitivity

- `candidate-profile.csv` and its schema hold personal information. Keep the repository private if it will contain real personal data.
- `decision-policy.csv` is less sensitive but still reflects your personal application strategy.
