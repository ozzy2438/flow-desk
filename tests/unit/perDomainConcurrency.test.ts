import { describe, expect, it } from "vitest";
import { acquireDomainSlot } from "@/server/browser/perDomainConcurrency";

describe("acquireDomainSlot", () => {
  it("blocks the (N+1)th acquisition until a held slot is released", async () => {
    const hostname = `test-host-${Date.now()}`;
    const releaseA = await acquireDomainSlot(hostname, 2);
    const releaseB = await acquireDomainSlot(hostname, 2);

    let thirdAcquired = false;
    const thirdPromise = acquireDomainSlot(hostname, 2).then((release) => {
      thirdAcquired = true;
      return release;
    });

    // Give the pending acquisition a tick to (wrongly) resolve if it were broken.
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(thirdAcquired).toBe(false);

    releaseA();
    const releaseC = await thirdPromise;
    expect(thirdAcquired).toBe(true);

    releaseB();
    releaseC();
  });

  it("different hostnames do not share a limit", async () => {
    const a = `host-a-${Date.now()}`;
    const b = `host-b-${Date.now()}`;
    const releaseA1 = await acquireDomainSlot(a, 1);

    let acquired = false;
    await acquireDomainSlot(b, 1).then((release) => {
      acquired = true;
      release();
    });
    expect(acquired).toBe(true);

    releaseA1();
  });
});
