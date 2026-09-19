import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { importCandidateProfileJson } from "@/server/profile/importProfileJson";
import { importDecisionPolicyJson } from "@/server/policy/importPolicyJson";

let userId: string;

const PROFILE_SCHEMA = JSON.stringify({
  $schema: "https://json-schema.org/draft/2020-12/schema",
  type: "object",
  required: ["projects"],
  properties: {
    projects: {
      type: "array",
      items: {
        type: "object",
        required: ["project_id", "name"],
        properties: {
          project_id: { type: "string" },
          name: { type: "string" },
          technologies: { type: "array", items: { type: "string" } },
          allowed_claims: { type: "array", items: { type: "string" } },
          claim_boundaries: { type: "array", items: { type: "string" } },
        },
      },
    },
  },
});

const PROFILE = JSON.stringify({
  projects: [
    {
      project_id: "P01",
      name: "Evidence-backed data workflow",
      technologies: ["Python", "SQL"],
      allowed_claims: ["Built a controlled data workflow."],
      claim_boundaries: ["Do not claim production deployment."],
    },
  ],
  skills: [],
  experience: [],
  evidence: [],
  claim_policy: {},
});

const POLICY = JSON.stringify({
  hard_constraints: {
    blockers: [
      { blocker: "Active security clearance is required." },
      { blocker: "A requirement that has no deterministic matcher." },
    ],
  },
  soft_preferences: {},
  triage_policy: {},
  claim_use_policy: { avoid: ["Do not claim production deployment."] },
});

beforeAll(async () => {
  const user = await db.user.create({
    data: { email: `json-import-${Date.now()}@flow-desk.test` },
  });
  userId = user.id;
});

afterAll(async () => {
  await db.candidateProfileImport.deleteMany({ where: { userId } });
  await db.decisionPolicyImport.deleteMany({ where: { userId } });
  await db.user.delete({ where: { id: userId } });
});

describe("native Apply OS JSON imports", () => {
  it("validates the profile against its JSON Schema and preserves claim boundaries", async () => {
    const result = await importCandidateProfileJson({
      userId,
      profileJsonText: PROFILE,
      schemaJsonText: PROFILE_SCHEMA,
    });

    expect(result.status).toBe("VALID");
    const project = await db.profileRecord.findFirst({
      where: { importId: result.importId, evidenceId: "P01" },
    });
    expect(project?.kind).toBe("PROJECT");
    expect(project?.data).toMatchObject({
      tools: ["Python", "SQL"],
      claim_boundaries: ["Do not claim production deployment."],
    });
  });

  it("maps recognized blockers deterministically and routes unknown blockers to review", async () => {
    const result = await importDecisionPolicyJson({ userId, policyJsonText: POLICY });

    expect(result.status).toBe("VALID");
    const rules = await db.policyRule.findMany({ where: { importId: result.importId } });
    expect(rules).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "HC_CLEARANCE", action: "HARD_BLOCK" }),
        expect.objectContaining({ code: "HC_REVIEW_2", action: "REVIEW" }),
        expect.objectContaining({ code: "CLAIM_FORBIDDEN_1", category: "CLAIM_POLICY" }),
      ]),
    );
  });

  it("does not activate a profile that fails the supplied JSON Schema", async () => {
    const result = await importCandidateProfileJson({
      userId,
      profileJsonText: JSON.stringify({ projects: [{ project_id: "P02" }] }),
      schemaJsonText: PROFILE_SCHEMA,
    });

    expect(result.status).toBe("INVALID");
    expect(result.errorCount).toBeGreaterThan(0);
    const invalidImport = await db.candidateProfileImport.findUnique({
      where: { id: result.importId },
    });
    expect(invalidImport?.isActive).toBe(false);
  });
});
