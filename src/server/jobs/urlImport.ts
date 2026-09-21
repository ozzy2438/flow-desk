import { z } from "zod";
import { rawJobInputSchema, type RawJobInput } from "./types";

const MAX_RESPONSE_BYTES = 2_000_000;
const FETCH_TIMEOUT_MS = 15_000;

export class UnsupportedJobUrlError extends Error {
  constructor(
    message: string,
    public readonly code: "MANUAL_CAPTURE_REQUIRED" | "UNSUPPORTED_SOURCE",
  ) {
    super(message);
    this.name = "UnsupportedJobUrlError";
  }
}

export class JobSourceFetchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "JobSourceFetchError";
  }
}

type FetchLike = typeof fetch;

type SupportedJobUrl =
  | { kind: "GREENHOUSE"; apiUrl: string; boardToken: string; postingId: string; originalUrl: string }
  | { kind: "LEVER"; apiUrl: string; site: string; postingId: string; originalUrl: string };

const greenhouseJobSchema = z.object({
  id: z.union([z.number(), z.string()]),
  title: z.string().min(1),
  company_name: z.string().optional(),
  first_published: z.string().datetime({ offset: true }).nullable().optional(),
  application_deadline: z.string().datetime({ offset: true }).nullable().optional(),
  location: z.object({ name: z.string().optional() }).optional(),
  content: z.string().min(1),
  absolute_url: z.string().url().optional(),
  pay_input_ranges: z
    .array(
      z.object({
        min_cents: z.number().nonnegative(),
        max_cents: z.number().nonnegative(),
        currency_type: z.string().min(1),
      }),
    )
    .optional(),
});

const leverJobSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1),
  categories: z
    .object({
      location: z.string().optional(),
      commitment: z.string().optional(),
      team: z.string().optional(),
      department: z.string().optional(),
      allLocations: z.array(z.string()).optional(),
    })
    .default({}),
  country: z.string().nullable().optional(),
  descriptionPlain: z.string().optional(),
  openingPlain: z.string().optional(),
  additionalPlain: z.string().optional(),
  hostedUrl: z.string().url(),
  workplaceType: z.string().optional(),
  salaryRange: z
    .object({
      currency: z.string().min(1),
      interval: z.string().optional(),
      min: z.number().nonnegative(),
      max: z.number().nonnegative(),
    })
    .optional(),
});

/**
 * Imports one public job from an official, unauthenticated ATS read endpoint.
 * No cookies, browser session, applicant data or application endpoint is used.
 * LinkedIn and SEEK URLs deliberately route to manual capture because their
 * public partner APIs do not provide general candidate-side job search.
 */
export async function importPublicJobUrl(
  inputUrl: string,
  fetchImpl: FetchLike = fetch,
): Promise<RawJobInput> {
  const source = parseSupportedJobUrl(inputUrl);
  const payload = await fetchPublicJson(source.apiUrl, fetchImpl);

  if (source.kind === "GREENHOUSE") {
    return fromGreenhouse(source, greenhouseJobSchema.parse(payload));
  }
  return fromLever(source, leverJobSchema.parse(payload));
}

