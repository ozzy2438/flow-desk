import type { ProfileRecord } from "@prisma/client";
import { tokenize, overlapRatio } from "../textMatch";

const GAP_THRESHOLD = 0.34;

/**
 * A cheap, deterministic pre-Jev check: does this posting name required
 * skills with essentially no keyword overlap against any imported evidence?
 * This runs inside the deterministic policy engine (decision-policy.csv's
 * EVIDENCE_GAP category is deterministic, not semantic) so a job can be
 * routed to review before a decision provider is even called. Milestone 5's
 * evidence matcher does the real per-record DIRECT/ADJACENT categorization
 * used on the job detail page; this only answers "gap or not" for routing.
 */
export function hasEvidenceGap(requiredSkills: string[], records: ProfileRecord[]): boolean {
  if (requiredSkills.length === 0) return false;

  const candidateTokens = new Set<string>();
  for (const record of records) {
    const data = record.data as Record<string, unknown>;
    if (data.cv_usage === "excluded") continue;
    const skills = Array.isArray(data.skills) ? (data.skills as string[]) : [];
    const tools = Array.isArray(data.tools) ? (data.tools as string[]) : [];
    for (const skill of [...skills, ...tools]) {
      for (const token of tokenize(skill)) candidateTokens.add(token);
    }
  }

  return overlapRatio(requiredSkills, candidateTokens) < GAP_THRESHOLD;
}
