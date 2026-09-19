import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { importCandidateProfile } from "@/server/profile/importProfile";
import { importDecisionPolicy } from "@/server/policy/importPolicy";
import { rawJobInputSchema } from "@/server/jobs/types";
import { normalizeJobInput } from "@/server/jobs/normalize";
import { evaluateAndPersistJob, PolicyNotConfiguredError } from "@/server/jobs/evaluate";
import { findDuplicateJob } from "@/server/jobs/duplicate";

const TEST_EMAIL = "vitest-evaluate@flow-desk.local";

const SCHEMA_CSV = `column_name,data_type,required,description
kind,STRING,TRUE,kind
evidence_id,STRING,FALSE,id
title,STRING,TRUE,title
skills,LIST,FALSE,skills
tools,LIST,FALSE,tools
years_experience,NUMBER,FALSE,years
`;

// Deliberately overlaps heavily with the "Applied AI Engineer" test job below
// (title, skills and seniority-appropriate years_experience) so the demo
// decision provider's keyword-overlap heuristic clears the APPLY_CANDIDATE
// thresholds - this test exercises the evaluate -> decision -> evidence
// pipeline end to end, not the heuristic's scoring internals (those are
// covered by tests/unit/demoDecisionProvider.test.ts).
const PROFILE_CSV = `kind,evidence_id,title,skills,tools,years_experience
PROJECT,proj-1,Applied AI Engineer pipeline,python|machine learning|mlops,Docker,5
PROJECT,proj-2,MLOps model serving platform,python|mlops|machine learning,FastAPI,5
`;

const POLICY_CSV = `rule_code,category,field,operator,value,action,reason,active
ROLE_EXCL,ROLE_EXCLUSION,title,CONTAINS,Business Development Manager,HARD_BLOCK,"excluded role",TRUE
EVIDENCE_GAP,EVIDENCE_GAP,requiredSkills,ALWAYS,,REVIEW,"gap",TRUE
`;

let userId: string;

beforeAll(async () => {
  const user = await db.user.upsert({
    where: { email: TEST_EMAIL },
    update: {},
    create: { email: TEST_EMAIL },
  });
  userId = user.id;
  await importCandidateProfile({ userId, profileCsvText: PROFILE_CSV, schemaCsvText: SCHEMA_CSV });
  await importDecisionPolicy({ userId, policyCsvText: POLICY_CSV });
});

afterAll(async () => {
  await db.jobPosting.deleteMany({ where: { source: "VITEST" } });
  await db.candidateProfileImport.deleteMany({ where: { userId } });
  await db.decisionPolicyImport.deleteMany({ where: { userId } });
  await db.user.delete({ where: { id: userId } }).catch(() => {});
});

describe("evaluateAndPersistJob", () => {
  it("throws PolicyNotConfiguredError when the user has no active policy", async () => {
    const otherUser = await db.user.create({ data: { email: "vitest-no-policy@flow-desk.local" } });
    const normalized = normalizeJobInput(
      rawJobInputSchema.parse({ source: "VITEST", title: "Anything", descriptionRaw: "x" }),
    );
    await expect(evaluateAndPersistJob(normalized, otherUser.id)).rejects.toBeInstanceOf(
      PolicyNotConfiguredError,
    );
    await db.user.delete({ where: { id: otherUser.id } });
  });

  it("hard-blocks an excluded role without calling the decision provider", async () => {
    const normalized = normalizeJobInput(
      rawJobInputSchema.parse({
        source: "VITEST",
        title: "Senior Business Development Manager",
        descriptionRaw: "Drive sales.",
      }),
    );
    const { job } = await evaluateAndPersistJob(normalized, userId);
    expect(job.evaluation?.decision).toBe("SKIP");
    expect(job.evaluation?.decisionProvider).toBe("NONE");
  });

  it("evaluates a strong match to APPLY_CANDIDATE and populates evidence matches", async () => {
    const normalized = normalizeJobInput(
      rawJobInputSchema.parse({
        source: "VITEST",
        title: "Applied AI Engineer",
        workplaceType: "HYBRID",
        employmentType: "CONTRACT",
        seniority: "SENIOR",
        descriptionRaw: "Build applied ML pipelines using Python and MLOps tooling.",
        requiredSkills: ["python", "machine learning", "mlops"],
      }),
    );
    const { job } = await evaluateAndPersistJob(normalized, userId);
    expect(job.evaluation?.decision).toBe("APPLY_CANDIDATE");
    expect(job.evaluation?.decisionProvider).toBe("DEMO_DETERMINISTIC");

    const matches = await db.evidenceMatch.findMany({ where: { jobId: job.id } });
    expect(matches.length).toBeGreaterThan(0);
    expect(matches[0]?.category).toBe("DIRECT");
  });

  it("routes an evidence gap to REVIEW_REQUIRED instead of a fabricated match", async () => {
    const normalized = normalizeJobInput(
      rawJobInputSchema.parse({
        source: "VITEST",
        title: "Senior Java Backend Engineer",
        descriptionRaw: "Build low-latency Java services with Kafka.",
        requiredSkills: ["java", "spring boot", "kafka"],
      }),
    );
    const { job } = await evaluateAndPersistJob(normalized, userId);
    expect(job.evaluation?.decision).toBe("REVIEW_REQUIRED");
    expect(job.evaluation?.deepReviewReasons).not.toHaveLength(0);
  });

  it("detects a duplicate posting by dedupe key and still evaluates it", async () => {
    const raw = rawJobInputSchema.parse({
      source: "VITEST",
      title: "Data Scientist",
      company: "DupeCo",
      location: "Melbourne",
      descriptionRaw: "Analyze data.",
    });
    const normalized = normalizeJobInput(raw);
    const first = await evaluateAndPersistJob(normalized, userId);
    expect(first.duplicate).toBeNull();

    const second = await evaluateAndPersistJob(normalized, userId);
    expect(second.duplicate?.id).toBe(first.job.id);

    const found = await findDuplicateJob(normalized.dedupeKey);
    expect(found).not.toBeNull();
  });
});
