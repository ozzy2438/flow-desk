import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { ensureFixtureServer, closeFixtureServer } from "@/server/browser/fixtureServer";
import { runFlow, closeSharedBrowser } from "@/server/browser/worker";
import { importCandidateProfile } from "@/server/profile/importProfile";
import { importDecisionPolicy } from "@/server/policy/importPolicy";

const SCHEMA_CSV = `column_name,data_type,required,description
kind,STRING,TRUE,kind
evidence_id,STRING,FALSE,id
title,STRING,TRUE,title
skills,LIST,FALSE,skills
`;
const PROFILE_CSV = `kind,evidence_id,title,skills
PROJECT,safety-proj,Remote data project,python|sql
`;
const POLICY_CSV = `rule_code,category,field,operator,value,action,reason,active
EVIDENCE_GAP,EVIDENCE_GAP,requiredSkills,ALWAYS,,REVIEW,"gap",TRUE
`;

let userId: string;
let fixtureBaseUrl: string;
const createdRunIds: string[] = [];

async function createFlowAt(startUrl: string, allowedDomains: string[] = ["127.0.0.1"]) {
  const run = await db.researchRun.create({
    data: { userId, userGoal: "vitest safety run", requestedFlowCount: 1, status: "RUNNING" },
  });
  createdRunIds.push(run.id);
  return db.discoveryFlow.create({
    data: {
      researchRunId: run.id,
      source: "DEMO_BOARD_ALL",
      title: "Safety test flow",
      startUrl,
      goal: "safety test",
      stopCondition: "n/a",
      allowedDomains,
      allowedActions: ["CLICK", "SCROLL", "OPEN_JOB_DETAIL", "EXTRACT_JOB", "NEXT_PAGE", "WAIT", "STOP"],
      maxPages: 10,
      maxSteps: 20,
      maxDurationSeconds: 30,
    },
  });
}

beforeAll(async () => {
  const user = await db.user.create({
    data: { email: `browser-safety-${Date.now()}@flow-desk.test` },
  });
  userId = user.id;
  await importCandidateProfile({ userId, profileCsvText: PROFILE_CSV, schemaCsvText: SCHEMA_CSV });
  await importDecisionPolicy({ userId, policyCsvText: POLICY_CSV });
  fixtureBaseUrl = await ensureFixtureServer();
}, 30000);

afterAll(async () => {
  await db.jobPosting.deleteMany({
    where: { candidate: { flow: { researchRun: { userId } } } },
  });
  for (const runId of createdRunIds) {
    await db.researchRun.delete({ where: { id: runId } }).catch(() => {});
  }
  await closeSharedBrowser();
  await closeFixtureServer();
  await db.candidateProfileImport.deleteMany({ where: { userId } });
  await db.decisionPolicyImport.deleteMany({ where: { userId } });
  await db.user.delete({ where: { id: userId } }).catch(() => {});
}, 30000);

describe("runFlow safety checks (worker.ts's guardedGoto)", () => {
  it("fails a flow that redirects off the allowed domain, checking the post-redirect URL", async () => {
    const flow = await createFlowAt(`${fixtureBaseUrl}/test/redirect-external`);
    await runFlow(flow.id, userId);

    const finished = await db.discoveryFlow.findUnique({ where: { id: flow.id } });
    expect(finished?.status).toBe("FAILED");
    expect(finished?.failureCategory).toBe("POLICY_BLOCKED");
  }, 30000);

  it("fails a flow that gets a 429 with RATE_LIMITED", async () => {
    const flow = await createFlowAt(`${fixtureBaseUrl}/test/rate-limited`);
    await runFlow(flow.id, userId);

    const finished = await db.discoveryFlow.findUnique({ where: { id: flow.id } });
    expect(finished?.status).toBe("FAILED");
    expect(finished?.failureCategory).toBe("RATE_LIMITED");
  }, 30000);

  it("fails a flow that hits a login wall with LOGIN_REQUIRED", async () => {
    const flow = await createFlowAt(`${fixtureBaseUrl}/test/login-wall`);
    await runFlow(flow.id, userId);

    const finished = await db.discoveryFlow.findUnique({ where: { id: flow.id } });
    expect(finished?.status).toBe("FAILED");
    expect(finished?.failureCategory).toBe("LOGIN_REQUIRED");
  }, 30000);

  it("fails a flow that hits a CAPTCHA page with CAPTCHA", async () => {
    const flow = await createFlowAt(`${fixtureBaseUrl}/test/captcha`);
    await runFlow(flow.id, userId);

    const finished = await db.discoveryFlow.findUnique({ where: { id: flow.id } });
    expect(finished?.status).toBe("FAILED");
    expect(finished?.failureCategory).toBe("CAPTCHA");
  }, 30000);

  it("still completes normally against the real allowlisted job board", async () => {
    const flow = await createFlowAt(`${fixtureBaseUrl}/jobs?filter=remote`);
    await runFlow(flow.id, userId);

    const finished = await db.discoveryFlow.findUnique({ where: { id: flow.id } });
    expect(finished?.status).toBe("COMPLETE");

    await db.jobPosting.deleteMany({ where: { candidate: { flowId: flow.id } } });
  }, 30000);
});
