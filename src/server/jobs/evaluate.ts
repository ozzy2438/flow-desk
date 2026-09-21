import { db } from "../db";
import { getActivePolicyImport } from "../policy/importPolicy";
import { getActiveProfileImport } from "../profile/importProfile";
import { applyDeterministicPolicy, finalizeDecision } from "../policy/engine";
import { hasEvidenceGap } from "../evidence/quickGapCheck";
import { getDecisionProvider } from "../decision";
import { buildJobEvaluationState } from "../decision/buildState";
import { matchEvidence } from "../evidence/match";
import { findDuplicateJob } from "./duplicate";
import type { NormalizedJobData } from "./normalize";

export class PolicyNotConfiguredError extends Error {
  constructor() {
    super("No active decision policy imported. Import decision-policy.json or decision-policy.csv first.");
    this.name = "PolicyNotConfiguredError";
  }
}

/**
 * Full pipeline from docs/policy-engine.md: validate -> detect duplicates ->
 * hard blockers -> deterministic rules -> Jev (only if still viable) ->
 * combine -> evidence matching -> persist. A hard-blocked job never reaches
 * the decision provider at all.
 */
export async function evaluateAndPersistJob(
  normalized: NormalizedJobData,
  userId: string,
  extractedCandidateId?: string,
) {
  const [duplicate, activePolicy, activeProfile] = await Promise.all([
    findDuplicateJob(normalized.dedupeKey),
    getActivePolicyImport(userId),
    getActiveProfileImport(userId),
  ]);

  if (!activePolicy) throw new PolicyNotConfiguredError();

  const deterministic = applyDeterministicPolicy({
    job: normalized,
    rules: activePolicy.rules,
    isDuplicate: Boolean(duplicate),
    evidenceGapDetected: hasEvidenceGap(normalized.requiredSkills, activeProfile?.records ?? []),
  });

  for (const uncertainty of normalized.eligibilityUncertainties) {
    if (!deterministic.deepReviewReasons.includes(uncertainty)) {
      deterministic.deepReviewReasons.push(uncertainty);
      deterministic.explanationFacts.push(`SOURCE_ELIGIBILITY_UNCERTAIN: ${uncertainty}`);
    }
  }

  const provider = getDecisionProvider();
  let jevSignals: Awaited<ReturnType<typeof provider.evaluate>> | undefined;
  let state: ReturnType<typeof buildJobEvaluationState> | undefined;

  if (deterministic.hardBlockers.length === 0) {
    state = buildJobEvaluationState(
      normalized,
      deterministic,
      activeProfile,
      `v${activePolicy.version}`,
    );
    jevSignals = await provider.evaluate(state);
  }

  const final = finalizeDecision(deterministic, jevSignals);

  const job = await db.jobPosting.create({
    data: {
      ...normalized,
      candidateId: extractedCandidateId,
      evaluation: {
        create: {
          policyVersion: `v${activePolicy.version}`,
          profileVersion: activeProfile ? `v${activeProfile.version}` : "unset",
          hardBlockers: deterministic.hardBlockers,
          softPreferenceSignals: deterministic.softPreferenceSignals,
          deepReviewReasons: deterministic.deepReviewReasons,
          explanationFacts: deterministic.explanationFacts,
          decision: final.decision,
          decisionProvider: jevSignals ? provider.name : "NONE",
          roleFitScore: jevSignals?.roleFitScore,
          skillsFitScore: jevSignals?.skillsFitScore,
          seniorityFitScore: jevSignals?.seniorityFitScore,
          strategicValueScore: jevSignals?.strategicValueScore,
          missingCriticalInfo: jevSignals?.missingCriticalInfo,
          redFlagLikely: jevSignals?.redFlagLikely,
          decisionConfidence: final.decisionConfidence,
        },
      },
      ...(jevSignals && state
        ? {
            decisionAudits: {
              create: {
                provider: provider.name,
                question: "job_evaluation",
                inputState: state,
                outputResult: jevSignals,
              },
            },
          }
        : {}),
    },
    include: { evaluation: true },
  });

  if (activeProfile) {
    await matchEvidence(job.id, normalized, activeProfile.records);
  }

  return { job, duplicate };
}
