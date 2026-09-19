import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { db } from "@/server/db";
import { importCandidateProfile } from "@/server/profile/importProfile";
import { importDecisionPolicy } from "@/server/policy/importPolicy";
import { runPublicAtsFlow } from "@/server/jobSources/runPublicAtsFlow";

const SCHEMA_CSV = `column_name,data_type,required,description
kind,STRING,TRUE,kind
evidence_id,STRING,FALSE,id
title,STRING,TRUE,title
skills,LIST,FALSE,skills
`;
const PROFILE_CSV = `kind,evidence_id,title,skills
PROJECT,ats-proj,Melbourne data workflow,python|sql|data engineering
`;
const POLICY_CSV = `rule_code,category,field,operator,value,action,reason,active
EVIDENCE_GAP,EVIDENCE_GAP,requiredSkills,ALWAYS,,REVIEW,"gap",TRUE
`;

let userId: string;
let runId: string;

beforeAll(async () => {
  const user = await db.user.create({
    data: { email: `public-ats-${Date.now()}@flow-desk.test` },
  });
  userId = user.id;
  await importCandidateProfile({ userId, profileCsvText: PROFILE_CSV, schemaCsvText: SCHEMA_CSV });
  await importDecisionPolicy({ userId, policyCsvText: POLICY_CSV });
});

afterAll(async () => {
  await db.jobPosting.deleteMany({
    where: { candidate: { flow: { researchRun: { userId } } } },
  });
  if (runId) await db.researchRun.delete({ where: { id: runId } }).catch(() => {});
  await db.candidateProfileImport.deleteMany({ where: { userId } });
  await db.decisionPolicyImport.deleteMany({ where: { userId } });
  await db.user.delete({ where: { id: userId } }).catch(() => {});
});

describe("official public ATS flow", () => {
  it("evaluates a published Lever job but forces human review when recency is unverifiable", async () => {
    const run = await db.researchRun.create({
      data: {
        userId,
        userGoal: "Find Data Engineer roles in Melbourne from the last 7 days",
        requestedFlowCount: 1,
        status: "RUNNING",
      },
    });
    runId = run.id;
    const flow = await db.discoveryFlow.create({
      data: {
        researchRunId: run.id,
        source: "LEVER_BOARD:global:acme",
        title: "Acme · Lever public board",
        startUrl: "https://api.lever.co/v0/postings/acme",
        goal: run.userGoal,
        stopCondition: "Published feed exhausted",
        allowedDomains: ["api.lever.co"],
        allowedActions: ["EXTRACT_JOB", "STOP"],
        maxPages: 3,
        maxSteps: 10,
        maxDurationSeconds: 60,
      },
    });

    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith("/postings/acme")) {
        return new Response(
          JSON.stringify([
            {
              id: "job-1",
              text: "Data Engineer",
              categories: { location: "Melbourne, Australia" },
            },
          ]),
          { status: 200 },
        );
      }
      return new Response(
        JSON.stringify({
          id: "job-1",
          text: "Data Engineer",
          categories: { location: "Melbourne, Australia", commitment: "Full-time" },
          country: "AU",
          descriptionPlain: "Build Python and SQL data pipelines.",
          hostedUrl: "https://jobs.lever.co/acme/job-1",
          workplaceType: "hybrid",
        }),
        { status: 200 },
      );
    });

    await runPublicAtsFlow(flow, userId, fetchMock as typeof fetch);

    const finished = await db.discoveryFlow.findUnique({ where: { id: flow.id } });
    expect(finished).toMatchObject({
      status: "COMPLETE",
      jobsDiscovered: 1,
      jobsNormalized: 1,
      jobsReviewRequired: 1,
    });

    const job = await db.jobPosting.findFirst({
      where: { candidate: { flowId: flow.id } },
      include: { evaluation: true },
    });
    expect(job).toMatchObject({ sourceOpenStatus: "OPEN", postedAtBasis: "UNKNOWN" });
    expect(job?.sourceRetrievedAt).not.toBeNull();
    expect(job?.evaluation?.decision).toBe("REVIEW_REQUIRED");
    expect(job?.evaluation?.deepReviewReasons).toEqual(
      expect.arrayContaining([expect.stringContaining("does not expose a verifiable published date")]),
    );
  });
});
