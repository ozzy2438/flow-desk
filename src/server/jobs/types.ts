import { z } from "zod";

export const WORKPLACE_TYPES = ["REMOTE", "HYBRID", "ONSITE", "UNKNOWN"] as const;
export const EMPLOYMENT_TYPES = [
  "FULL_TIME",
  "PART_TIME",
  "CONTRACT",
  "CASUAL",
  "FIXED_TERM",
  "UNKNOWN",
] as const;
export const SENIORITIES = ["ENTRY", "MID", "SENIOR", "LEAD", "UNKNOWN"] as const;

/**
 * What both pasted-job ingestion (Milestone 3) and browser extraction
 * (Milestone 4+) produce before normalization. Every field the operator
 * did not explicitly provide is left undefined, never guessed — Phase 4's
 * "mark uncertain fields as unknown; never infer them as facts."
 */
export const rawJobInputSchema = z.object({
  source: z.string().min(1),
  sourceUrl: z.string().url().optional(),
  sourceExternalId: z.string().optional(),
  title: z.string().min(1),
  company: z.string().optional(),
  location: z.string().optional(),
  country: z.string().optional(),
  workplaceType: z.enum(WORKPLACE_TYPES).default("UNKNOWN"),
  employmentType: z.enum(EMPLOYMENT_TYPES).default("UNKNOWN"),
  seniority: z.enum(SENIORITIES).default("UNKNOWN"),
  postedAt: z.string().datetime().optional().or(z.literal("").transform(() => undefined)),
  salaryMin: z.number().nonnegative().optional(),
  salaryMax: z.number().nonnegative().optional(),
  salaryCurrency: z.string().optional(),
  descriptionRaw: z.string().min(1),
  responsibilities: z.array(z.string()).default([]),
  requiredSkills: z.array(z.string()).default([]),
  preferredSkills: z.array(z.string()).default([]),
  visaRequirements: z.array(z.string()).default([]),
  extractionConfidence: z.number().min(0).max(1).default(1),
  ingestSource: z.enum(["PASTED", "BROWSER_FLOW", "URL_IMPORT"]).default("PASTED"),
});

export type RawJobInput = z.infer<typeof rawJobInputSchema>;
