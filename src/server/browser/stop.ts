import { db } from "../db";
import { cancelQueuedFlow } from "../queue/queue";

const TERMINAL_FLOW_STATUSES = new Set(["COMPLETE", "FAILED", "CANCELLED"]);

/**
 * docs/browser-worker.md cancellation model: remove the job if it hasn't
 * been claimed by a worker yet, or set `cancellationRequested` so a running
 * worker sees it at its next between-steps check and closes its context
 * gracefully instead of being killed mid-navigation.
 */
export async function stopFlow(flowId: string): Promise<void> {
  const flow = await db.discoveryFlow.findUnique({ where: { id: flowId }, select: { status: true } });
  if (!flow || TERMINAL_FLOW_STATUSES.has(flow.status)) return;

  await cancelQueuedFlow(flowId);

  if (flow.status === "QUEUED") {
    await db.discoveryFlow.update({
      where: { id: flowId },
      data: { status: "CANCELLED", cancellationRequested: true, finishedAt: new Date() },
    });
  } else {
    await db.discoveryFlow.update({ where: { id: flowId }, data: { cancellationRequested: true } });
  }
}

export async function stopResearchRun(researchRunId: string): Promise<void> {
  const flows = await db.discoveryFlow.findMany({
    where: { researchRunId },
    select: { id: true },
  });
  await Promise.all(flows.map((f) => stopFlow(f.id)));
}
