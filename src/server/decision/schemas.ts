import { z } from "zod";

export const SCORE_RUBRIC = [0, 25, 50, 75, 100] as const;

/**
 * The single result contract every DecisionProvider must return, whether it
 * is the deterministic demo provider or the live Jev provider. Both are
 * validated against this schema so nothing downstream can tell them apart —
 * docs/jev-integration.md: "Demo and live Jev providers return the same
 * result contract."
 */
export const jevSignalsSchema = z.object({
  roleFitScore: z.number().refine((v) => SCORE_RUBRIC.includes(v as (typeof SCORE_RUBRIC)[number])),
  skillsFitScore: z.number().refine((v) => SCORE_RUBRIC.includes(v as (typeof SCORE_RUBRIC)[number])),
  seniorityFitScore: z.number().refine((v) => SCORE_RUBRIC.includes(v as (typeof SCORE_RUBRIC)[number])),
  strategicValueScore: z.number().refine((v) => SCORE_RUBRIC.includes(v as (typeof SCORE_RUBRIC)[number])),
  missingCriticalInfo: z.boolean(),
  redFlagLikely: z.boolean(),
  recommendation: z.enum(["APPLY_CANDIDATE", "REVIEW_REQUIRED", "SKIP"]),
  confidence: z.number().min(0).max(1),
  evidenceRelevance: z.enum([
    "DIRECT",
    "STRONG_ADJACENT",
    "WEAK_ADJACENT",
    "NOT_RELEVANT",
    "EVIDENCE_GAP",
  ]),
});

export type JevSignalsOutput = z.infer<typeof jevSignalsSchema>;

export const candidateEvidenceSummarySchema = z.object({
  evidenceId: z.string(),
  kind: z.string(),
  title: z.string(),
  skills: z.array(z.string()),
  tools: z.array(z.string()),
  yearsExperience: z.number().nullable(),
});

export const jobEvaluationStateSchema = z.object({
  candidate: z.object({
    constraints: z.array(z.string()),
    evidenceCount: z.number(),
  }),
  job: z.object({
    title: z.string(),
    company: z.string().nullable(),
    location: z.string().nullable(),
    workplaceType: z.string(),
    employmentType: z.string(),
    seniority: z.string(),
    salaryMin: z.number().nullable(),
    salaryMax: z.number().nullable(),
    descriptionRaw: z.string(),
    requiredSkills: z.array(z.string()),
    preferredSkills: z.array(z.string()),
  }),
  deterministicPolicy: z.object({
    hardBlockerCount: z.number(),
    deepReviewReasonCount: z.number(),
  }),
  evidenceCandidates: z.array(candidateEvidenceSummarySchema),
  decisionPolicyVersion: z.string(),
});

export type JobEvaluationState = z.infer<typeof jobEvaluationStateSchema>;
export type CandidateEvidenceSummary = z.infer<typeof candidateEvidenceSummarySchema>;
