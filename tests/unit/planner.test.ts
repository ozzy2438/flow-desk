import { describe, expect, it } from "vitest";
import { planDiscoveryFlows } from "@/server/planner/planner";

describe("planDiscoveryFlows", () => {
  it("creates exactly the requested number of bounded parallel flows", async () => {
    const flows = await planDiscoveryFlows(
      "Research current data engineering roles",
      5,
      ["https://jobs.lever.co/acme"],
      { linkedIn: false, seek: false },
    );

    expect(flows).toHaveLength(5);
    expect(new Set(flows.map((flow) => flow.title)).size).toBe(5);
    expect(flows.every((flow) => flow.allowedDomains.includes("api.lever.co"))).toBe(true);
  });

  it("adds signed-in sources only when the request explicitly asks for them", async () => {
    const ordinary = await planDiscoveryFlows("Research remote applied AI roles", 3, [], {
      linkedIn: false,
      seek: false,
    });
    const requested = await planDiscoveryFlows("Research LinkedIn applied AI roles", 3, [], {
      linkedIn: true,
      seek: false,
    });

    expect(ordinary.some((flow) => flow.source === "LINKEDIN_MANUAL")).toBe(false);
    expect(requested.some((flow) => flow.source === "LINKEDIN_MANUAL")).toBe(true);
  });
});
