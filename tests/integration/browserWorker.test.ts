import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { getSourceDefinition } from "@/server/browser/sourceRegistry";
import { runFlow, closeSharedBrowser } from "@/server/browser/worker";
import { closeFixtureServer } from "@/server/browser/fixtureServer";
import { importCandidateProfile } from "@/server/profile/importProfile";
import { importDecisionPolicy } from "@/server/policy/importPolicy";

const SCHEMA_CSV = `column_name,data_type,required,description
kind,STRING,TRUE,kind
evidence_id,STRING,FALSE,id
title,STRING,TRUE,title
skills,LIST,FALSE,skills
`;
const PROFILE_CSV = `kind,evidence_id,title,skills
PROJECT,proj-1,Applied ML pipeline,python|machine learning|mlops
`;
const POLICY_CSV = `rule_code,category,field,operator,value,action,reason,active
ROLE_EXCL,ROLE_EXCLUSION,title,CONTAINS,Business Development Manager,HARD_BLOCK,"excluded",TRUE
EVIDENCE_GAP,EVIDENCE_GAP,requiredSkills,ALWAYS,,REVIEW,"gap",TRUE
`;

let userId: string;
const createdRunIds: string[] = [];

type FlowOverrides = Partial<{ maxPages: number; maxSteps: number; maxDurationSeconds: number; goal: string }>;

async function createFlow(sourceId: string, overrides: FlowOverrides = {}) {
  const source = getSourceDefinition(sourceId)!;
  const startUrl = await source.resolveStartUrl();
  const run = await db.researchRun.create({
    data: { userId, userGoal: "vitest run", requestedFlowCount: 1, status: "RUNNING" },
  });
  createdRunIds.push(run.id);
  return db.discoveryFlow.create({
    data: {
      researchRunId: run.id,
      source: sourceId,
      title: source.label,
      startUrl,
      goal: source.defaultGoal,
      stopCondition: source.defaultStopCondition,
      allowedDomains: source.allowedDomains,
      allowedActions: ["CLICK", "SCROLL", "OPEN_JOB_DETAIL", "EXTRACT_JOB", "NEXT_PAGE", "WAIT", "STOP"],
      maxPages: 10,
      maxSteps: 20,
      maxDurationSeconds: 60,
      ...overrides,
    },
  });
}

beforeAll(async () => {
  const user = await db.user.create({
    data: { email: `browser-worker-${Date.now()}@flow-desk.test` },
  });
  userId = user.id;
  await importCandidateProfile({ userId, profileCsvText: PROFILE_CSV, schemaCsvText: SCHEMA_CSV });
  await importDecisionPolicy({ userId, policyCsvText: POLICY_CSV });
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

describe("runFlow (real Playwright against the local fixture board)", () => {
  it("opens the listing, extracts every job detail page, and persists screenshots/events", async () => {
    const flow = await createFlow("DEMO_BOARD_ALL");

    await runFlow(flow.id, userId);

    const finished = await db.discoveryFlow.findUnique({ where: { id: flow.id } });
    expect(finished?.status).toBe("COMPLETE");
    expect(finished?.jobsDiscovered).toBeGreaterThan(0);
    expect(finished?.jobsNormalized).toBe(finished?.jobsDiscovered);

    const screenshots = await db.screenshotArtifact.count({ where: { flowId: flow.id } });
    expect(screenshots).toBeGreaterThan(0);

    const events = await db.browserEvent.findMany({ where: { flowId: flow.id } });
    expect(events.some((e) => e.kind === "OPENING_BROWSER")).toBe(true);
    expect(events.some((e) => e.kind === "EXTRACT_JOB")).toBe(true);

    // The role-exclusion posting on the demo board must be blocked, never applied to.
    const jobs = await db.jobPosting.findMany({
      where: { candidate: { flowId: flow.id } },
      include: { evaluation: true },
    });
    const excluded = jobs.find((j) => j.title.includes("Business Development Manager"));
    expect(excluded?.evaluation?.decision).toBe("SKIP");
  }, 30000);

  it("respects the page budget instead of walking the entire listing", async () => {
    const flow = await createFlow("DEMO_BOARD_ALL", { maxPages: 2 });
    await runFlow(flow.id, userId);

    const finished = await db.discoveryFlow.findUnique({ where: { id: flow.id } });
    expect(finished?.status).toBe("COMPLETE");
    // 1 listing page + at most 1 detail page fits inside a 2-page budget.
    expect(finished!.jobsNormalized).toBeLessThanOrEqual(1);

    const stopEvent = await db.browserEvent.findFirst({
      where: { flowId: flow.id, kind: "STOP", label: "Page budget reached" },
    });
    expect(stopEvent).not.toBeNull();
  }, 30000);

  it("types a search term into the job board's real search box and narrows results (TYPE_TEXT + CLICK)", async () => {
    const flow = await createFlow("DEMO_BOARD_ALL", {
      goal: "Find Data Scientist roles in Melbourne or remote.",
    });
    await runFlow(flow.id, userId);

    const finished = await db.discoveryFlow.findUnique({ where: { id: flow.id } });
    expect(finished?.status).toBe("COMPLETE");
    // "data scientist" only matches one posting on the demo board.
    expect(finished?.jobsDiscovered).toBe(1);

    const events = await db.browserEvent.findMany({ where: { flowId: flow.id }, orderBy: { createdAt: "asc" } });
    expect(events.some((e) => e.label.includes('Typing "data scientist"'))).toBe(true);
    expect(events.some((e) => e.label.includes("Search results updated"))).toBe(true);

    const jobs = await db.jobPosting.findMany({ where: { candidate: { flowId: flow.id } } });
    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.title).toBe("Data Scientist");
  }, 30000);

  it("stops immediately and marks the flow CANCELLED when cancellation was already requested", async () => {
    const flow = await createFlow("DEMO_BOARD_ALL");
    await db.discoveryFlow.update({ where: { id: flow.id }, data: { cancellationRequested: true } });

    await runFlow(flow.id, userId);

    const finished = await db.discoveryFlow.findUnique({ where: { id: flow.id } });
    expect(finished?.status).toBe("CANCELLED");
    expect(finished?.jobsNormalized).toBe(0);
  }, 30000);
});