export function parseSupportedJobUrl(inputUrl: string): SupportedJobUrl {
  let url: URL;
  try {
    url = new URL(inputUrl);
  } catch {
    throw new UnsupportedJobUrlError("Enter a complete https:// job URL.", "UNSUPPORTED_SOURCE");
  }

  if (url.protocol !== "https:") {
    throw new UnsupportedJobUrlError("Only https:// job URLs are accepted.", "UNSUPPORTED_SOURCE");
  }

  const hostname = url.hostname.toLowerCase();
  const parts = url.pathname.split("/").filter(Boolean);

  if (
    hostname === "www.linkedin.com" ||
    hostname === "linkedin.com" ||
    hostname === "seek.com" ||
    hostname.endsWith(".seek.com") ||
    hostname === "seek.com.au" ||
    hostname.endsWith(".seek.com.au")
  ) {
    throw new UnsupportedJobUrlError(
      "LinkedIn and SEEK require a user session and do not expose a general candidate job-search API. Paste the full visible job description below; Flow Desk will preserve the source URL and evaluate it without automating login or anti-bot controls.",
      "MANUAL_CAPTURE_REQUIRED",
    );
  }

  if (hostname === "boards.greenhouse.io" || hostname === "job-boards.greenhouse.io") {
    const [boardToken, jobsSegment, postingId] = parts;
    if (boardToken && jobsSegment === "jobs" && postingId && /^\d+$/.test(postingId)) {
      return {
        kind: "GREENHOUSE",
        boardToken,
        postingId,
        originalUrl: url.toString(),
        apiUrl: `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(boardToken)}/jobs/${encodeURIComponent(postingId)}?pay_transparency=true`,
      };
    }
  }

  if (hostname === "boards-api.greenhouse.io") {
    const [, boardsSegment, boardToken, jobsSegment, postingId] = parts;
    if (
      parts[0] === "v1" &&
      boardsSegment === "boards" &&
      boardToken &&
      jobsSegment === "jobs" &&
      postingId &&
      /^\d+$/.test(postingId)
    ) {
      return {
        kind: "GREENHOUSE",
        boardToken,
        postingId,
        originalUrl: url.toString(),
        apiUrl: `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(boardToken)}/jobs/${encodeURIComponent(postingId)}?pay_transparency=true`,
      };
    }
  }

  const leverRegion =
    hostname === "jobs.lever.co" || hostname === "api.lever.co"
      ? "global"
      : hostname === "jobs.eu.lever.co" || hostname === "api.eu.lever.co"
        ? "eu"
        : null;
  if (leverRegion) {
    const hostedParts = hostname.startsWith("jobs.") ? parts : parts.slice(2);
    const [site, postingId] = hostedParts;
    if (site && postingId && /^[a-z0-9-]+$/i.test(postingId)) {
      const apiHost = leverRegion === "eu" ? "api.eu.lever.co" : "api.lever.co";
      return {
        kind: "LEVER",
        site,
        postingId,
        originalUrl: url.toString(),
        apiUrl: `https://${apiHost}/v0/postings/${encodeURIComponent(site)}/${encodeURIComponent(postingId)}`,
      };
    }
  }

  throw new UnsupportedJobUrlError(
    "Automatic URL import currently supports public Greenhouse and Lever job pages. For LinkedIn, SEEK and other sources, paste the full visible job description below.",
    "UNSUPPORTED_SOURCE",
  );
}

export async function fetchPublicJson(url: string, fetchImpl: FetchLike = fetch): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetchImpl(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      redirect: "error",
      cache: "no-store",
      credentials: "omit",
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new JobSourceFetchError(`The public job source returned HTTP ${response.status}.`);
    }
    const contentLength = Number(response.headers.get("content-length") ?? 0);
    if (contentLength > MAX_RESPONSE_BYTES) {
      throw new JobSourceFetchError("The public job response exceeded the 2 MB safety limit.");
    }
    const text = await response.text();
    if (Buffer.byteLength(text, "utf8") > MAX_RESPONSE_BYTES) {
      throw new JobSourceFetchError("The public job response exceeded the 2 MB safety limit.");
    }
    return JSON.parse(text);
  } catch (error) {
    if (error instanceof JobSourceFetchError) throw error;
    if (error instanceof SyntaxError) {
      throw new JobSourceFetchError("The public job source did not return valid JSON.");
    }
    if (error instanceof Error && error.name === "AbortError") {
      throw new JobSourceFetchError("The public job source timed out after 15 seconds.");
    }
    throw new JobSourceFetchError(
      `Could not read the public job source: ${error instanceof Error ? error.message : String(error)}`,
    );
  } finally {
    clearTimeout(timeout);
  }
}

