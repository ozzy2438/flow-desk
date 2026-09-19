import type { ProfileRecord, CandidateProfileImport } from "@prisma/client";
import type { NormalizedJobData } from "../jobs/normalize";
import type { DeterministicPolicyResult } from "../policy/engine";
import type { JobEvaluationState, CandidateEvidenceSummary } from "./schemas";

type ActiveProfile = CandidateProfileImport & { records: ProfileRecord[] };

export function buildJobEvaluationState(
  job: NormalizedJobData,
  deterministic: DeterministicPolicyResult,
  profile: ActiveProfile | null,
  decisionPolicyVersion: string,
): JobEvaluationState {
  const records = profile?.records ?? [];

  const constraints = records
    .filter((r) => r.kind === "CONSTRAINT" || r.kind === "FACT")
    .map((r) => {
      const data = r.data as Record<string, unknown>;
      return typeof data.summary === "string" && data.summary ? data.summary : (r.title ?? "");
    })
    .filter(Boolean);

  const evidenceCandidates: CandidateEvidenceSummary[] = records
    .filter((r) => r.evidenceId)
    .map((r) => {
      const data = r.data as Record<string, unknown>;
      return {
        evidenceId: r.evidenceId as string,
        kind: r.kind,
        title: r.title ?? r.evidenceId ?? "",
        skills: Array.isArray(data.skills) ? (data.skills as string[]) : [],
        tools: Array.isArray(data.tools) ? (data.tools as string[]) : [],
        yearsExperience: typeof data.years_experience === "number" ? data.years_experience : null,
      };
    });

  return {
    candidate: { constraints, evidenceCount: evidenceCandidates.length },
    job: {
      title: job.title,
      company: job.company,
      location: job.location,
      workplaceType: job.workplaceType,
      employmentType: job.employmentType,
      seniority: job.seniority,
      salaryMin: job.salaryMin,
      salaryMax: job.salaryMax,
      descriptionRaw: job.descriptionRaw,
      requiredSkills: job.requiredSkills,
      preferredSkills: job.preferredSkills,
    },
    deterministicPolicy: {
      hardBlockerCount: deterministic.hardBlockers.length,
      deepReviewReasonCount: deterministic.deepReviewReasons.length,
    },
    evidenceCandidates,
    decisionPolicyVersion,
  };
}
