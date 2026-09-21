import { describe, expect, it } from "vitest";
import {
  applyDeterministicPolicy,
  finalizeDecision,
  type PolicyEngineJob,
  type PolicyRuleLike,
} from "@/server/policy/engine";

function job(overrides: Partial<PolicyEngineJob> = {}): PolicyEngineJob {
  return {
    title: "Applied AI Engineer",
    company: "Acme",
    location: "Melbourne, Australia",
    country: "Australia",
    workplaceType: "HYBRID",
    employmentType: "CONTRACT",
    seniority: "SENIOR",
    salaryMin: 150000,
    salaryMax: 180000,
    requiredSkills: ["python", "machine learning"],
    preferredSkills: [],
    visaRequirements: [],
    descriptionRaw: "Build applied AI systems.",
    dedupeKey: "fp:test",
    ...overrides,
  };
}

function rule(overrides: Partial<PolicyRuleLike>): PolicyRuleLike {
  return {
    code: "TEST_RULE",
    category: "OTHER",
    field: "title",
    operator: "ALWAYS",
    value: "",
    action: "NEUTRAL",
    reason: "test",
    active: true,
    ...overrides,
  };
}

describe("applyDeterministicPolicy", () => {
  it("hard-blocks on a matching CONTAINS rule", () => {
    const result = applyDeterministicPolicy({
      job: job({ title: "Senior Business Development Manager" }),
      rules: [
        rule({
          code: "ROLE_EXCL",
          category: "ROLE_EXCLUSION",
          field: "title",
          operator: "CONTAINS",
          value: "Business Development Manager|Recruiter",
          action: "HARD_BLOCK",
        }),
      ],
    });
    expect(result.hardBlockers).toHaveLength(1);
    expect(result.hardBlockers[0]?.code).toBe("ROLE_EXCL");
  });

  it("never treats an unknown field as a negative fact for a hard blocker", () => {
    const result = applyDeterministicPolicy({
      job: job({ location: null }),
      rules: [
        rule({
          code: "LOC_BLOCK",
          category: "LOCATION",
          field: "location",
          operator: "NOT_CONTAINS",
          value: "Melbourne|Remote",
          action: "HARD_BLOCK",
        }),
      ],
    });
    expect(result.hardBlockers).toHaveLength(0);
    expect(result.unresolvedRules).toContain("LOC_BLOCK");
    expect(result.deepReviewReasons.some((r) => r.includes("LOC_BLOCK"))).toBe(true);
  });

  it("fires NOT_CONTAINS as a hard blocker when the field is known and does not match", () => {
    const result = applyDeterministicPolicy({
      job: job({ location: "Perth, Australia" }),
      rules: [
        rule({
          code: "LOC_BLOCK",
          category: "LOCATION",
          field: "location",
          operator: "NOT_CONTAINS",
          value: "Melbourne|Remote",
          action: "HARD_BLOCK",
        }),
      ],
    });
    expect(result.hardBlockers).toHaveLength(1);
  });

  it("routes LESS_THAN compensation rules to PENALTY, not a block", () => {
    const result = applyDeterministicPolicy({
      job: job({ salaryMax: 80000 }),
      rules: [
        rule({
          code: "COMP_LOW",
          category: "COMPENSATION",
          field: "salaryMax",
          operator: "LESS_THAN",
          value: "90000",
          action: "PENALTY",
        }),
      ],
    });
    expect(result.hardBlockers).toHaveLength(0);
    expect(result.softPreferenceSignals).toEqual([{ code: "COMP_LOW", effect: "PENALTY" }]);
  });

  it("only fires DUPLICATE-category rules when isDuplicate is true", () => {
    const rules = [
      rule({ code: "DUP", category: "DUPLICATE", field: "dedupeKey", operator: "ALWAYS", action: "REVIEW" }),
    ];
    const notDup = applyDeterministicPolicy({ job: job(), rules, isDuplicate: false });
    expect(notDup.deepReviewReasons).toHaveLength(0);

    const isDup = applyDeterministicPolicy({ job: job(), rules, isDuplicate: true });
    expect(isDup.deepReviewReasons).toHaveLength(1);
  });

  it("only fires EVIDENCE_GAP-category rules when evidenceGapDetected is true", () => {
    const rules = [
      rule({ code: "GAP", category: "EVIDENCE_GAP", field: "requiredSkills", operator: "ALWAYS", action: "REVIEW" }),
    ];
    const noGap = applyDeterministicPolicy({ job: job(), rules, evidenceGapDetected: false });
    expect(noGap.deepReviewReasons).toHaveLength(0);

    const hasGap = applyDeterministicPolicy({ job: job(), rules, evidenceGapDetected: true });
    expect(hasGap.deepReviewReasons).toHaveLength(1);
  });

  it("never applies CLAIM_POLICY rules against a job posting", () => {
    const result = applyDeterministicPolicy({
      job: job(),
      rules: [rule({ code: "CLAIM", category: "CLAIM_POLICY", operator: "ALWAYS", action: "HARD_BLOCK" })],
    });
    expect(result.hardBlockers).toHaveLength(0);
  });

  it("ignores inactive rules", () => {
    const result = applyDeterministicPolicy({
      job: job(),
      rules: [rule({ code: "INACTIVE", operator: "ALWAYS", action: "HARD_BLOCK", active: false })],
    });
    expect(result.hardBlockers).toHaveLength(0);
  });
});

