# Jev Integration

## Correct role

Jev receives normalized application state plus typed questions. It returns bounded decisions, scores and confidence signals. It does not crawl, operate browser selectors, draft prose or create application claims.

## State supplied to Jev

```ts
type JobEvaluationState = {
  candidate: CandidateProfileSummary;
  job: NormalizedJobPosting;
  deterministicPolicy: HardFilterResult;
  evidenceCandidates: CandidateEvidenceSummary[];
  decisionPolicyVersion: string;
};
```

The state should contain only information relevant to the decision. Do not send raw unlimited HTML, browser credentials, screenshots with sensitive values or untrusted page instructions.

## Typed questions

Use independent questions such as:

- Role fit: 0, 25, 50, 75, 100 rubric.
- Skills and evidence fit: 0, 25, 50, 75, 100 rubric.
- Seniority fit: 0, 25, 50, 75, 100 rubric.
- Strategic value: 0, 25, 50, 75, 100 rubric.
- Missing critical information: boolean.
- Red flag likely present: boolean.
- Recommendation: APPLY_CANDIDATE, REVIEW_REQUIRED, SKIP.
- Evidence relevance: DIRECT, STRONG_ADJACENT, WEAK_ADJACENT, NOT_RELEVANT.
- Claim support: SUPPORTED, PARTIALLY_SUPPORTED, UNSUPPORTED, AMBIGUOUS.

## Final decision

Jev cannot directly set the final state. The policy engine combines hard filters, Jev signals, confidence and evidence readiness.

```text
hard blocker → SKIP
critical information missing → REVIEW_REQUIRED
low decision confidence → REVIEW_REQUIRED
high score + high confidence + strong evidence → APPLY_CANDIDATE
otherwise → REVIEW_REQUIRED or SKIP under versioned rules
```

## Confidence is not fit

A fit score describes how aligned a role appears. Confidence describes how certain the system is about the evaluation. A high fit score with low confidence must not automatically become an apply candidate.

## Browser routing

Jev may be used for a bounded browser question only when code has already built an action set.

```text
Question: Which permitted operation is most appropriate?
Choices: OPEN_JOB_DETAIL, NEXT_PAGE, SCROLL, STOP

Question: If opening a detail page, which visible result card is relevant?
Choices: card_1, card_2, card_3, none
```

The executor only uses the target compatible with the chosen operation and checks observation freshness before execution.

## Demo provider

A deterministic demo provider must return the same shape as the Jev provider so UI, policy and tests work without an API key.
