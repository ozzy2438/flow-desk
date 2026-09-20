import { z } from "zod";
import { deriveSearchTerms } from "../browser/deriveSearchTerm";
import type { SourceDefinition } from "../browser/sourceRegistry";
import type { RawJobInput } from "../jobs/types";
import {
  fetchPublicJson,
  importPublicJobUrl,
  JobSourceFetchError,
  UnsupportedJobUrlError,
} from "../jobs/urlImport";

type FetchLike = typeof fetch;

const greenhouseListSchema = z.object({
  jobs: z.array(
    z.object({
      id: z.union([z.number(), z.string()]),
      title: z.string(),
      location: z.object({ name: z.string().optional() }).optional(),
    }),
  ),
});

const leverListSchema = z.array(
  z.object({
    id: z.string(),
    text: z.string(),
    categories: z
      .object({
        location: z.string().optional(),
        allLocations: z.array(z.string()).optional(),
      })
      .default({}),
    country: z.string().nullable().optional(),
    workplaceType: z.string().optional(),
  }),
);

export type PublicAtsSourceDefinition = SourceDefinition & { kind: "PUBLIC_ATS" };

/**
 * Accepts a company-level public Greenhouse or Lever board URL and converts
 * it to a code-owned official API list endpoint. Individual posting URLs are
 * also accepted and reduced to their parent board.
 */
export function parsePublicAtsBoardUrl(inputUrl: string): PublicAtsSourceDefinition {
  let url: URL;
  try {
    url = new URL(inputUrl);
  } catch {
    throw new UnsupportedJobUrlError(
      "Enter a complete https:// company job-board URL.",
      "UNSUPPORTED_SOURCE",
    );
  }
  if (url.protocol !== "https:") {
    throw new UnsupportedJobUrlError(
      "Only https:// company job-board URLs are accepted.",
      "UNSUPPORTED_SOURCE",
    );
  }

  const host = url.hostname.toLowerCase();
  const parts = url.pathname.split("/").filter(Boolean);

  if (
    host === "www.linkedin.com" ||
    host === "linkedin.com" ||
    host === "seek.com" ||
    host.endsWith(".seek.com") ||
    host === "seek.com.au" ||
    host.endsWith(".seek.com.au")
  ) {
    throw new UnsupportedJobUrlError(
      "LinkedIn and SEEK searches use the signed-in browser capture path, not unattended Research Run scraping. Add a public employer Greenhouse/Lever board here, or import a visible LinkedIn/SEEK job in Job Inbox.",
      "MANUAL_CAPTURE_REQUIRED",
    );
  }

  if (host === "boards.greenhouse.io" || host === "job-boards.greenhouse.io") {
    const boardToken = parts[0];
    if (boardToken) return greenhouseDefinition(boardToken);
  }
  if (
    host === "boards-api.greenhouse.io" &&
    parts[0] === "v1" &&
    parts[1] === "boards" &&
    parts[2]
  ) {
    return greenhouseDefinition(parts[2]);
  }

  const isLeverGlobal = host === "jobs.lever.co" || host === "api.lever.co";
  const isLeverEu = host === "jobs.eu.lever.co" || host === "api.eu.lever.co";
  if (isLeverGlobal || isLeverEu) {
    const hostedParts = host.startsWith("jobs.") ? parts : parts.slice(2);
    const site = hostedParts[0];
    if (site) return leverDefinition(site, isLeverEu ? "eu" : "global");
  }

  throw new UnsupportedJobUrlError(
    "Research Run live sources currently support public Greenhouse and Lever company boards.",
    "UNSUPPORTED_SOURCE",
  );
}

export function isPublicAtsBoardApiUrl(inputUrl: string): boolean {
  try {
    const url = new URL(inputUrl);
    return (
      (url.hostname === "boards-api.greenhouse.io" &&
        /^\/v1\/boards\/[^/]+\/jobs$/.test(url.pathname)) ||
      ((url.hostname === "api.lever.co" || url.hostname === "api.eu.lever.co") &&
        /^\/v0\/postings\/[^/]+$/.test(url.pathname))
    );
  } catch {
    return false;
  }
}

export async function discoverPublicAtsJobs(
  boardApiUrl: string,
  goal: string,
  maxJobs: number,
  fetchImpl: FetchLike = fetch,
): Promise<RawJobInput[]> {
  const url = new URL(boardApiUrl);
  const terms = deriveSearchTerms(goal);
  const limit = Math.max(0, Math.min(maxJobs, 20));
  if (limit === 0) return [];

  const payload = await fetchPublicJson(boardApiUrl, fetchImpl);
  const matchingLocationUrls: string[] = [];
  const unknownLocationUrls: string[] = [];

  if (url.hostname === "boards-api.greenhouse.io") {
    const parsed = greenhouseListSchema.parse(payload);
    const parts = url.pathname.split("/").filter(Boolean);
    const boardToken = parts[2];
    if (!boardToken) throw new JobSourceFetchError("Invalid Greenhouse board API URL.");
    for (const job of parsed.jobs) {
      if (matchesGoal(job.title, terms)) {
        const locationMatch = matchRequestedLocation(job.location?.name, goal);
        const postingUrl = `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(boardToken)}/jobs/${encodeURIComponent(String(job.id))}`;
        if (locationMatch === "MATCH") matchingLocationUrls.push(postingUrl);
        if (locationMatch === "UNKNOWN") unknownLocationUrls.push(postingUrl);
      }
    }
  } else {
    const parsed = leverListSchema.parse(payload);
    const parts = url.pathname.split("/").filter(Boolean);
    const site = parts[2];
    if (!site) throw new JobSourceFetchError("Invalid Lever board API URL.");
    for (const job of parsed) {
      const locations = [
        job.categories.location,
        ...(job.categories.allLocations ?? []),
        job.country,
        job.workplaceType,
      ]
        .filter(Boolean)
        .join(" · ");
      if (matchesGoal(job.text, terms)) {
        const locationMatch = matchRequestedLocation(locations, goal);
        const postingUrl = `https://${url.hostname}/v0/postings/${encodeURIComponent(site)}/${encodeURIComponent(job.id)}`;
        if (locationMatch === "MATCH") matchingLocationUrls.push(postingUrl);
        if (locationMatch === "UNKNOWN") unknownLocationUrls.push(postingUrl);
      }
    }
  }

  const postingUrls = [...matchingLocationUrls, ...unknownLocationUrls].slice(0, limit);

  const jobs: RawJobInput[] = [];
  // Research Run sources are parallel. Requests inside one company board
  // remain sequential to keep per-domain load deliberately conservative.
  for (const postingUrl of postingUrls) {
    jobs.push(await importPublicJobUrl(postingUrl, fetchImpl));
  }
  return jobs;
}

