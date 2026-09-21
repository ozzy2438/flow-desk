# flow-desk

Evidence-backed, browser-first job discovery workspace. Runs several visual research flows in parallel, lets Jev choose among code-owned read-only browser actions and distinct screenshots, evaluates verified jobs against a canonical candidate profile and decision policy, and produces a human-approved shortlist. Never applies on your behalf.

This repository started as an infrastructure blueprint (`ARCHITECTURE.md`, `AGENCY_BRIEF.md`, `STACK.md`, `SETUP.md`, `docs/`) and is now a working implementation of it, milestone by milestone through `SETUP.md`. The design docs are still the source of truth for *why* things are built the way they are; this file covers running what's here.

## What this product does

You type a research goal into a chat box, for example:

> Find Melbourne or remote Data Scientist, AI Engineer, Applied AI Engineer, Frontend Engineer and Automation Engineer roles from the last 7 days. Include contract, fixed-term and independent-delivery-compatible opportunities. Only show me postings that a strong application can be built for from my verified evidence library.

The interface follows one short sequence: write the research request, choose 1-10 flows, read the generated plan, then watch those browser flows work in parallel. Jev chooses the next action only from the safe candidates supplied by code and separately decides which page states add a distinct screenshot to the visual story. Job normalization, evidence matching, policy routing and detailed events still run underneath, but they stay out of the core research surface.

## Quickstart

Requires Node 22+, PostgreSQL and Redis (a `docker-compose.yml` is provided for both).

```bash
pnpm install
pnpm exec playwright install chromium   # one-time browser download for the flow worker
docker compose up -d          # or point DATABASE_URL / REDIS_URL at your own instances
cp .env.example .env
pnpm db:push                  # create the schema
pnpm db:seed                  # load a synthetic demo candidate profile + decision policy
pnpm dev                      # web app on http://localhost:3000
pnpm worker                   # separate process: runs the Playwright flow workers
```

If `pnpm worker` fails a flow with `browserType.launch: Executable doesn't exist`, the
`playwright install` step above was skipped or ran before `pnpm install` finished - run it again.
If you already have Postgres running locally for another project, `docker compose up -d` maps
Postgres to host port 5433 (not the default 5432) specifically to avoid colliding with it; no
existing service on your machine needs to be stopped.

No API key is required for any of this: the decision provider, the cover-letter generator and the browser worker's source are all local/deterministic by default. See "Do I need Jev, OpenAI, Exa, Tavily or Apify?" below for what each optional key actually unlocks.

Run the test suite with `pnpm test` (policy engine, CSV/JSON import, public ATS URL import, evidence matching, claim-safety blocking, the queue, and real end-to-end Playwright runs against the bundled fixture job board - the same Postgres/Redis this quickstart sets up is what those integration tests run against).

## Live job sources without unsafe scraping

Flow Desk now has two explicit live-source paths:

1. **Greenhouse and Lever company boards** — include a supported public company-board URL directly
   in the research request. Flow Desk detects it and splits the requested number of flows into
   distinct research angles. Each flow uses the vendor's official unauthenticated read API for
   source facts, while a bounded browser session opens approved public detail pages and produces
   the visual flow.
2. **LinkedIn, SEEK and other session-bound sources** — open the job in your normal signed-in
   browser, then use **Job Inbox → Paste a LinkedIn, SEEK or other job** with the source URL and
   full visible description. Flow Desk does not copy browser cookies, automate login, bypass
   anti-bot controls, click Apply, or treat a search-card timestamp as authoritative.

You can also paste an individual public Greenhouse or Lever job URL into **Job Inbox → Import a
public job URL**. Unknown recency never becomes an Apply Candidate merely because the listing is
currently open: a last-N-days goal with no verifiable published date is routed to Review Required.

## Where to start reading

1. `ARCHITECTURE.md` for the system design and data model.
2. `AGENCY_BRIEF.md` for the phase-by-phase requirements this implementation follows.
3. `STACK.md` for the technology choices and rationale.
4. `SETUP.md` for the milestone-by-milestone build order this repo's history follows.
5. `docs/` for deep dives on flow-runner UX, browser workers, decision-provider integration, evidence matching, the policy engine, external data APIs, and security.
6. `data/README.md` for how to load your own candidate profile and decision policy (the demo data from `pnpm db:seed` only fills in until you do).

## Do I need Jev, OpenAI, Exa, Tavily, or Apify?

Short answer: **no key is required to run this end to end.** Every external provider is behind a feature flag (`src/server/flags.ts`) that falls back to a safe local implementation:

- **Jev providers**: the browser provider chooses code-owned actions and distinct screens; the job provider scores role/skills/seniority fit and routing. Demo mode uses deterministic implementations for both. Set `APP_MODE=live` and `JEV_API_KEY` to activate the live TypeSafe endpoint.
- **Cover-letter drafting**: a template generator that can only ever emit the job title/company and safe claims evidence matching already produced by default; set `OPENAI_API_KEY` to switch to live drafting. Every draft - from either provider - goes through the same claim-verification pipeline before it can reach Ready status.
- **Browser worker and public ATS flows**: demo mode uses isolated Playwright contexts against the bundled local board. Operator-supplied Greenhouse or Lever boards combine official public GET data with visual capture of approved hosted job pages. LinkedIn and SEEK create one compact signed-in-browser disclosure only when named in the request; Flow Desk never automates their login, CAPTCHA or Apply surfaces.
- **Exa / Tavily / Apify**: not wired up. `docs/data-apis.md` covers when you'd want them for broader discovery. They are not required for the built-in Greenhouse/Lever public ATS path.

## Non-negotiable safety rules

- Read-only browser mode by default
- Never auto-submit an application
- Never send messages or upload files without explicit user confirmation
- Never bypass logins, CAPTCHAs, or platform anti-bot measures
- Every browser decision is bound to an observation version
- Every cover-letter claim must be supported by verified evidence or the draft is blocked
- All provider keys stay server-side

## Repository layout

```
flow-desk/
├── README.md                   ← you are here
├── ARCHITECTURE.md             ← system design
├── AGENCY_BRIEF.md             ← phase-by-phase requirements
├── STACK.md                    ← technology decisions and rationale
├── SETUP.md                    ← milestone-by-milestone build order
├── docs/                       ← design deep dives (flow UX, browser worker, decisions, evidence, policy, data APIs, security)
├── data/                       ← drop your real candidate-profile/decision-policy CSVs here (gitignored)
├── fixtures/demo-data/         ← synthetic CSVs pnpm db:seed loads until you do
├── fixtures/                   ← the local demo job board's own data (src/server/browser/sources)
├── prisma/                     ← schema.prisma + seed.ts
├── src/
│   ├── app/                    ← Next.js App Router pages and API routes
│   ├── components/             ← client components (composer, run dashboard, import forms, ...)
│   └── server/
│       ├── profile/ policy/    ← CSV import + versioning
│       ├── jobs/                ← normalization, dedupe, evaluate pipeline
│       ├── policy/engine.ts    ← the deterministic policy engine
│       ├── decision/            ← DecisionProvider (demo + Jev)
│       ├── evidence/            ← evidence matching
│       ├── coverLetter/         ← draft + claim-safety pipeline
│       ├── browser/             ← Playwright worker, action allowlist, source registry
│       ├── planner/             ← goal -> DiscoveryFlow candidates
│       └── queue/               ← BullMQ + the worker process entrypoint
└── tests/
    ├── unit/                   ← pure logic, no infrastructure required
    └── integration/            ← real Postgres/Redis/Playwright
```
