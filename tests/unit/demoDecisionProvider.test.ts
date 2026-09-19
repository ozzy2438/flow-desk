import { describe, expect, it } from "vitest";
import { DemoDecisionProvider } from "@/server/decision/demoProvider";
import type { JobEvaluationState } from "@/server/decision/schemas";

const provider = new DemoDecisionProvider();

function state(overrides: Partial<JobEvaluationState["job"]> = {}, evidence: JobEvaluationState["evidenceCandidates"] = []): JobEvaluationState {
  return {
    candidate: { constraints: [], evidenceCount: evidence.length },
    job: {
      title: "Applied AI Engineer",
      company: "Acme",
      location: "Melbourne",
      workplaceType: "HYBRID",
      employmentType: "CONTRACT",
      seniority: "SENIOR",
      salaryMin: 150000,
      salaryMax: 180000,
      descriptionRaw: "Build applied AI pipelines using Python and machine learning.",
      requiredSkills: ["python", "machine learning"],
      preferredSkills: [],
      ...overrides,
    },
    deterministicPolicy: { hardBlockerCount: 0, deepReviewReasonCount: 0 },
    evidenceCandidates: evidence,
    decisionPolicyVersion: "v1",
  };
}

describe("DemoDecisionProvider", () => {
  it("is deterministic: the same input always produces the same output", async () => {
    const input = state();
    const a = await provider.evaluate(input);
    const b = await provider.evaluate(input);
    expect(a).toEqual(b);
  });

  it("returns EVIDENCE_GAP when required skills have no matching evidence", async () => {
    const result = await provider.evaluate(state({ requiredSkills: ["java", "spring boot"] }, []));
    expect(result.evidenceRelevance).toBe("EVIDENCE_GAP");
  });

  it("returns DIRECT evidence relevance and a high skills score with strong matching evidence", async () => {
    const result = await provider.evaluate(
      state({ requiredSkills: ["python", "machine learning"] }, [
        {
          evidenceId: "proj-1",
          kind: "PROJECT",
          title: "Applied ML pipeline",
          skills: ["python", "machine learning"],
          tools: [],
          yearsExperience: 2,
        },
      ]),
    );
    expect(result.evidenceRelevance).toBe("DIRECT");
    expect(result.skillsFitScore).toBeGreaterThanOrEqual(75);
  });

  it("flags missingCriticalInfo when almost nothing is known about the posting", async () => {
    const result = await provider.evaluate(
      state({
        workplaceType: "UNKNOWN",
        employmentType: "UNKNOWN",
        seniority: "UNKNOWN",
        requiredSkills: [],
        descriptionRaw: "short",
      }),
    );
    expect(result.missingCriticalInfo).toBe(true);
  });

  it("scores rubric values only at 0/25/50/75/100", async () => {
    const result = await provider.evaluate(state());
    for (const score of [result.roleFitScore, result.skillsFitScore, result.seniorityFitScore, result.strategicValueScore]) {
      expect([0, 25, 50, 75, 100]).toContain(score);
    }
  });
});
