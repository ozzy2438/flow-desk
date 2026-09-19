import { describe, expect, it } from "vitest";
import { discoveryFlowCandidateSchema, planRequestSchema } from "@/server/planner/schema";
import { ALLOWED_DOMAINS } from "@/server/browser/sourceRegistry";

function candidate(overrides: Record<string, unknown> = {}) {
  return {
    source: "DEMO_BOARD_ALL",
    title: "Demo board",
    startUrl: "http://127.0.0.1:4000/jobs",
    goal: "Discover roles.",
    stopCondition: "Listing exhausted.",
    allowedDomains: ALLOWED_DOMAINS,
    allowedActions: ["CLICK", "SCROLL", "OPEN_JOB_DETAIL", "EXTRACT_JOB", "STOP"],
    maxPages: 3,
    maxSteps: 20,
    maxDurationSeconds: 120,
    ...overrides,
  };
}

describe("discoveryFlowCandidateSchema", () => {
  it("accepts a well-formed candidate", () => {
    expect(discoveryFlowCandidateSchema.safeParse(candidate()).success).toBe(true);
  });

  it("rejects a domain outside the allowlist (AGENCY_BRIEF.md Phase 2)", () => {
    const result = discoveryFlowCandidateSchema.safeParse(
      candidate({ allowedDomains: ["linkedin.com"] }),
    );
    expect(result.success).toBe(false);
  });

  it("rejects an action outside the code-owned allowlist", () => {
    const result = discoveryFlowCandidateSchema.safeParse(
      candidate({ allowedActions: ["CLICK", "SUBMIT"] }),
    );
    expect(result.success).toBe(false);
  });

  it("rejects an unbounded flow (missing page/step/duration caps)", () => {
    expect(discoveryFlowCandidateSchema.safeParse(candidate({ maxPages: 0 })).success).toBe(false);
    expect(discoveryFlowCandidateSchema.safeParse(candidate({ maxSteps: 0 })).success).toBe(false);
    expect(
      discoveryFlowCandidateSchema.safeParse(candidate({ maxDurationSeconds: 0 })).success,
    ).toBe(false);
    expect(
      discoveryFlowCandidateSchema.safeParse(candidate({ maxDurationSeconds: 10_000 })).success,
    ).toBe(false);
  });

  it("rejects a non-http(s) start URL", () => {
    expect(
      discoveryFlowCandidateSchema.safeParse(candidate({ startUrl: "not-a-url" })).success,
    ).toBe(false);
  });
});

describe("planRequestSchema", () => {
  it("caps requested flow count at 10", () => {
    expect(planRequestSchema.safeParse({ goal: "a".repeat(20), requestedFlowCount: 10 }).success).toBe(
      true,
    );
    expect(planRequestSchema.safeParse({ goal: "a".repeat(20), requestedFlowCount: 11 }).success).toBe(
      false,
    );
  });

  it("requires a minimum goal length", () => {
    expect(planRequestSchema.safeParse({ goal: "short", requestedFlowCount: 3 }).success).toBe(false);
  });
});
