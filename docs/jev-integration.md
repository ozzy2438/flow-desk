# Jev Integration

## Two bounded roles

Flow Desk uses Jev in two separate providers:

1. `JevBrowserDecisionProvider` chooses the next action from a code-owned read-only action set and judges whether a structured page observation is distinct enough to keep as a flow screenshot.
2. `JevDecisionProvider` evaluates a normalized job against candidate evidence and policy signals.

Playwright still owns the browser, DOM access, screenshots and execution. Jev never creates a selector, URL, script, message, application action or claim.

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

The live adapter sends these as a question map to TypeSafe's official
`POST https://api.typesafe.ai/v1/systemone` endpoint with model
`jev-latest`. Score answers are mapped from the API's rubric indexes to Flow
Desk's bounded `0, 25, 50, 75, 100` contract. Choice and Noul answers are
validated before the policy engine can consume them.

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

The worker observes the current page, assigns stable local element IDs and builds the only actions Jev can choose. A Choice answer must match one of those exact candidate IDs or it is rejected.

```text
Question: Which permitted operation is most appropriate now?
Choices: open-job-0, open-job-1, scroll-detail, stop-source

Question: If opening a detail page, which visible result card is relevant?
Choices: card_1, card_2, card_3, none
```

The answer includes a confidence and full probability distribution. Before execution, the worker re-observes the page and discards a decision whose `observationVersion` is stale. Provider failure falls back visibly to the deterministic safe route; it never broadens the action set.

## Screenshot distinctness

After a meaningful state change, Flow Desk asks a separate Noul question: does the current structured page state add a useful step to the visual timeline? Jev receives the URL, title, compact visible text, interactive-element summary and previously kept steps. It does not receive credentials or unrestricted page content. A probability of at least `0.55` keeps the screenshot; repeated states are recorded as skipped events instead.

The first screenshot is always kept by code so every automatic browser flow has a visible starting state.

## Demo provider

A deterministic demo provider must return the same shape as the Jev provider so UI, policy and tests work without an API key.