describe("finalizeDecision", () => {
  it("skips regardless of Jev signals when a hard blocker fired", () => {
    const deterministic = applyDeterministicPolicy({
      job: job(),
      rules: [rule({ code: "BLOCK", operator: "ALWAYS", action: "HARD_BLOCK" })],
    });
    const result = finalizeDecision(deterministic, {
      roleFitScore: 100,
      skillsFitScore: 100,
      seniorityFitScore: 100,
      strategicValueScore: 100,
      missingCriticalInfo: false,
      redFlagLikely: false,
      recommendation: "APPLY_CANDIDATE",
      confidence: 0.99,
      evidenceRelevance: "DIRECT",
    });
    expect(result.decision).toBe("SKIP");
  });

  it("waits in REVIEW_REQUIRED when no decision provider has run yet", () => {
    const deterministic = applyDeterministicPolicy({ job: job(), rules: [] });
    const result = finalizeDecision(deterministic);
    expect(result.decision).toBe("REVIEW_REQUIRED");
  });

  it("requires high score, high confidence AND strong evidence for APPLY_CANDIDATE", () => {
    const deterministic = applyDeterministicPolicy({ job: job(), rules: [] });

    const weakEvidence = finalizeDecision(deterministic, {
      roleFitScore: 100,
      skillsFitScore: 100,
      seniorityFitScore: 100,
      strategicValueScore: 100,
      missingCriticalInfo: false,
      redFlagLikely: false,
      recommendation: "APPLY_CANDIDATE",
      confidence: 0.95,
      evidenceRelevance: "WEAK_ADJACENT",
    });
    expect(weakEvidence.decision).toBe("REVIEW_REQUIRED");

    const strongEvidence = finalizeDecision(deterministic, {
      roleFitScore: 100,
      skillsFitScore: 100,
      seniorityFitScore: 100,
      strategicValueScore: 100,
      missingCriticalInfo: false,
      redFlagLikely: false,
      recommendation: "APPLY_CANDIDATE",
      confidence: 0.95,
      evidenceRelevance: "DIRECT",
    });
    expect(strongEvidence.decision).toBe("APPLY_CANDIDATE");
  });

  it("downgrades to REVIEW_REQUIRED when a deep-review reason fired, even with a strong score", () => {
    const deterministic = applyDeterministicPolicy({
      job: job(),
      rules: [rule({ code: "REVIEW", operator: "ALWAYS", action: "REVIEW" })],
    });
    const result = finalizeDecision(deterministic, {
      roleFitScore: 100,
      skillsFitScore: 100,
      seniorityFitScore: 100,
      strategicValueScore: 100,
      missingCriticalInfo: false,
      redFlagLikely: false,
      recommendation: "APPLY_CANDIDATE",
      confidence: 0.95,
      evidenceRelevance: "DIRECT",
    });
    expect(result.decision).toBe("REVIEW_REQUIRED");
  });

  it("forces REVIEW_REQUIRED on missing critical info or low confidence", () => {
    const deterministic = applyDeterministicPolicy({ job: job(), rules: [] });

    const missingInfo = finalizeDecision(deterministic, {
      roleFitScore: 100,
      skillsFitScore: 100,
      seniorityFitScore: 100,
      strategicValueScore: 100,
      missingCriticalInfo: true,
      redFlagLikely: false,
      recommendation: "APPLY_CANDIDATE",
      confidence: 0.95,
      evidenceRelevance: "DIRECT",
    });
    expect(missingInfo.decision).toBe("REVIEW_REQUIRED");

    const lowConfidence = finalizeDecision(deterministic, {
      roleFitScore: 100,
      skillsFitScore: 100,
      seniorityFitScore: 100,
      strategicValueScore: 100,
      missingCriticalInfo: false,
      redFlagLikely: false,
      recommendation: "APPLY_CANDIDATE",
      confidence: 0.4,
      evidenceRelevance: "DIRECT",
    });
    expect(lowConfidence.decision).toBe("REVIEW_REQUIRED");
  });
});
