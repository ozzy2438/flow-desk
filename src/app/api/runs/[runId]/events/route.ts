import { db } from "@/server/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TERMINAL_RUN_STATUSES = new Set(["COMPLETED", "CANCELLED", "PARTIAL_FAILURE", "FAILED"]);
const POLL_INTERVAL_MS = 1000;
const MAX_STREAM_MS = 10 * 60 * 1000;

async function loadRunSnapshot(runId: string) {
  const run = await db.researchRun.findUnique({
    where: { id: runId },
    include: {
      flows: {
        orderBy: { createdAt: "asc" },
        include: {
          screenshots: { orderBy: { createdAt: "asc" }, take: 20 },
          events: { orderBy: { createdAt: "desc" }, take: 5 },
        },
      },
    },
  });
  return run;
}

/**
 * STACK.md: "Server-Sent Events first - SSE is simpler for progress
 * updates." Polls Postgres rather than standing up a separate pub/sub
 * layer - simple, correct, and fast enough at this scale (a handful of
 * flows per run, one browser tab watching).
 */
export async function GET(_request: Request, { params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const startedAt = Date.now();
      let closed = false;

      controller.enqueue(encoder.encode(`retry: 2000\n\n`));

      const tick = async () => {
        if (closed) return;
        const run = await loadRunSnapshot(runId);
        if (!run) {
          controller.enqueue(encoder.encode(`event: error\ndata: ${JSON.stringify({ error: "not_found" })}\n\n`));
          controller.close();
          closed = true;
          return;
        }

        controller.enqueue(encoder.encode(`data: ${JSON.stringify(run)}\n\n`));

        const shouldStop =
          TERMINAL_RUN_STATUSES.has(run.status) || Date.now() - startedAt > MAX_STREAM_MS;
        if (shouldStop) {
          controller.enqueue(encoder.encode(`event: done\ndata: {}\n\n`));
          controller.close();
          closed = true;
          return;
        }

        setTimeout(tick, POLL_INTERVAL_MS);
      };

      await tick();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
