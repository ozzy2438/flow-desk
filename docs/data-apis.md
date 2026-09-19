# Data APIs and Providers

## Direct answer

Jev is a decision API, not a browser, crawler, search engine or screenshot service. A parallel browser-flow product needs additional infrastructure.

## Required baseline

### Playwright

Use Playwright for the actual browser contexts, pages, screenshots, traces and controlled actions. It is the baseline requirement for the reference-style visual experience where multiple flows visibly open pages and produce step screenshots.

## Optional discovery and data providers

### Built-in public ATS adapters

Greenhouse Job Board API and Lever Postings API are the first live sources implemented in this
repository. Both expose published jobs through unauthenticated public GET endpoints intended for
careers pages:

- Greenhouse: `GET https://boards-api.greenhouse.io/v1/boards/{board_token}/jobs`
- Lever: `GET https://api.lever.co/v0/postings/{site}` (or the EU host)

The operator supplies company-board URLs on each Research Run; Flow Desk normalizes them to the
fixed vendor API hosts, filters by explicit role/location terms, fetches details sequentially per
domain, stores source-verification facts and evaluates the results through the same policy/evidence
pipeline. A public-feed result proves that the job was published when fetched. It does not prove a
recent posting date unless the source exposes one.

LinkedIn and SEEK are deliberately not treated as equivalent read APIs. Their partner APIs are for
approved recruitment-software integrations and do not provide a general candidate-side search API.
Use signed-in browser capture + full-JD paste for those sources; never reuse cookies in the worker.

### Exa or Tavily

Use a semantic-search provider when you need discovery before browsing:

- find niche job boards
- find employer career pages
- find Melbourne startups hiring in an area
- find contract opportunities outside known sources
- discover company sites from a role family

Neither provider replaces Playwright. They return likely source URLs; the browser worker later handles bounded page interaction and screenshot capture.

### Apify

Use Apify only if a reviewed actor or data source improves a specific source workflow. It can reduce engineering work for batch retrieval, but it does not remove the need to respect source terms, rate limits, authentication boundaries and user privacy.

Create an adapter:

```ts
interface JobSourceAdapter {
  discover(input: DiscoveryQuery): Promise<SourceCandidate[]>;
  extract(input: SourceCandidate): Promise<RawJobPayload[]>;
}
```

Then Apify can be added, disabled or replaced per source.

### Managed browser providers

Consider a managed browser service when production browser operations need remote session management, scale, observability or lower operational burden. Keep a `BrowserSessionProvider` abstraction so self-hosted Playwright remains possible.

## Suggested rollout

```text
Prototype:
Playwright + manually configured source registry + Jev demo provider

First live version:
Public Greenhouse/Lever adapters + PostgreSQL + queue + decision/generation providers

Discovery expansion:
Add Exa or Tavily for career-page and niche-source discovery

Source-specific scale:
Add reviewed source adapters or Apify where appropriate

Operational scale:
Adopt a managed browser-session provider if self-hosting becomes costly
```

## Do not use any provider for

- CAPTCHA bypassing
- evading site access controls
- collecting private account data without authorization
- mass application submission
- sending spam or recruiter messages
- scraping credentials, session tokens or payment data
