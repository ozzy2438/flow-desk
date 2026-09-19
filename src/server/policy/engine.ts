import type { PolicyAction } from "@prisma/client";

export type PolicyEngineJob = {
  title: string;
  company: string | null;
  location: string | null;
  country: string | null;
  workplaceType: string;
  employmentType: string;
  seniority: string;
  salaryMin: number | null;
  salaryMax: number | null;
  requiredSkills: string[];
  preferredSkills: string[];
  visaRequirements: string[];
  descriptionRaw: string;
  dedupeKey: string;
};

export type PolicyRuleLike = {
  code: string;
  category: string;
  field: string;
  operator: string;
  value: string;
  action: PolicyAction;
  reason: string;
  active: boolean;
};

export type DeterministicPolicyResult = {
  hardBlockers: Array<{ code: string; reason: string }>;
  softPreferenceSignals: Array<{ code: string; effect: "BOOST" | "PENALTY" | "NEUTRAL" }>;
  deepReviewReasons: string[];
  explanationFacts: string[];
  /** Rules that could not be evaluated because the field they read is unknown on this job. */
  unresolvedRules: string[];
};

type FieldValue = string | number | string[] | null;

function getFieldValue(job: PolicyEngineJob, field: string): FieldValue | undefined {
  switch (field) {
    case "title":
      return job.title;
    case "company":
      return job.company;
    case "location":
      return job.location;
    case "country":
      return job.country;
    case "workplaceType":
      return job.workplaceType === "UNKNOWN" ? null : job.workplaceType;
    case "employmentType":
      return job.employmentType === "UNKNOWN" ? null : job.employmentType;
    case "seniority":
      return job.seniority === "UNKNOWN" ? null : job.seniority;
    case "salaryMin":
      return job.salaryMin;
    case "salaryMax":
      return job.salaryMax;
    case "requiredSkills":
      return job.requiredSkills;
    case "preferredSkills":
      return job.preferredSkills;
    case "visaRequirements":
      return job.visaRequirements;
    case "descriptionRaw":
      return job.descriptionRaw;
    case "dedupeKey":
      return job.dedupeKey;
    default:
      return undefined;
  }
}

function isUnknown(value: FieldValue | undefined): boolean {
  if (value === undefined || value === null) return true;
  if (typeof value === "string") return value.trim() === "";
  return false;
}

