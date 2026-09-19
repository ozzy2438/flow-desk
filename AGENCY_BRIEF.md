# Agency Build Brief

## Assignment

Build the infrastructure for **Flow Desk**, an evidence-backed parallel job-discovery workspace. The deliverable is a working platform foundation, not a generic chatbot and not an autonomous job-application bot.

The primary user experience begins with a chat-like command box. The user writes a goal such as:

> Find Melbourne or remote Data Scientist, AI Engineer, Applied AI Engineer, Frontend Engineer, Full-Stack Engineer and Automation Engineer roles from the last seven days. Include permanent, contract and fixed-term roles. Prioritize roles where a strong application can be grounded in my verified project evidence.

The system plans 5–10 read-only browser discovery flows, displays those flows immediately as cards, runs a bounded number in parallel, streams screenshots and status events to the UI, extracts job data, applies policy, requests typed Jev decisions, matches evidence and produces a shortlist.

## Non-negotiable product boundaries

- Do not build an autonomous job-application bot.
- Do not submit external forms.
- Do not automate logins.
- Do not message recruiters.
- Do not upload CVs or files.
- Do not bypass CAPTCHAs, login walls, anti-bot controls or platform restrictions.
- Do not let a model emit arbitrary JavaScript, selectors or Playwright code for execution.
- Do not use Jev for cover-letter writing.
- Do not allow unsupported claims into ready-to-send application material.

## Required implementation phases

### Phase 0 — Foundation

Implement:

- Next.js / React application shell
- TypeScript strict mode
- PostgreSQL schema via Prisma or Drizzle
- Redis-backed durable queue
- Zod validation at all external boundaries
- authentication and user isolation
- environment-variable validation
- structured JSON logs
- feature flags for browser mode and provider mode
- demo mode with no API keys

### Phase 1 — Candidate profile and policy import

Import three owner-provided CSV files into a canonical profile store:

- `data/candidate-profile.csv`
- `data/candidate-profile.schema.csv`
- `data/decision-policy.csv`

Requirements:

- Validate every import.
- Maintain source-file hash, policy version and profile version.
- Preserve evidence IDs and relationships.
- Block production evaluation if required profile or policy input is invalid.
- Provide a policy-inspector UI.

### Phase 2 — Research Run planner

Implement a planner interface that converts a user goal into up to ten `DiscoveryFlow` candidates.

Every candidate must include:

- source
- title
- approved start URL
- source/domain allowlist
- goal
- stop condition
- allowed action list
- maximum pages
- maximum steps
- maximum duration
- extraction schema

All planner output must pass Zod validation. The application must reject disallowed domains, external actions, unsafe stop conditions or unbounded flows.

### Phase 3 — Parallel browser engine

Build a queue-backed Playwright worker system.

Requirements:

- Each flow runs in an isolated browser context.
- One run may display 10 cards, while server-side concurrency is configurable and lower by default.
- Use default concurrency 3; allow 5 after testing; reserve 10 for controlled deployment.
- Create screenshots after meaningful state changes.
- Emit event stream updates through SSE or WebSockets.
- Close contexts reliably.
- Enforce domain, page, step and duration budgets.
- Stop on login requirements, CAPTCHA, blocked access or unsafe UI states.
- Store structured browser events and screenshot metadata.
- Add cancellation: Stop Flow and Stop All.

### Phase 4 — Job extraction

Create a canonical `JobPosting` extraction pipeline.

- Parse visible job cards and detail pages.
- Keep raw page source or text separately from normalized fields.
- Normalize title, company, location, employment type, seniority, date, salary, requirements and visa language.
- Capture extraction confidence.
- Mark uncertain fields as unknown; never infer them as facts.
- Run duplicate detection across source URL, external ID, normalized title, company and location.

### Phase 5 — Deterministic policy engine

Build a pure, versioned policy engine driven by `decision-policy.csv`.

It must enforce:

- hard blockers
- role exclusions
- location and work-mode policy
- work-rights compatibility
- compensation routing
- employment-basis preference
- seniority routing
- duplicate handling
- deep-review triggers
- evidence-gap routing
- claim-policy restrictions

