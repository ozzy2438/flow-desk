import { db } from "../db";
import { getActivePolicyImport } from "../policy/importPolicy";
import { applyDeterministicPolicy, finalizeDecision } from "../policy/engine";
import { findDuplicateJob } from "./duplicate";
import type { NormalizedJobData } from "./normalize";

export class PolicyNotConfiguredError extends Error {
  constructor() {
    super("No active decision policy imported. Import decision-policy.csv first.");
    this.name = "PolicyNotConfiguredError";
  }
}

/**
 * Runs the deterministic policy engine against a normalized job and persists
 * JobPosting + JobEvaluation. This is the Milestone 3 slice: hard blockers
 * route to SKIP, everything else waits in REVIEW_REQUIRED because no
 * semantic decision provider has run yet. `evaluateJobWithDecisionProvider`
 * (Milestone 4+) wraps this with Jev's typed signals so a job can reach
 * APPLY_CANDIDATE.
 */
export async function evaluateAndPersistJob(
  normalized: NormalizedJobData,
  userId: string,
  extractedCandidateId?: string,
) {
  const [duplicate, activePolicy] = await Promise.all([
    findDuplicateJob(normalized.dedupeKey),
    getActivePolicyImport(userId),
  ]);

  if (!activePolicy) throw new PolicyNotConfiguredError();

  const deterministic = applyDeterministicPolicy({
    job: normalized,
    rules: activePolicy.rules,
    isDuplicate: Boolean(duplicate),
  });

  const final = finalizeDecision(deterministic);

  const job = await db.jobPosting.create({
    data: {
      ...normalized,
      candidateId: extractedCandidateId,
      evaluation: {
        create: {
          policyVersion: `v${activePolicy.version}`,
          profileVersion: "unset",
          hardBlockers: deterministic.hardBlockers,
          softPreferenceSignals: deterministic.softPreferenceSignals,
          deepReviewReasons: deterministic.deepReviewReasons,
          explanationFacts: deterministic.explanationFacts,
          decision: final.decision,
          decisionProvider: "NONE",
          decisionConfidence: final.decisionConfidence,
        },
      },
    },
    include: { evaluation: true },
  });

  return { job, duplicate };
}