function splitOptions(value: string): string[] {
  return value
    .split("|")
    .map((v) => v.trim())
    .filter(Boolean);
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function evaluateOperator(operator: string, fieldValue: FieldValue, ruleValue: string): boolean {
  switch (operator) {
    case "IS_UNKNOWN":
      return isUnknown(fieldValue);
    case "ALWAYS":
      return true;
    case "EQUALS":
      return typeof fieldValue === "string" && normalize(fieldValue) === normalize(ruleValue);
    case "NOT_EQUALS":
      return typeof fieldValue === "string" && normalize(fieldValue) !== normalize(ruleValue);
    case "IN": {
      if (typeof fieldValue !== "string") return false;
      const options = splitOptions(ruleValue).map(normalize);
      return options.includes(normalize(fieldValue));
    }
    case "NOT_IN": {
      if (typeof fieldValue !== "string") return false;
      const options = splitOptions(ruleValue).map(normalize);
      return !options.includes(normalize(fieldValue));
    }
    case "CONTAINS": {
      const options = splitOptions(ruleValue).map(normalize);
      if (Array.isArray(fieldValue)) {
        const items = fieldValue.map(normalize);
        return options.some((opt) => items.some((item) => item.includes(opt)));
      }
      if (typeof fieldValue === "string") {
        const haystack = normalize(fieldValue);
        return options.some((opt) => haystack.includes(opt));
      }
      return false;
    }
    case "NOT_CONTAINS":
      return !evaluateOperator("CONTAINS", fieldValue, ruleValue);
    case "LESS_THAN":
      return typeof fieldValue === "number" && fieldValue < Number(ruleValue);
    case "GREATER_THAN":
      return typeof fieldValue === "number" && fieldValue > Number(ruleValue);
    default:
      return false;
  }
}

function applyAction(
  rule: PolicyRuleLike,
  result: DeterministicPolicyResult,
  actionOverride?: PolicyAction,
) {
  const action = actionOverride ?? rule.action;
  result.explanationFacts.push(`${rule.code}: ${rule.reason}`);
  switch (action) {
    case "HARD_BLOCK":
      result.hardBlockers.push({ code: rule.code, reason: rule.reason });
      break;
    case "BOOST":
      result.softPreferenceSignals.push({ code: rule.code, effect: "BOOST" });
      break;
    case "PENALTY":
      result.softPreferenceSignals.push({ code: rule.code, effect: "PENALTY" });
      break;
    case "REVIEW":
      result.deepReviewReasons.push(rule.reason);
      break;
    case "NEUTRAL":
      result.softPreferenceSignals.push({ code: rule.code, effect: "NEUTRAL" });
      break;
  }
}

export type ApplyDeterministicPolicyInput = {
  job: PolicyEngineJob;
  rules: PolicyRuleLike[];
  isDuplicate?: boolean;
  evidenceGapDetected?: boolean;
};

/**
 * Steps 1-4 of docs/policy-engine.md: validate, detect hard blockers, and
 * apply location/work-rights/employment/etc. rules. Pure and deterministic —
 * no Jev, no model call. `CLAIM_POLICY` rules are read separately by the
 * cover-letter claim verifier and are never applied against a job posting.
 */
export function applyDeterministicPolicy({
  job,
  rules,
  isDuplicate = false,
  evidenceGapDetected = false,
}: ApplyDeterministicPolicyInput): DeterministicPolicyResult {
  const result: DeterministicPolicyResult = {
    hardBlockers: [],
    softPreferenceSignals: [],
    deepReviewReasons: [],
    explanationFacts: [],
    unresolvedRules: [],
  };

  for (const rule of rules) {
    if (!rule.active) continue;
    if (rule.category === "CLAIM_POLICY") continue;

    if (rule.category === "DUPLICATE") {
      if (isDuplicate) applyAction(rule, result);
      continue;
    }
    if (rule.category === "EVIDENCE_GAP") {
      if (evidenceGapDetected) applyAction(rule, result);
      continue;
    }

    const fieldValue = getFieldValue(job, rule.field);

    if (rule.operator !== "IS_UNKNOWN" && rule.operator !== "ALWAYS" && isUnknown(fieldValue)) {
      result.unresolvedRules.push(rule.code);
      if (rule.action === "HARD_BLOCK") {
        result.deepReviewReasons.push(
          `${rule.code} could not be evaluated because "${rule.field}" is unknown on this posting — review manually instead of assuming a block.`,
        );
      }
      continue;
    }

    const matched = evaluateOperator(rule.operator, fieldValue ?? null, rule.value);
    if (matched) applyAction(rule, result);
  }

  return result;
}

// ---------------------------------------------------------------------------
// Final routing (docs/policy-engine.md steps 5-7, docs/jev-integration.md)
// ---------------------------------------------------------------------------

export type EvidenceRelevance =
  | "DIRECT"
  | "STRONG_ADJACENT"
  | "WEAK_ADJACENT"
  | "NOT_RELEVANT"
  | "EVIDENCE_GAP";

export type JevSignals = {
  roleFitScore: number;
  skillsFitScore: number;
  seniorityFitScore: number;
  strategicValueScore: number;
  missingCriticalInfo: boolean;
  redFlagLikely: boolean;
  recommendation: "APPLY_CANDIDATE" | "REVIEW_REQUIRED" | "SKIP";
  confidence: number;
  evidenceRelevance: EvidenceRelevance;
};

export type FinalPolicyResult = DeterministicPolicyResult & {
  decision: "APPLY_CANDIDATE" | "REVIEW_REQUIRED" | "SKIP";
  decisionConfidence: number | null;
};

const CONFIDENCE_THRESHOLD = 0.7;
const APPLY_SCORE_THRESHOLD = 70;
const SKIP_SCORE_THRESHOLD = 40;
const SOFT_SIGNAL_WEIGHT = 5;

function averageFitScore(jev: JevSignals): number {
  const base = (jev.roleFitScore + jev.skillsFitScore + jev.seniorityFitScore) / 3;
  const boosts = 0; // soft signals only nudge within finalizeDecision, not the raw average
  return base + boosts;
}

/**
 * Combines the deterministic result with Jev's typed signals. Called with
 * `jev` undefined when no decision provider has run yet (Milestone 3): the
 * job can still be hard-blocked, but nothing is confidently promoted to
 * APPLY_CANDIDATE without a semantic check, so it waits in REVIEW_REQUIRED.
 */
export function finalizeDecision(
  deterministic: DeterministicPolicyResult,
  jev?: JevSignals,
): FinalPolicyResult {
  if (deterministic.hardBlockers.length > 0) {
    return { ...deterministic, decision: "SKIP", decisionConfidence: jev?.confidence ?? null };
  }

  if (!jev) {
    return { ...deterministic, decision: "REVIEW_REQUIRED", decisionConfidence: null };
  }

  if (jev.missingCriticalInfo || jev.redFlagLikely || jev.confidence < CONFIDENCE_THRESHOLD) {
    return { ...deterministic, decision: "REVIEW_REQUIRED", decisionConfidence: jev.confidence };
  }

  const boostCount = deterministic.softPreferenceSignals.filter((s) => s.effect === "BOOST").length;
  const penaltyCount = deterministic.softPreferenceSignals.filter(
    (s) => s.effect === "PENALTY",
  ).length;
  const adjustedScore =
    averageFitScore(jev) + boostCount * SOFT_SIGNAL_WEIGHT - penaltyCount * SOFT_SIGNAL_WEIGHT;

  const strongEvidence = jev.evidenceRelevance === "DIRECT" || jev.evidenceRelevance === "STRONG_ADJACENT";

  let decision: FinalPolicyResult["decision"];
  if (
    adjustedScore >= APPLY_SCORE_THRESHOLD &&
    strongEvidence &&
    jev.recommendation !== "SKIP" &&
    deterministic.deepReviewReasons.length === 0
  ) {
    decision = "APPLY_CANDIDATE";
  } else if (
    adjustedScore < SKIP_SCORE_THRESHOLD &&
    jev.recommendation === "SKIP" &&
    jev.evidenceRelevance !== "EVIDENCE_GAP"
  ) {
    decision = "SKIP";
  } else {
    decision = "REVIEW_REQUIRED";
  }

  return { ...deterministic, decision, decisionConfidence: jev.confidence };
}
