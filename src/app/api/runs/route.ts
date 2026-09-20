import { NextResponse } from "next/server";
import { getCurrentUser } from "@/server/auth";
import { db } from "@/server/db";
import { planRequestSchema } from "@/server/planner/schema";
import { planDiscoveryFlows } from "@/server/planner/planner";
import { enqueueFlow } from "@/server/queue/queue";
import { UnsupportedJobUrlError } from "@/server/jobs/urlImport";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = planRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid research request.", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const user = await getCurrentUser();
  const { goal, requestedFlowCount, sourceUrls, deviceMode, sourceOptions } = parsed.data;

  const run = await db.researchRun.create({
    data: {
      userId: user.id,
      userGoal: goal,
      requestedFlowCount,
      mode: `READ_ONLY:${deviceMode}`,
      status: "PLANNING",
    },
  });

  let candidates;
  try {
    candidates = await planDiscoveryFlows(goal, requestedFlowCount, sourceUrls, sourceOptions);
  } catch (error) {
    await db.researchRun.update({ where: { id: run.id }, data: { status: "FAILED" } });
    if (error instanceof UnsupportedJobUrlError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 422 });
    }
    throw error;
  }

  if (candidates.length === 0) {
    await db.researchRun.update({ where: { id: run.id }, data: { status: "FAILED" } });
    return NextResponse.json(
      { error: "The planner could not produce any valid, allowlisted flows for this goal." },
      { status: 422 },
    );
  }

  const flows = await db.$transaction(
    candidates.map((candidate) =>
      db.discoveryFlow.create({
        data: { ...candidate, researchRunId: run.id, status: "QUEUED" },
      }),
    ),
  );

  await db.researchRun.update({ where: { id: run.id }, data: { status: "QUEUED" } });

  for (const flow of flows) {
    await enqueueFlow({ flowId: flow.id, userId: user.id });
  }

  return NextResponse.json({ id: run.id, flowCount: flows.length });
}
