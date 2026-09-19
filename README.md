# flow-desk

Evidence-backed job discovery workspace. Runs many web-flow research tasks in parallel Playwright browser sessions, evaluates each result with Jev typed decisions against a canonical candidate profile and a decision policy, and produces a human-approved shortlist. Never applies on your behalf.

This repository is an **infrastructure blueprint**. It contains the architecture, agency brief, stack decisions, and step-by-step setup instructions. Product code is intentionally not included; the agency implements it against these documents.

## What this product does

You type a research goal into a chat box, for example:

> Find Melbourne or remote Data Scientist, AI Engineer, Applied AI Engineer, Frontend Engineer and Automation Engineer roles from the last 7 days. Include contract, fixed-term and independent-delivery-compatible opportunities. Only show me postings that a strong application can be built for from my verified evidence library.

The planner turns the request into 5-10 structured discovery flows. Each flow runs in an isolated Playwright browser context. Screenshots and step events stream back to the UI as live cards, so you see all flows working in parallel. Each discovered job is normalized, filtered by deterministic rules, evaluated by Jev, matched against your 64-project evidence library, and routed into apply / review / skip.

## Where to start

1. Read `ARCHITECTURE.md` for the system design.
2. Read `AGENCY_BRIEF.md` for the exact prompt to hand to the implementation team.
3. Read `STACK.md` for the concrete technology choices.
4. Read `SETUP.md` for the step-by-step build order.
5. Read `docs/` for deep dives on flow-runner UX, browser workers, Jev integration, evidence matching, policy engine, external data APIs, and security.
6. Drop `decision-policy.csv`, `candidate-profile.csv`, and `candidate-profile.schema.csv` into `data/`. See `data/README.md`.

## Do I need Exa, Tavily, Apify, or another API besides Jev?

Short answer: **Jev alone is not enough for browser-based research. You need at least Playwright, and depending on scope you will also want one or more of Apify, Exa/Tavily, and a managed remote-browser provider.** Full breakdown in `docs/data-apis.md`.

Quick rule of thumb:

- **Playwright** is mandatory. It runs the actual browsers.
- **Apify** or a similar pre-built scraper platform is recommended if you plan to read LinkedIn, SEEK, Indeed at scale, because those sites invest heavily in anti-bot and rate limiting.
- **Exa** or **Tavily** is useful for semantic web discovery, for example finding company career pages, industry job boards, or niche opportunities you would not think to visit.
- **Browserbase / Steel / Anchor Browser / Hyperbrowser** is optional and useful when you want managed remote browser sessions instead of running Playwright on your own infrastructure.
- **Jev / TypeSafe AI** is the decision engine. It never controls the browser directly.
- A **generation provider** (OpenAI / Claude / Gemini) is used only for cover-letter drafts, structured extraction from unstructured job text, and application answer drafts.

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
├── AGENCY_BRIEF.md             ← prompt to hand to the implementation team
├── STACK.md                    ← technology decisions and rationale
├── SETUP.md                    ← step-by-step build order
├── LICENSE
├── .gitignore
├── package.json                ← seed only; agency may replace
├── tsconfig.json               ← seed only; agency may replace
├── docs/
│   ├── flow-runner-ux.md       ← the parallel-browser UX pattern
│   ├── browser-worker.md       ← Playwright worker design
│   ├── jev-integration.md      ← typed decisions with Jev
│   ├── evidence-matching.md    ← 64-project evidence library
│   ├── policy-engine.md        ← deterministic rules
│   ├── data-apis.md            ← Exa vs Tavily vs Apify vs …
│   └── security.md             ← non-negotiable safety rules
└── data/
    ├── README.md               ← how to drop the three CSVs here
    ├── decision-policy.csv     ← you drop this
    ├── candidate-profile.csv   ← you drop this
    └── candidate-profile.schema.csv  ← you drop this
```
