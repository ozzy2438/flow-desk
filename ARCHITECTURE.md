# Flow Desk Architecture

## Purpose

Flow Desk is an evidence-backed job-discovery workspace. A user writes a search goal into a chat screen. A planner turns that goal into several bounded, read-only browser flows. Each flow runs in an isolated Playwright browser context, captures screenshots and structured events, extracts job postings, applies deterministic policy, requests Jev typed decisions, matches verified evidence, and routes results into a human-reviewed shortlist.

The system does not submit job applications, message recruiters, upload documents, bypass logins, bypass CAPTCHAs, or execute arbitrary browser code.

## Product loop

```text
Chat goal
  → flow plan
  → task queue
  → parallel browser contexts
  → screenshots and browser events
  → normalized JobPosting records
  → deterministic policy filters
  → Jev structured decisions
  → evidence matches
  → Daily Desk / Inbox / Review queue
  → human-approved application preparation
```

## Responsibility boundaries

| Layer | Owns | Must not own |
|---|---|---|
| Browser worker | Public-page navigation, extraction, screenshots, event emission | Career judgment, application submission, arbitrary model instructions |
| Planner | Turns a search goal into validated bounded flow definitions | Browser execution or direct external actions |
| Policy engine | Hard constraints, thresholds, duplicate rules, risk gates | Free-form text generation |
| Jev | Typed fit, ambiguity, evidence and action-routing decisions | Browser selectors, code generation, cover-letter writing |
| Generation provider | Drafts and structured extraction proposals | Final approval, factual authority, policy enforcement |
| Human user | Approval of consequential actions | Repetitive discovery and deterministic filtering |

## Main services

### 1. Web application

A Next.js / React UI offers:

- Chat-style research command composer
- Flow-count control with default 3 and maximum 10
- Research Run dashboard
- Per-flow live screenshot cards
- Job Inbox
- Job Detail and evidence timeline
- Daily Desk
- Candidate profile and evidence library
- Policy inspector
- Cover-letter claim-review page

### 2. API and orchestration service

The API validates requests, creates a `ResearchRun`, asks the planner for structured flow candidates, validates those candidates against an allowlist, writes `DiscoveryFlow` records, and enqueues browser tasks.

### 3. Queue and workers

Use Redis plus BullMQ, Inngest, Trigger.dev, or an equivalent durable queue. The queue prevents long-running browser sessions from living inside an HTTP request. It manages retries, cancellations, timeouts and concurrency.

### 4. Browser worker

Each browser worker receives exactly one flow. It creates an isolated Playwright browser context, opens permitted pages, emits structured status events, collects screenshots, extracts visible public job data, validates postconditions, and closes the context.

### 5. Candidate evidence service

The service imports the canonical candidate profile, profile schema and decision policy. It exposes verified evidence for matching but never invents facts.

### 6. Decision service

The decision service wraps Jev. It receives normalized state and typed questions for role fit, skills fit, seniority fit, ambiguity, blocker likelihood, evidence relevance and routing recommendation.

### 7. Policy engine

The policy engine is deterministic, versioned and independently tested. It decides whether a job becomes `APPLY_CANDIDATE`, `REVIEW_REQUIRED` or `SKIP`.

## Core data model

```text
ResearchRun
  └── DiscoveryFlow (1..10)
        ├── BrowserEvent (many)
        ├── ScreenshotArtifact (many)
        ├── BrowserObservation (many)
        └── ExtractedJobCandidate (many)
              └── JobPosting
                    ├── JobEvaluation
                    ├── EvidenceMatch (many)
                    └── DecisionAudit (many)
```

### ResearchRun

```ts
type ResearchRun = {
  id: string;
  userId: string;
  userGoal: string;
  requestedFlowCount: number;
  mode: "READ_ONLY";
  status: "PLANNING" | "QUEUED" | "RUNNING" | "COMPLETED" | "CANCELLED" | "PARTIAL_FAILURE" | "FAILED";
  createdAt: Date;
  completedAt: Date | null;
};
```

### DiscoveryFlow

