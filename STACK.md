# Technology Stack

## Recommended stack

| Concern | Recommendation | Why |
|---|---|---|
| Web UI | Next.js + React + TypeScript | Chat UI, dashboard and server integration in one codebase |
| Styling | Tailwind CSS + accessible component primitives | Fast product UI without custom design-system overhead |
| Database | PostgreSQL | Durable relational records, audit history and queryable workflow state |
| ORM | Prisma or Drizzle | Typed migration and data access layer |
| Queue | BullMQ + Redis, Inngest or Trigger.dev | Durable browser jobs, retry, cancellation and concurrency control |
| Browser automation | Playwright | Isolated contexts, screenshots, tracing, Chromium/Firefox/WebKit support |
| Validation | Zod | Validate user input, flow plans, provider output and browser events |
| Real time | Server-Sent Events first, WebSockets if two-way control is needed | SSE is simpler for progress updates; WebSockets fit interactive remote browser control |
| File / screenshot storage | Cloudflare R2, S3 or Supabase Storage | Browser screenshots and traces should not live in PostgreSQL |
| Decision engine | Jev / TypeSafe AI | Fast typed decisions and calibrated confidence signals |
| Text generation | OpenAI, Claude or equivalent | Cover letters, summaries and structured extraction assistance |
| Observability | Structured logs + Sentry + OpenTelemetry as needed | Diagnose browser failures and provider errors |
| Deployment | Separate web and worker processes | Browser workers need different resource and timeout budgets |

## Browser deployment choices

### Start local or self-hosted

Use Playwright on a dedicated Docker worker service when development volume is low and the team is comfortable maintaining Chromium dependencies.

Pros:

- lower variable cost
- full control
- local debugging is straightforward

Cons:

- browser dependencies and sandboxing need maintenance
- scaling and proxy/session infrastructure becomes your responsibility

### Use a managed remote browser provider

Consider Browserbase, Steel, Hyperbrowser, Browserless, Anchor Browser or equivalent when you need remote sessions, browser debugging, session persistence, video/screenshot streaming, scaling or operational isolation.

Pros:

- easier production browser management
- isolated browser resources
- less container maintenance
- operational observability

Cons:

- additional vendor cost
- provider-specific operational constraints

## Browser contexts

Use one Chromium process with several isolated Playwright contexts for ordinary read-only discovery. Playwright contexts have separate session storage and pages, allowing flows to run independently. Use a bounded concurrency limit.

Start with:

```text
Visible flows: 3
Worker concurrency: 2
Pages per flow: 3
Steps per flow: 20
Duration per flow: 120 seconds
```

Move to five visible parallel flows after source reliability and cost are understood. Do not run ten simultaneous contexts by default simply because the UI can display ten cards.

## Data API decision matrix

| Need | Primary choice | Optional supplement | Why |
|---|---|---|---|
| Actual browser interaction | Playwright | Managed remote browser provider | A browser API is mandatory for screenshots and bounded web flows |
| Job-source discovery | Official APIs where available | Apify actors / source-approved feeds | Job boards vary; prefer official access and respect platform terms |
| Find niche sources, company career pages, new targets | Exa or Tavily | Search-engine APIs | Semantic search helps find sources before browser flows begin |
| Map/business discovery for LocalOps | Google Places or approved provider | Apify where terms permit | Structured local-business discovery is separate from browser browsing |
| Typed policy decisions | Jev | deterministic demo provider | Jev is not a crawler and not a browser controller |
| Cover-letter writing | OpenAI / Claude / equivalent | template engine | Text generation must be separate from Jev |

## Direct answer: Do we need Exa, Tavily or Apify?

### Jev is not a browser-search API

Jev evaluates state against typed questions. It does not discover websites, fetch job listings, operate a browser, preserve sessions or provide screenshots. Browser discovery therefore requires a browser layer such as Playwright, and often a data-source layer.

### Minimum viable implementation

For the first working prototype, use:

```text
Playwright + approved source URLs + PostgreSQL + queue + Jev + generation provider
```

This is sufficient when the user supplies sources or URLs and flows stay read-only.

### When to add Exa or Tavily

Add Exa or Tavily when the product needs to answer questions such as:

- Which Melbourne companies have careers pages mentioning applied AI?
- Which local startups recently posted data or automation roles?
- Where are contract analytics positions listed outside the obvious job boards?
- What niche job boards should a job-discovery run include?

These tools broaden discovery before the browser worker starts.

### When to add Apify

Add Apify only if an approved actor or data source materially improves discovery and the team has reviewed the source terms, data handling and rate limits. Apify is useful for batch data retrieval but should not be assumed to solve every job-board access problem. Keep an adapter boundary so Apify can be disabled or replaced.

### Recommended rollout

1. Build first with Playwright and a manually configured source registry.
2. Add a search adapter for Exa or Tavily to discover career pages and niche sources.
3. Add source-specific adapters only after terms, reliability and legal constraints are reviewed.
4. Add a managed browser provider only when self-hosted Playwright becomes operationally expensive.

## Environment variables

```bash
DATABASE_URL=
REDIS_URL=
JEV_API_KEY=
OPENAI_API_KEY=
S3_BUCKET=
S3_REGION=
S3_ACCESS_KEY_ID=
S3_SECRET_ACCESS_KEY=
SENTRY_DSN=
EXA_API_KEY=
TAVILY_API_KEY=
APIFY_TOKEN=
BROWSER_PROVIDER_API_KEY=
```

Do not require all variables in demo mode. Validate production configuration on boot and expose provider state in an admin-only settings page.