function fromGreenhouse(
  source: Extract<SupportedJobUrl, { kind: "GREENHOUSE" }>,
  job: z.infer<typeof greenhouseJobSchema>,
): RawJobInput {
  const salary = job.pay_input_ranges?.length === 1 ? job.pay_input_ranges[0] : undefined;
  return rawJobInputSchema.parse({
    source: `GREENHOUSE:${source.boardToken}`,
    sourceUrl: job.absolute_url ?? source.originalUrl,
    sourceExternalId: String(job.id),
    title: job.title,
    company: job.company_name,
    location: job.location?.name,
    workplaceType: explicitWorkplaceType(job.location?.name),
    postedAt: job.first_published ?? undefined,
    postedAtBasis: job.first_published ? "FIRST_PUBLISHED" : "UNKNOWN",
    applicationDeadline: job.application_deadline ?? undefined,
    salaryMin: salary ? salary.min_cents / 100 : undefined,
    salaryMax: salary ? salary.max_cents / 100 : undefined,
    salaryCurrency: salary?.currency_type,
    descriptionRaw: stripHtml(job.content),
    sourceRetrievedAt: new Date().toISOString(),
    sourceOpenStatus: "OPEN",
    extractionConfidence: 0.98,
    ingestSource: "URL_IMPORT",
  });
}

function fromLever(
  source: Extract<SupportedJobUrl, { kind: "LEVER" }>,
  job: z.infer<typeof leverJobSchema>,
): RawJobInput {
  const description = [job.openingPlain, job.descriptionPlain, job.additionalPlain]
    .filter(Boolean)
    .join("\n\n")
    .trim();
  return rawJobInputSchema.parse({
    source: `LEVER:${source.site}`,
    sourceUrl: job.hostedUrl,
    sourceExternalId: job.id,
    title: job.text,
    location: job.categories.location ?? job.categories.allLocations?.join(" · "),
    country: job.country ?? undefined,
    workplaceType: explicitWorkplaceType(job.workplaceType ?? job.categories.location),
    employmentType: explicitEmploymentType(job.categories.commitment),
    salaryMin: job.salaryRange?.min,
    salaryMax: job.salaryRange?.max,
    salaryCurrency: job.salaryRange?.currency,
    descriptionRaw: description || job.text,
    sourceRetrievedAt: new Date().toISOString(),
    sourceOpenStatus: "OPEN",
    postedAtBasis: "UNKNOWN",
    extractionConfidence: 0.98,
    ingestSource: "URL_IMPORT",
  });
}

function explicitWorkplaceType(value?: string): RawJobInput["workplaceType"] {
  if (!value) return "UNKNOWN";
  if (/\bremote\b/i.test(value)) return "REMOTE";
  if (/\bhybrid\b/i.test(value)) return "HYBRID";
  if (/\bon[- ]?site\b/i.test(value)) return "ONSITE";
  return "UNKNOWN";
}

function explicitEmploymentType(value?: string): RawJobInput["employmentType"] {
  if (!value) return "UNKNOWN";
  const normalized = value.toLowerCase().replace(/[^a-z]/g, "");
  if (normalized === "fulltime") return "FULL_TIME";
  if (normalized === "parttime") return "PART_TIME";
  if (normalized.includes("fixedterm")) return "FIXED_TERM";
  if (normalized.includes("contract")) return "CONTRACT";
  if (normalized.includes("casual")) return "CASUAL";
  return "UNKNOWN";
}

function stripHtml(value: string): string {
  let text = value;
  for (let i = 0; i < 2; i++) {
    text = text
      .replace(/<br\s*\/?\s*>/gi, "\n")
      .replace(/<\/p\s*>/gi, "\n")
      .replace(/<\/li\s*>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
      .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 16)))
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/&quot;/gi, '"')
      .replace(/&#39;|&apos;/gi, "'");
  }
  return text.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}
