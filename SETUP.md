# Build Order

This is the sequence the implementation team should follow. Do not begin by building a fully autonomous browser agent.

## Milestone 1 — Running shell

Goal: the web app starts locally and presents a chat-like command screen.

Deliver:

- Next.js application
- TypeScript strict mode
- database connection
- authentication placeholder or single-user development mode
- Zod environment validation
- dashboard shell
- feature flag system
- demo mode

Definition of done:

- `pnpm dev` starts the app.
- A user can open the Research Run composer.
- No browser or AI key is required in demo mode.

## Milestone 2 — Profile and policy ingestion

Goal: import the owner’s candidate profile, schema and decision policy.

Deliver:

- CSV upload/import command
- versioned profile record
- versioned policy record
- import validation report
- schema mismatch report
- profile/evidence viewer
- policy inspector

Definition of done:

- Invalid profile data is rejected.
- Every candidate evidence reference resolves.
- Policy version is attached to evaluations.

## Milestone 3 — Job domain and deterministic policy

Goal: normalize jobs and route them without browser automation.

Deliver:

- canonical `JobPosting`
- pasted job ingestion
- URL import stub
- duplicate detector
- hard-filter evaluator
- deterministic scoring composition
- apply/review/skip routing
- Job Inbox and Job Detail pages

Definition of done:

- A pasted job becomes a normalized posting.
- Deterministic rules produce auditable output.
- No model is needed for obvious blockers.

## Milestone 4 — Jev decision provider

Goal: plug in structured semantic decisions without using Jev as a chatbot.

Deliver:

- DecisionProvider interface
- Jev implementation
- deterministic demo implementation
- Zod-validated decision results
- role, skills, seniority, strategic value, ambiguity and routing questions
- decision audit timeline

Definition of done:

- Demo and live Jev providers return the same result contract.
- All final decisions remain policy-engine controlled.

## Milestone 5 — Evidence matching and claim safety

Goal: connect jobs to verified projects and prevent unsupported claims.

Deliver:

- EvidenceMatch model
- project/skill/experience match UI
- safe-claim generator inputs
- atomic claim extraction
- Jev claim-support verification
- Ready-blocking policy

Definition of done:

- Every cover-letter claim is categorized supported, partially supported, ambiguous or unsupported.
- Unsupported claims block Ready status.

## Milestone 6 — First browser proof of concept

Goal: one safe read-only browser flow.

Deliver:

- queue
- Playwright worker
- one approved source registry entry
- one browser context per flow
- screenshot artifact storage
- browser event stream
- stop condition
- timeout/page/step limits
- Research Run page with one card

Definition of done:

- A flow opens an approved page and captures a screenshot.
- The browser worker closes cleanly.
- No login or external side effect occurs.

## Milestone 7 — Three parallel job discovery flows

Goal: recreate the multi-card effect safely.

Deliver:

- planner output validation
- three source/task definitions
- concurrency two or three
- live SSE or WebSocket updates
- latest screenshot per flow
- status, failure and Stop controls
- extraction into JobPosting

Definition of done:

- The user sees three cards appear immediately.
- At least two contexts run in parallel.
- Each card receives live status and screenshot updates.
- Extracted jobs reach Inbox.

## Milestone 8 — Controlled scale to five or ten visible flows

Goal: use the same experience as the reference demo without unsafe resource use.

Deliver:

- visible flow count control
- max-flow validation
- concurrency configuration
- per-domain rate limits
- batch cancellation
- retry policy
- browser memory monitoring
- source health metrics

Definition of done:

- Ten cards can be planned and displayed.
- Server concurrency remains bounded.
- Stop All cancels queued and running tasks safely.

## Milestone 9 — Daily Desk and feedback loop

Goal: turn discoveries into a useful career operating system.

Deliver:

- Daily Desk ranking
- user save/skip/application feedback events
- source performance metrics
- evidence-readiness ranking
- review queue
- audit export

Definition of done:

- The user receives a small, explainable shortlist rather than a raw bulk list.
- Feedback changes future ranking behavior only through explicit, reviewable policy updates.

## Definition of complete first release

The first release is complete when it can:

1. Import candidate data and decision policy.
2. Accept a typed job-search goal.
3. Plan up to three safe flows.
4. Run browser contexts in parallel.
5. Show screenshot timelines.
6. Normalize job data.
7. Apply hard filters.
8. Request typed Jev evaluation.
9. Match verified evidence.
10. Produce an auditable Daily Desk.
11. Prevent unsupported cover-letter claims.
12. Require human approval for all external actions.
