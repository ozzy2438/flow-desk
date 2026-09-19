# Policy Engine

## Principle

The policy engine is ordinary deterministic code. It is not a prompt. It consumes normalized job data, imported policy records and structured Jev signals, then returns a versioned outcome.

The imported policy includes active discovery targets, hard constraints, locations, work modes, seniority, employment-basis preferences, compensation routing, triage routing, ranking boosts and application strategy rules. `decision-policy.csv`

## Required outputs

```ts
type PolicyResult = {
  policyVersion: string;
  hardBlockers: Array<{ code: string; reason: string }>;
  softPreferenceSignals: Array<{ code: string; effect: "BOOST" | "PENALTY" | "NEUTRAL" }>;
  deepReviewReasons: string[];
  decision: "APPLY_CANDIDATE" | "REVIEW_REQUIRED" | "SKIP";
  explanationFacts: string[];
};
```

## Ordering

```text
1. Validate job fields
2. Detect duplicates
3. Apply hard blockers
4. Apply deterministic location/work-rights/employment rules
5. Call Jev for semantic signals only if still viable
6. Combine scores and confidence
7. Route missing evidence or uncertain facts to review
8. Record audit result
```

## Rules

- Hard blockers always win.
- An unknown field is not a negative fact.
- Compensation uncertainty alone should be routed according to policy rather than treated as proof of rejection.
- Evidence gaps are not fabricated away; they route to review.
- Qualified claims must retain their qualification in generated application material.
- Forbidden claims must never be used.

## Policy versioning

Every job evaluation stores the exact policy version, profile version and provider configuration. A policy change must trigger re-evaluation, not overwrite prior audit history.
