import http from "node:http";
import type { AddressInfo } from "node:net";
import { DEMO_JOBS } from "./sources/demoJobBoardData";

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
}

function page(title: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <style>
    body { font-family: system-ui, sans-serif; margin: 2rem auto; max-width: 720px; color: #1e293b; }
    .job-card { border: 1px solid #e2e8f0; border-radius: 8px; padding: 1rem; margin-bottom: 0.75rem; }
    .job-title a { font-weight: 600; text-decoration: none; color: #4338ca; }
    .job-company, .job-location { color: #64748b; font-size: 0.9rem; }
    .job-detail-title { font-size: 1.4rem; margin-bottom: 0.25rem; }
    ul { padding-left: 1.2rem; }
    a.back { display: inline-block; margin-bottom: 1rem; color: #4338ca; }
  </style>
</head>
<body>${body}</body>
</html>`;
}

function renderListing(): string {
  const cards = DEMO_JOBS.map(
    (job) => `
    <div class="job-card" data-job-id="${job.id}">
      <div class="job-title"><a href="/jobs/${job.id}">${escapeHtml(job.title)}</a></div>
      <div class="job-company">${escapeHtml(job.company)}</div>
      <div class="job-location">${escapeHtml(job.location)}</div>
    </div>`,
  ).join("\n");
  return page("Flow Desk demo job board", `<h1>Open roles</h1>\n${cards}`);
}

function renderDetail(job: (typeof DEMO_JOBS)[number]): string {
  const required = job.requiredSkills.map((s) => `<li>${escapeHtml(s)}</li>`).join("");
  const preferred = job.preferredSkills.map((s) => `<li>${escapeHtml(s)}</li>`).join("");
  return page(
    job.title,
    `
    <a class="back" href="/jobs">&larr; Back to listing</a>
    <h1 class="job-detail-title">${escapeHtml(job.title)}</h1>
    <p class="job-detail-company">${escapeHtml(job.company)}</p>
    <p class="job-detail-location">${escapeHtml(job.location)}</p>
    <p>Workplace: <span class="job-detail-workplace-type">${job.workplaceType}</span></p>
    <p>Employment: <span class="job-detail-employment-type">${job.employmentType}</span></p>
    <p>Seniority: <span class="job-detail-seniority">${job.seniority}</span></p>
    <p class="job-detail-salary" data-min="${job.salaryMin}" data-max="${job.salaryMax}" data-currency="${job.salaryCurrency}">
      ${job.salaryCurrency} ${job.salaryMin.toLocaleString()}-${job.salaryMax.toLocaleString()}
    </p>
    <h2>Required skills</h2>
    <ul class="job-detail-required-skills">${required}</ul>
    <h2>Preferred skills</h2>
    <ul class="job-detail-preferred-skills">${preferred}</ul>
    <h2>Description</h2>
    <p class="job-detail-description">${escapeHtml(job.description)}</p>
    `,
  );
}

let server: http.Server | undefined;
let baseUrl: string | undefined;

/**
 * Starts (once per process) the local fixture job board that the Playwright
 * worker navigates in Milestone 6's proof of concept. Bound to loopback
 * only - this is test infrastructure for our own code, never a public
 * service.
 */
export async function ensureFixtureServer(): Promise<string> {
  if (baseUrl) return baseUrl;

  server = http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");

    if (url.pathname === "/jobs" || url.pathname === "/jobs/") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(renderListing());
      return;
    }

    const detailMatch = url.pathname.match(/^\/jobs\/([a-z0-9-]+)$/);
    if (detailMatch) {
      const job = DEMO_JOBS.find((j) => j.id === detailMatch[1]);
      if (job) {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(renderDetail(job));
        return;
      }
    }

    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not found");
  });

  await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
  const address = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${address.port}`;
  return baseUrl;
}

export async function closeFixtureServer(): Promise<void> {
  if (!server) return;
  await new Promise<void>((resolve, reject) =>
    server!.close((err) => (err ? reject(err) : resolve())),
  );
  server = undefined;
  baseUrl = undefined;
}
