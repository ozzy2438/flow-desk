# flow-desk

Evidence-backed job discovery workspace. Runs several web-flow research tasks in parallel, isolated Playwright browser contexts, evaluates each result with typed decisions against a canonical candidate profile and a decision policy, and produces a human-approved shortlist. Never applies on your behalf.

This repository started as an infrastructure blueprint (`ARCHITECTURE.md`, `AGENCY_BRIEF.md`, `STACK.md`, `SETUP.md`, `docs/`) and is now a working implementation of it, milestone by milestone through `SETUP.md`. The design docs are still the source of truth for *why* things are built the way they are; this file covers running what's here.

## What this product does

You type a research goal into a chat box, for example:

> Find Melbourne or remote Data Scientist, AI Engineer, Applied AI Engineer, Frontend Engineer and Automation Engineer roles from the last 7 days. Include contract, fixed-term and independent-delivery-compatible opportunities. Only show me postings that a strong application can be built for from my verified evidence library.

The planner turns the request into up to 10 structured discovery flows against an allowlisted source registry. Each flow runs in an isolated Playwright browser context. Screenshots and step events stream back to the UI over SSE as live cards, so you see all flows working in parallel. Each discovered job is normalized, filtered by a deterministic policy engine, evaluated by a typed decision provider, matched against your evidence library, and routed into apply / review / skip. Daily Desk shows only the strong apply candidates and the postings that need a human look.

## Quickstart

Requires Node 22+, PostgreSQL and Redis (a `docker-compose.yml` is provided for both).

```bash
pnpm install
docker compose up -d          # or point DATABASE_URL / REDIS_URL at your own instances
cp .env.example .env
pnpm db:push                  # create the schema
pnpm db:seed                  # load a synthetic demo candidate profile + decision policy
pnpm dev                      # web app on http://localhost:3000
pnpm worker                   # separate process: runs the Playwright flow workers
```

No API key is required for any of this: the decision provider, the cover-letter generator and the browser worker's source are all local/deterministic by default. See "Do I need Jev, OpenAI, Exa, Tavily or Apify?" below for what each optional key actually unlocks.

Run the test suite with `pnpm test` (55 tests: policy engine, CSV import, evidence matching, claim-safety blocking, the queue, and real end-to-end Playwright runs against the bundled fixture job board - the same Postgres/Redis this quickstart sets up is what those integration tests run against).

## Where to start reading

1. `ARCHITECTURE.md` for the system design and data model.
2. `AGENCY_BRIEF.md` for the phase-by-phase requirements this implementation follows.
3. `STACK.md` for the technology choices and rationale.
4. `SETUP.md` for the milestone-by-milestone build order this repo's history follows.
5. `docs/` for deep dives on flow-runner UX, browser workers, decision-provider integration, evidence matching, the policy engine, external data APIs, and security.
6. `data/README.md` for how to load your own candidate profile and decision policy (the demo data from `pnpm db:seed` only fills in until you do).

## Do I need Jev, OpenAI, Exa, Tavily, or Apify?

Short answer: **no key is required to run this end to end.** Every external provider is behind a feature flag (`src/server/flags.ts`) that falls back to a safe local implementation:

- **Decision provider** (role/skills/seniority fit, routing recommendation): a deterministic keyword-overlap heuristic (`src/server/decision/demoProvider.ts`) by default; set `JEV_API_KEY` to switch to the live Jev/TypeSafe provider. Both return the exact same validated shape.
- **Cover-letter drafting**: a template generator that can only ever emit the job title/company and safe claims evidence matching already produced by default; set `OPENAI_API_KEY` to switch to live drafting. Every draft - from either provider - goes through the same claim-verification pipeline before it can reach Ready status.
- **Browser worker**: always runs a real headless Chromium via Playwright, but only ever against the source registry (`src/server/browser/sourceRegistry.ts`), which ships with exactly one entry - a small job board this repo hosts itself locally. It never touches SEEK, LinkedIn, Indeed or any other live site; those all invest heavily in anti-bot controls that `docs/security.md` is explicit about not evading. Wiring a real source is a deliberate follow-up (see `docs/data-apis.md`'s rollout plan), done by adding an entry to the registry plus a matching extractor once you've reviewed that source's terms.
- **Exa / Tavily / Apify**: not wired up. `docs/data-apis.md` covers when you'd want them (broadening discovery before the browser worker starts) and how to add them behind `JobSourceAdapter`.

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
