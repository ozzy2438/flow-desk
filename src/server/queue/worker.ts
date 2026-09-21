import { Worker, type Job } from "bullmq";
import { getRedisConnection, FLOW_EXECUTION_QUEUE } from "./connection";
import type { FlowExecutionJobData } from "./queue";
import { runFlow } from "../browser/worker";
import { getEnv } from "../env";
import { logger } from "../logger";

/**
 * STACK.md's starting budget: worker concurrency 3 by default (configurable
 * via BROWSER_CONCURRENCY, up to 10 "only in a controlled environment" per
 * ARCHITECTURE.md's parallelism model). A ResearchRun can plan and display
 * up to 10 flow cards; this is what actually bounds how many browser
 * contexts run at once.
 */
export function startFlowWorker(): Worker<FlowExecutionJobData> {
  const env = getEnv();
  const worker = new Worker<FlowExecutionJobData>(
    FLOW_EXECUTION_QUEUE,
    async (job: Job<FlowExecutionJobData>) => {
      await runFlow(job.data.flowId, job.data.userId);
    },
    { connection: getRedisConnection(), concurrency: env.BROWSER_CONCURRENCY },
  );

  worker.on("failed", (job, err) => {
    logger.error("Flow execution job failed", { flowId: job?.data.flowId, error: err.message });
  });

  return worker;
}
