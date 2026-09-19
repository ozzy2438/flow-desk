# Browser Worker Design

## Principle

A browser worker is an evidence collector, not an autonomous web agent. It is allowed to perform only actions present in a code-owned action allowlist. It cannot execute model-generated code or arbitrary selectors.

## Isolation

Use one Playwright browser context per flow. Contexts isolate storage and pages while allowing one Chromium process to host several flows.

```ts
import { chromium } from "playwright";

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 960 },
});
const page = await context.newPage();
```

Use a concurrency limiter around flow execution. Do not use unlimited `Promise.all` against browser contexts.

## Worker lifecycle

```text
Receive queue job
  → load validated flow
  → create browser context
  → start trace if enabled
  → emit OPENING_BROWSER
  → open approved start URL
  → capture observation and screenshot
  → build code-owned action space
  → request only allowed decision routing
  → execute compatible action
  → verify postcondition
  → repeat until stop condition or budget
  → persist artifacts
  → close context
```

## Observation

The worker records:

- URL
- title
- page timestamp
- visible text summary
- visible interactive elements
- element roles, labels and values
- screenshot ID
- observation version
- recent actions

The worker should exclude hidden fields, password fields, payment fields, cookies, auth headers, tokens and unrelated personal data.

## Action allowlist

```ts
type BrowserActionKind =
  | "CLICK"
  | "TYPE_TEXT"
  | "SELECT_OPTION"
  | "SCROLL"
  | "NEXT_PAGE"
  | "OPEN_JOB_DETAIL"
  | "EXTRACT_JOB"
  | "WAIT"
  | "STOP";
```

Every target is discovered by code and represented by a local ID. The model may select a target only from the provided choices.

## Stale-state protection

The decision request includes the observation version. Before an action is executed:

```ts
if (decision.observationVersion !== currentObservation.observationVersion) {
  return captureFreshObservation();
}
```

A decision never survives a page navigation or re-render.

## Postconditions

A successful click is not proof of a successful flow. Validate expected results after every action.

Examples:

- Opening job detail: title, selected card or description panel changes.
- Pagination: result-set identity or page parameter changes.
- Search query: input value changes and result list settles.
- Extraction: required job fields become visible.

If a postcondition fails, do not retry blindly. Re-observe, stop or route to failure based on risk.

## Screenshots and traces

Store screenshots in object storage. Keep metadata in PostgreSQL. Enable Playwright trace capture only under a debug policy, because traces can retain sensitive page state.

## Cancellation

Support:

- stop current flow
- stop all flows in a research run
- cancel queued jobs before worker claim
- mark running job cancellation requested
- close its context gracefully

## Resource limits

Suggested initial budgets:

```text
contexts concurrently running: 2 or 3
pages per flow: 3
steps per flow: 20
seconds per flow: 120
screenshots per flow: 8
```

Use per-domain concurrency limits. A source should not receive many simultaneous sessions by default.
