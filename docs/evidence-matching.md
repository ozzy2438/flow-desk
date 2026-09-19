# Evidence Matching

## Goal

A job should not merely receive a percentage score. Flow Desk should show which verified records support a realistic application and which requirements are unsupported or uncertain.

The imported candidate profile is the source of truth. Its canonical evidence registry is normalized so projects, skills and experience can refer to evidence IDs rather than duplicate claims. `candidate-profile.schema.csv`

## Match categories

```text
DIRECT
STRONG_ADJACENT
WEAK_ADJACENT
NOT_RELEVANT
EVIDENCE_GAP
```

## Job-to-evidence result

```ts
type EvidenceMatch = {
  jobId: string;
  evidenceId: string;
  category: "DIRECT" | "STRONG_ADJACENT" | "WEAK_ADJACENT" | "NOT_RELEVANT";
  supportedRequirements: string[];
  unsupportedRequirements: string[];
  safeClaims: string[];
  forbiddenClaims: string[];
  confidence: number;
};
```

## Claim safety

The product may generate prose only from verified and allowed evidence. After a cover-letter draft is generated, extract atomic claims and validate each one against evidence.

```text
SUPPORTED → allow
PARTIALLY_SUPPORTED → require weaker wording or review
AMBIGUOUS → review
UNSUPPORTED → block Ready state
```

The policy data explicitly requires the system never to fabricate achievements, clients, teams or metrics, including with AI assistance. `candidate-profile.csv`

## Example user-facing explanation

```text
Strong evidence match

- Project 45 directly supports data quality, transformation, opportunity discovery,
  ranking and bid/no-bid analysis.
- Independent delivery evidence supports analytical ownership.

Review before applying

- Salary is not listed.
- Work-authorisation wording is absent.
- The posting requests a tool not currently evidenced in the profile.
```

Explanations must be built from structured evidence and policy output. Do not produce invented rationales.
