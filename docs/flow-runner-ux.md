# Parallel Flow Runner UX

## User experience

The user enters one natural-language research goal and chooses a flow count between one and ten.

Example:

```text
Find Melbourne or remote Data Scientist, AI Engineer, Applied AI Engineer,
Frontend Engineer, Full-Stack Engineer and Automation Engineer jobs from the
last seven days. Include permanent, fixed-term and contract opportunities.
```

The application immediately creates a `ResearchRun`, then shows planned cards before browsers have finished opening.

```text
Research Run: Melbourne Data, AI and Automation
10 flows planned · Read-only mode

[ Google Jobs      Opening browser ]
[ SEEK             Queued ]
[ LinkedIn Jobs    Queued ]
[ Indeed           Queued ]
[ Jora             Queued ]
[ Career sites     Queued ]
...
```

The UI can show ten cards while the worker pool only executes a smaller bounded number at once.

## Card states

```text
PLANNING
QUEUED
OPENING_BROWSER
OPEN_PAGE
SEARCHING
OPENING_JOB_DETAIL
EXTRACTING
EVALUATING
COMPLETE
FAILED
CANCELLED
```

Each card shows:

- source name
- flow title
- current status
- elapsed duration
- latest screenshot
- latest step label
- jobs discovered
- jobs normalized
- jobs routed to apply/review/skip
- Stop control
- detail drawer with event timeline

## Screenshot timeline

A screenshot is not merely decorative. It is an evidence artifact for browser behavior and extraction provenance.

Example:

```text
1. Open source             screenshot
2. Search for role         screenshot
3. Apply location filter   screenshot
4. Open job detail         screenshot
5. Extract visible details screenshot
6. Stop: posting captured  screenshot
```

Keep screenshots scoped to what the user should see. Blur or avoid capturing credentials, personal data, payment fields and unrelated browser content.

## Planning preview

Before execution, show the user the planned flows and allow removal of any source.

```text
Google Jobs · Melbourne AI Engineer · approved
SEEK · Melbourne Data Scientist · approved
LinkedIn Jobs · remote Applied AI Engineer · review source policy
```

The user should be able to start the whole batch, start one flow, remove a flow or reduce the count. This is both safer and easier to debug.

## Failure UX

Never hide failure behind a permanent loading state. Explain category, not internal stack traces.

| Failure | User-facing message |
|---|---|
| Login required | This source requires a user session. The read-only flow stopped. |
| CAPTCHA | This source requested human verification. The flow stopped without trying to bypass it. |
| Rate limited | The source limited requests. The flow was paused and can be retried later. |
| Timeout | The page did not reach a usable state within the allowed time. |
| Extraction incomplete | The page opened but critical job fields were not visible. The job was routed to review if retained. |
| Policy blocked | The source or action is not permitted by the current policy. |

## Completion UX

At the end of a run, do not show raw browser data first. Show a concise outcome.

```text
Run complete

28 job records discovered
19 records normalized
7 passed deterministic filters
4 are strong apply candidates
3 require review
12 were skipped by policy
```

Then expose detail views, evidence and screenshots for audit.
