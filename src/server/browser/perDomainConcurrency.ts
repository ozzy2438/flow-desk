/**
 * docs/browser-worker.md: "Use per-domain concurrency limits. A source
 * should not receive many simultaneous sessions by default." BullMQ's
 * `concurrency` option bounds total flows across all sources; this bounds
 * how many of those run against the *same* domain at once, independent of
 * how many other domains are also active.
 *
 * In-process only - correct for the single worker process this build's
 * `pnpm worker` entrypoint runs (STACK.md's "separate web and worker
 * processes", one process each). Scaling to multiple worker processes or
 * machines would need this backed by Redis (e.g. a counting semaphore key)
 * instead of a local Map; noted here rather than built speculatively since
 * nothing in this build runs more than one worker process.
 */
const active = new Map<string, number>();
const waiters = new Map<string, Array<() => void>>();

export async function acquireDomainSlot(hostname: string, maxConcurrent: number): Promise<() => void> {
  while ((active.get(hostname) ?? 0) >= maxConcurrent) {
    await new Promise<void>((resolve) => {
      const queue = waiters.get(hostname) ?? [];
      queue.push(resolve);
      waiters.set(hostname, queue);
    });
  }

  active.set(hostname, (active.get(hostname) ?? 0) + 1);

  let released = false;
  return () => {
    if (released) return;
    released = true;
    active.set(hostname, Math.max(0, (active.get(hostname) ?? 1) - 1));
    const queue = waiters.get(hostname);
    const next = queue?.shift();
    if (next) next();
  };
}
