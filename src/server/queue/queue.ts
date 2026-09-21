import { Queue } from "bullmq";
import { getRedisConnection, FLOW_EXECUTION_QUEUE } from "./connection";

export type FlowExecutionJobData = {
  flowId: string;
  userId: string;
};

let queue: Queue<FlowExecutionJobData> | undefined;

function getQueue(): Queue<FlowExecutionJobData> {
  if (!queue) {
    queue = new Queue<FlowExecutionJobData>(FLOW_EXECUTION_QUEUE, { connection: getRedisConnection() });
  }
  return queue;
}

/**
 * Stack.md: BullMQ + Redis so a long-running browser session never lives
 * inside an HTTP request. `flowId` is used as the BullMQ job ID, so
 * re-enqueuing the same flow (a retry after a crashed worker) is a no-op
 * instead of a duplicate run - Phase 8's idempotency-key requirement.
 */
export async function enqueueFlow(data: FlowExecutionJobData): Promise<void> {
  await getQueue().add("run-flow", data, {
    jobId: data.flowId,
    attempts: 1,
    removeOnComplete: { age: 3600 },
    removeOnFail: { age: 86400 },
  });
}

export async function cancelQueuedFlow(flowId: string): Promise<void> {
  const job = await getQueue().getJob(flowId);
  if (job && (await job.isWaiting())) {
    await job.remove();
  }
}