export function applyDiscoveryEligibility(
  job: RawJobInput,
  goal: string,
  now: Date = new Date(),
): { eligible: boolean; job: RawJobInput; reason?: string } {
  if (job.applicationDeadline && new Date(job.applicationDeadline).getTime() < now.getTime()) {
    return { eligible: false, job, reason: "The source's application deadline has passed." };
  }

  const maxAgeDays = requestedMaxAgeDays(goal);
  const uncertainties = [...job.eligibilityUncertainties];
  if (maxAgeDays != null) {
    if (!job.postedAt) {
      uncertainties.push(
        `The research goal requires a posting from the last ${maxAgeDays} days, but this source does not expose a verifiable published date.`,
      );
    } else {
      const ageMs = now.getTime() - new Date(job.postedAt).getTime();
      if (ageMs > maxAgeDays * 24 * 60 * 60 * 1000) {
        return {
          eligible: false,
          job,
          reason: `The verified published date is older than the requested ${maxAgeDays}-day window.`,
        };
      }
    }
  }

  if (requestsSpecificLocation(goal)) {
    const locationEvidence = [
      job.location,
      job.country,
      job.workplaceType === "REMOTE" ? "remote" : undefined,
    ]
      .filter(Boolean)
      .join(" · ");
    const locationMatch = matchRequestedLocation(locationEvidence, goal);
    if (locationMatch === "MISMATCH") {
      return {
        eligible: false,
        job,
        reason: "The source's verified location does not match the research goal.",
      };
    }
    if (locationMatch === "UNKNOWN") {
      uncertainties.push(
        "The research goal has a location constraint, but this source does not expose a verifiable job location.",
      );
    }
  }

  return {
    eligible: true,
    job: { ...job, eligibilityUncertainties: [...new Set(uncertainties)] },
  };
}

function matchesGoal(title: string, terms: string[]): boolean {
  if (terms.length === 0) return true;
  const normalized = title.toLowerCase().replace(/[-_/]/g, " ");
  return terms.some((term) => normalized.includes(term.replace(/-/g, " ")));
}

function matchRequestedLocation(
  location: string | undefined,
  goal: string,
): "MATCH" | "UNKNOWN" | "MISMATCH" {
  if (!requestsSpecificLocation(goal)) return "MATCH";
  if (!location?.trim()) return "UNKNOWN";
  const lowerGoal = goal.toLowerCase();
  const lowerLocation = location.toLowerCase();
  const melbourneMatch = /melbourne|\bvic\b|victoria/.test(lowerLocation);
  const remoteMatch = /remote|anywhere/.test(lowerLocation);
  return (
    (/melbourne/.test(lowerGoal) && melbourneMatch) ||
    (/\bremote\b|uzaktan/.test(lowerGoal) && remoteMatch)
  )
    ? "MATCH"
    : "MISMATCH";
}

function requestsSpecificLocation(goal: string): boolean {
  return /melbourne|\bremote\b|uzaktan/i.test(goal);
}

function requestedMaxAgeDays(goal: string): number | null {
  const english = goal.match(/(?:last|past)\s+(\d{1,3})\s+days?/i);
  const turkish = goal.match(/son\s+(\d{1,3})\s+g[uü]n/i);
  const value = Number(english?.[1] ?? turkish?.[1]);
  return Number.isInteger(value) && value > 0 ? value : null;
}

function greenhouseDefinition(boardToken: string): PublicAtsSourceDefinition {
  const startUrl = `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(boardToken)}/jobs`;
  return {
    kind: "PUBLIC_ATS",
    id: `GREENHOUSE_BOARD:${boardToken}`,
    label: `${boardToken} · Greenhouse public board`,
    resolveStartUrl: async () => startUrl,
    allowedDomains: ["boards-api.greenhouse.io"],
    defaultGoal: "Read currently published jobs from the official Greenhouse Job Board API.",
    defaultStopCondition:
      "All matching published jobs are evaluated, or the configured budget is reached.",
  };
}

function leverDefinition(site: string, region: "global" | "eu"): PublicAtsSourceDefinition {
  const host = region === "eu" ? "api.eu.lever.co" : "api.lever.co";
  const startUrl = `https://${host}/v0/postings/${encodeURIComponent(site)}`;
  return {
    kind: "PUBLIC_ATS",
    id: `LEVER_BOARD:${region}:${site}`,
    label: `${site} · Lever public board`,
    resolveStartUrl: async () => startUrl,
    allowedDomains: [host],
    defaultGoal: "Read currently published jobs from the official Lever Postings API.",
    defaultStopCondition:
      "All matching published jobs are evaluated, or the configured budget is reached.",
  };
}
