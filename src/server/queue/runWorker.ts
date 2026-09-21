import { startFlowWorker } from "./worker";
import { closeSharedBrowser } from "../browser/worker";
import { closeFixtureServer } from "../browser/fixtureServer";
import { logger } from "../logger";

/**
 * Standalone worker process entrypoint (`pnpm worker`). STACK.md: "Separate
 * web and worker processes - browser workers need different resource and
 * timeout budgets" than the Next.js web process.
 */
async function main() {
  const worker = startFlowWorker();
  logger.info("Flow execution worker started");

  async function shutdown() {
    logger.info("Shutting down flow execution worker");
    await worker.close();
    await closeSharedBrowser();
    await closeFixtureServer();
    process.exit(0);
  }

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((error) => {
  logger.error("Flow execution worker crashed", { error: error instanceof Error ? error.message : String(error) });
  process.exit(1);
});
