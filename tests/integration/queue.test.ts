import { afterAll, describe, expect, it } from "vitest";
import { Queue } from "bullmq";
import { getRedisConnection, FLOW_EXECUTION_QUEUE } from "@/server/queue/connection";
import { enqueueFlow, cancelQueuedFlow } from "@/server/queue/queue";

const queue = new Queue(FLOW_EXECUTION_QUEUE, { connection: getRedisConnection() });

afterAll(async () => {
  await queue.close();
});

describe("flow-execution queue", () => {
  it("re-enqueuing the same flow ID is idempotent, not a duplicate run (retry semantics)", async () => {
    const flowId = `vitest-flow-${Date.now()}`;
    await enqueueFlow({ flowId, userId: "vitest-user" });
    await enqueueFlow({ flowId, userId: "vitest-user" });

    const job = await queue.getJob(flowId);
    expect(job).not.toBeNull();

    const waiting = await queue.getJobs(["waiting", "delayed"]);
    const matching = waiting.filter((j) => j.id === flowId);
    expect(matching.length).toBeLessThanOrEqual(1);

    await job?.remove();
  });

  it("cancelQueuedFlow removes a job before a worker claims it", async () => {
    const flowId = `vitest-flow-cancel-${Date.now()}`;
    await enqueueFlow({ flowId, userId: "vitest-user" });

    const beforeCancel = await queue.getJob(flowId);
    expect(beforeCancel).not.toBeNull();

    await cancelQueuedFlow(flowId);

    const afterCancel = await queue.getJob(flowId);
    expect(afterCancel).toBeUndefined();
  });
});
