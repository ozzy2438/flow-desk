import { createHash } from "node:crypto";
import type { RawJobInput } from "./types";

function normalizeText(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    parsed.search = "";
    return `${parsed.origin}${parsed.pathname}`.replace(/\/$/, "").toLowerCase();
  } catch {
    return normalizeText(url);
  }
}

/**
 * Same-source postings dedupe on their own external ID first, then on a
 * normalized URL, and only fall back to a title/company/location fingerprint
 * when neither is available — matching Phase 4's "duplicate detection
 * across source URL, external ID, normalized title, company and location."
 */
export function computeDedupeKey(input: RawJobInput): string {
  if (input.sourceExternalId) {
    return `ext:${input.source}:${normalizeText(input.sourceExternalId)}`;
  }
  if (input.sourceUrl) {
    return `url:${normalizeUrl(input.sourceUrl)}`;
  }
  const fingerprint = [input.title, input.company ?? "", input.location ?? ""]
    .map(normalizeText)
    .join("|");
  return `fp:${createHash("sha256").update(fingerprint).digest("hex").slice(0, 32)}`;
}

export type NormalizedJobData = {
  source: string;
  sourceUrl: string | null;
  sourceExternalId: string | null;
  title: string;
  company: string | null;
  location: string | null;
  country: string | null;
  workplaceType: RawJobInput["workplaceType"];
  employmentType: RawJobInput["employmentType"];
  seniority: RawJobInput["seniority"];
  postedAt: Date | null;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string | null;
  descriptionRaw: string;
  responsibilities: string[];
  requiredSkills: string[];
  preferredSkills: string[];
  visaRequirements: string[];
  sourceRetrievedAt: Date | null;
  sourceOpenStatus: RawJobInput["sourceOpenStatus"];
  postedAtBasis: RawJobInput["postedAtBasis"];
  applicationDeadline: Date | null;
  eligibilityUncertainties: string[];
  dedupeKey: string;
  ingestSource: string;
};

export function normalizeJobInput(input: RawJobInput): NormalizedJobData {
  return {
    source: input.source,
    sourceUrl: input.sourceUrl ?? null,
    sourceExternalId: input.sourceExternalId ?? null,
    title: input.title.trim(),
    company: input.company?.trim() || null,
    location: input.location?.trim() || null,
    country: input.country?.trim() || null,
    workplaceType: input.workplaceType,
    employmentType: input.employmentType,
    seniority: input.seniority,
    postedAt: input.postedAt ? new Date(input.postedAt) : null,
    salaryMin: input.salaryMin ?? null,
    salaryMax: input.salaryMax ?? null,
    salaryCurrency: input.salaryCurrency?.trim() || null,
    descriptionRaw: input.descriptionRaw,
    responsibilities: input.responsibilities,
    requiredSkills: input.requiredSkills,
    preferredSkills: input.preferredSkills,
    visaRequirements: input.visaRequirements,
    sourceRetrievedAt: input.sourceRetrievedAt ? new Date(input.sourceRetrievedAt) : null,
    sourceOpenStatus: input.sourceOpenStatus,
    postedAtBasis: input.postedAtBasis,
    applicationDeadline: input.applicationDeadline ? new Date(input.applicationDeadline) : null,
    eligibilityUncertainties: input.eligibilityUncertainties,
    dedupeKey: computeDedupeKey(input),
    ingestSource: input.ingestSource,
  };
}
