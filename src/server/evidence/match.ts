import type { Prisma, ProfileRecord } from "@prisma/client";
import { db } from "../db";
import { tokenize, overlapRatio } from "../textMatch";
import type { NormalizedJobData } from "../jobs/normalize";

const EVIDENCE_KINDS = new Set(["PROJECT", "SKILL", "EXPERIENCE", "EDUCATION"]);

function categoryFor(ratio: number, hasAnyRequirement: boolean): "DIRECT" | "STRONG_ADJACENT" | "WEAK_ADJACENT" | "NOT_RELEVANT" {
  if (!hasAnyRequirement) return ratio > 0 ? "WEAK_ADJACENT" : "NOT_RELEVANT";
  if (ratio >= 0.6) return "DIRECT";
  if (ratio >= 0.3) return "STRONG_ADJACENT";
  if (ratio > 0) return "WEAK_ADJACENT";
  return "NOT_RELEVANT";
}

/**
 * docs/evidence-matching.md: a job should show which verified records
 * support a realistic application, not just a percentage. Persists one
 * EvidenceMatch per relevant profile record, replacing any prior matches
 * for this job (idempotent for re-evaluation).
 */
export async function matchEvidence(
  jobId: string,
  job: NormalizedJobData,
  records: ProfileRecord[],
) {
  const evidenceRecords = records.filter((r) => {
    if (!r.evidenceId || !EVIDENCE_KINDS.has(r.kind)) return false;
    const data = r.data as Record<string, unknown>;
    // cv_usage: "excluded" (Apply OS schema) means this record must never
    // appear on a CV or be cited in application material - never match it,
    // regardless of how well its skills overlap the posting.
    return data.cv_usage !== "excluded";
  });
  const allRequirements = [...job.requiredSkills, ...job.preferredSkills];
  const descriptionTokens = tokenize(job.descriptionRaw);

  await db.evidenceMatch.deleteMany({ where: { jobId } });

  const rows: Prisma.EvidenceMatchCreateManyInput[] = [];

  for (const record of evidenceRecords) {
    const data = record.data as Record<string, unknown>;
    const skills = Array.isArray(data.skills) ? (data.skills as string[]) : [];
    const tools = Array.isArray(data.tools) ? (data.tools as string[]) : [];
    const recordTokens = new Set<string>();
    for (const s of [...skills, ...tools]) for (const t of tokenize(s)) recordTokens.add(t);
    for (const t of tokenize(record.title ?? "")) recordTokens.add(t);

    const supportedRequirements = allRequirements.filter(
      (req) => overlapRatio([req], recordTokens) > 0,
    );
    const unsupportedRequirements = allRequirements.filter(
      (req) => !supportedRequirements.includes(req),
    );

    const ratio =
      allRequirements.length > 0
        ? overlapRatio(allRequirements, recordTokens)
        : [...descriptionTokens].filter((t) => recordTokens.has(t)).length /
          Math.max(1, descriptionTokens.size);

    const category = categoryFor(ratio, allRequirements.length > 0);
    if (category === "NOT_RELEVANT") continue;

    const outcome = typeof data.outcome === "string" ? data.outcome : "";
    const safeClaims = supportedRequirements.map(
      (req) => `"${record.title}" supports the required skill "${req}".`,
    );
    if (outcome && (category === "DIRECT" || category === "STRONG_ADJACENT")) {
      safeClaims.push(outcome);
    }
    // Apply OS schema: allowed_claims are already vetted, claim-policy-
    // compliant sentences for this exact project - prefer them outright
    // over the auto-generated "supports skill X" sentences above.
    const allowedClaims = Array.isArray(data.allowed_claims) ? (data.allowed_claims as string[]) : [];
    if (allowedClaims.length > 0 && category !== "WEAK_ADJACENT") {
      safeClaims.push(...allowedClaims);
    }
    // claim_boundaries: things this record must never be presented as, or
    // qualifications that must travel with any claim from it. Surfaced as
    // forbiddenClaims so the cover-letter view and claim verifier both see
    // them, rather than only living in this project's own JSON.
    const forbiddenClaims = Array.isArray(data.claim_boundaries) ? (data.claim_boundaries as string[]) : [];

    rows.push({
      jobId,
      profileRecordId: record.id,
      category,
      supportedRequirements,
      unsupportedRequirements,
      safeClaims: [...new Set(safeClaims)],
      forbiddenClaims,
      confidence: Math.round(ratio * 100) / 100,
    });
  }

  if (rows.length > 0) {
    await db.evidenceMatch.createMany({ data: rows });
  }

  return rows.length;
}