The policy engine must emit explainable structured facts, not prose hallucinations.

### Phase 6 — Jev decision provider

Implement `DecisionProvider` with a Jev/TypeSafe provider and deterministic demo provider.

Jev only receives normalized state and typed questions. Implement typed decisions for:

- role fit score
- skills and evidence fit score
- seniority fit score
- strategic-value score
- missing-information signal
- red-flag signal
- evidence relevance
- apply candidate / review required / skip recommendation
- claim support status
- browser action routing only within code-owned action choices

Jev never writes a cover letter, selector, script or unrestricted browser command.

### Phase 7 — Evidence matching

Use the verified evidence library in `candidate-profile.csv` to match a job against candidate projects, skills and experience.

Per job, render:

- direct evidence matches
- strong adjacent matches
- weak adjacent matches
- unsupported requirements
- safe application claims
- forbidden claims
- evidence gaps requiring human review

### Phase 8 — User interface

Implement these pages:

- Chat / Research Run composer
- Research Run dashboard
- Flow card and screenshot timeline
- Job Inbox
- Daily Desk
- Job Detail
- Candidate Profile
- Evidence Library
- Policy Inspector
- Decision Audit timeline
- Cover-letter verification view

The Research Run dashboard must resemble a multi-flow research gallery:

- 10 visible flow cards max
- current status per flow
- latest screenshot
- step timeline
- discovered/extracted/evaluated counts
- stop control per flow
- Stop All control
- error state and error category
- no sensitive data in screenshots or events

### Phase 9 — Cover letter safety

Use a separate generation provider for drafting only.

Pipeline:

1. Generate a draft from job data and verified evidence.
2. Extract atomic claims.
3. Verify every claim against evidence with Jev typed decisions.
4. Apply deterministic blocking rules.
5. Block Ready status if any unsupported claim exists.
6. Show matched evidence and required user edits.

### Phase 10 — Test and operational quality

Required tests:

- policy engine unit tests
- CSV import tests
- profile-schema validation tests
- flow-plan validation tests
- browser action allowlist tests
- stale-observation rejection tests
- screenshot event tests
- extraction normalization tests
- duplicate detection tests
- Jev provider mock tests
- evidence-match tests
- claim-verification blocking tests
- queue retry and cancellation tests
- end-to-end demo run tests

## Suggested task hierarchy

```text
ResearchRun
  → DiscoveryFlow
    → BrowserObservation
    → BrowserEvent
    → ScreenshotArtifact
    → ExtractedJobCandidate
      → JobPosting
        → JobEvaluation
        → EvidenceMatch
        → DecisionAudit
```

## Browser action policy

Allowed in read-only discovery:

- navigate to approved URL
- type a user-approved search term
- select filters
- click visible search-result cards
- open visible job details
- scroll
- paginate within approved domains
- capture screenshots
- extract visible public information
- stop

Forbidden:

- login
- submit
- Easy Apply
- send message
- upload
- create account
- payment
- arbitrary code execution
- CAPTCHA interaction
- anti-bot bypass

## Acceptance criteria

The first shipped slice is accepted when:

1. A user can type a job-discovery goal.
2. The application renders 3 planned flow cards immediately.
3. Three isolated Playwright contexts run with concurrency 2 or 3.
4. Every flow emits status and at least one screenshot.
5. The system extracts at least demo job records into the canonical schema.
6. Policy routes the records into apply/review/skip.
7. Jev demo/provider returns typed signals.
8. The UI shows evidence matches and structured reasons.
9. No external application action is available.
10. Stop Flow and Stop All work.

## Coding expectations

- Use TypeScript strict mode.
- Prefer small pure functions for policy and scoring.
- Validate all provider inputs and outputs with Zod.
- Use typed event contracts.
- Keep browser code in workers, never in frontend routes.
- Use idempotency keys for queue task creation.
- Store immutable audit records.
- Use feature flags for every external provider.
- Add no decorative boilerplate or placeholder architecture that cannot run.