```ts
type DiscoveryFlow = {
  id: string;
  researchRunId: string;
  source: "SEEK" | "LINKEDIN" | "INDEED" | "JORA" | "CAREER_SITE" | "OTHER";
  title: string;
  startUrl: string;
  goal: string;
  stopCondition: string;
  allowedDomains: string[];
  allowedActions: BrowserActionKind[];
  maxPages: number;
  maxSteps: number;
  maxDurationSeconds: number;
  status: "QUEUED" | "OPENING_BROWSER" | "RUNNING" | "COMPLETE" | "FAILED" | "CANCELLED";
};
```

### Browser observation

```ts
type BrowserObservation = {
  id: string;
  flowId: string;
  observationVersion: string;
  url: string;
  title: string;
  visibleTextSummary: string;
  elements: BrowserElement[];
  screenshotArtifactId: string | null;
  capturedAt: Date;
};

type BrowserElement = {
  id: string;
  role: "button" | "link" | "textbox" | "combobox" | "checkbox" | "tab" | "option" | "other";
  name: string;
  value: string | null;
  visible: boolean;
  enabled: boolean;
  supportedActions: BrowserActionKind[];
  risk: "NONE" | "LOW" | "MEDIUM" | "HIGH" | "IRREVERSIBLE";
};
```

### Normalized job posting

```ts
type JobPosting = {
  id: string;
  source: string;
  sourceUrl: string | null;
  sourceExternalId: string | null;
  title: string;
  company: string | null;
  location: string | null;
  country: string | null;
  workplaceType: "REMOTE" | "HYBRID" | "ONSITE" | "UNKNOWN";
  employmentType: "FULL_TIME" | "PART_TIME" | "CONTRACT" | "CASUAL" | "FIXED_TERM" | "UNKNOWN";
  seniority: "ENTRY" | "MID" | "SENIOR" | "LEAD" | "UNKNOWN";
  postedAt: Date | null;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string | null;
  descriptionRaw: string;
  responsibilities: string[];
  requiredSkills: string[];
  preferredSkills: string[];
  visaRequirements: string[];
};
```

## Browser safety model

All discovery starts in read-only mode.

Allowed actions initially:

- open approved job source pages
- type a user-approved search term
- choose search filters
- scroll
- open a visible job detail page
- move to an approved result page
- extract visible public job information
- capture screenshots
- stop

Disallowed actions initially:

- logging in
- applying or submitting a form
- clicking Easy Apply or equivalent submission controls
- uploading documents
- messaging recruiters
- account creation
- payment
- CAPTCHA solving or bypass
- anti-bot circumvention
- arbitrary generated JavaScript, CSS selectors or Playwright commands

## Parallelism model

The UI may show 10 flow cards immediately, but only a safe configured number of browser contexts should run concurrently.

```text
10 planned flows
  → 10 visible cards
  → default concurrency 3
  → maximum explicit concurrency 5
  → hard maximum 10 only in a controlled environment
```

One Chromium process can host several isolated Playwright browser contexts. Each context has its own storage and pages. The worker closes the context after the flow ends. This produces the visual effect of many browsers opening at once without opening many desktop windows.

## Stale-state protection

Every Jev browser decision must include the `observationVersion` from which it was made. Before execution, the worker checks that the current observation version is identical. If it is not identical, the worker discards the decision and captures a new observation. This prevents execution against a re-rendered or navigated page.

## Completion and failure

Every flow has:

- an approved start URL
- an explicit goal
- an explicit stop condition
- a page limit
- a step limit
- a duration limit
- an allowed-domain list
- an action allowlist
- a failure policy

Examples of stop events:

- the desired number of job cards was extracted
- the source result list was exhausted
- a job detail record satisfies the extraction schema
- a login wall appeared
- a CAPTCHA appeared
- the maximum duration elapsed
- the user pressed Stop

## Human-in-the-loop

The product can discover, score, sort, save locally and prepare application materials. The user must explicitly approve opening a third-party application page, filling any external form, uploading documents, sending messages or submitting an application.

## Success metrics

- Percentage of discovered jobs successfully normalized
- Percentage routed to correct policy bucket after human review
- Evidence-match precision
- Unsupported claims blocked before Ready status
- Time from research command to Daily Desk shortlist
- User acceptance rate for recommendations
- Number of browser failures by source
- Median flow duration and screenshot/event latency
