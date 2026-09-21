import { db } from "../db";

const TERMINAL = new Set(["COMPLETE", "FAILED", "CANCELLED"]);

/**
 * A ResearchRun has no worker of its own - it's just the sum of its flows'
 * states. Called by the browser worker after every status transition so the
 * dashboard's run-level status (RUNNING / COMPLETED / PARTIAL_FAILURE / ...)
 * stays accurate without a separate reconciliation job.
 */
export async function syncResearchRunStatus(researchRunId: string): Promise<void> {
  const flows = await db.discoveryFlow.findMany({
    where: { researchRunId },
    select: { status: true },
  });
  if (flows.length === 0) return;

  const allTerminal = flows.every((f) => TERMINAL.has(f.status));

  if (!allTerminal) {
    const anyActive = flows.some((f) => f.status !== "QUEUED" && !TERMINAL.has(f.status));
    if (anyActive) {
      await db.researchRun.updateMany({
        where: { id: researchRunId, status: { in: ["PLANNING", "QUEUED"] } },
        data: { status: "RUNNING" },
      });
    }
    return;
  }

  const allCancelled = flows.every((f) => f.status === "CANCELLED");
  const anyFailed = flows.some((f) => f.status === "FAILED");
  const anyComplete = flows.some((f) => f.status === "COMPLETE");

  const status = allCancelled
    ? "CANCELLED"
    : anyFailed
      ? anyComplete
        ? "PARTIAL_FAILURE"
        : "FAILED"
      : "COMPLETED";

  await db.researchRun.update({
    where: { id: researchRunId },
    data: { status, completedAt: new Date() },
  });
}
