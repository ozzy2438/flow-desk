import { describe, expect, it } from "vitest";
import { isObservationFresh, type CapturedObservation } from "@/server/browser/observation";
import { BROWSER_ACTION_KINDS, READ_ONLY_ALLOWED_ACTIONS, FORBIDDEN_ACTION_LABELS } from "@/server/browser/actions";

function observation(overrides: Partial<CapturedObservation> = {}): CapturedObservation {
  return {
    observationVersion: "abc123",
    url: "http://127.0.0.1:4000/jobs",
    title: "Jobs",
    visibleTextSummary: "",
    elements: [],
    ...overrides,
  };
}

describe("isObservationFresh (stale-state protection)", () => {
  it("is fresh when the decision's version matches the current observation", () => {
    expect(isObservationFresh("abc123", observation({ observationVersion: "abc123" }))).toBe(true);
  });

  it("is stale after the page re-renders or navigates (docs/browser-worker.md)", () => {
    expect(isObservationFresh("abc123", observation({ observationVersion: "def456" }))).toBe(false);
  });
});

describe("browser action allowlist", () => {
  it("every read-only allowed action is a recognized action kind", () => {
    for (const action of READ_ONLY_ALLOWED_ACTIONS) {
      expect(BROWSER_ACTION_KINDS).toContain(action);
    }
  });

  it("no forbidden action label overlaps the code-owned allowlist", () => {
    for (const forbidden of FORBIDDEN_ACTION_LABELS) {
      expect(BROWSER_ACTION_KINDS as readonly string[]).not.toContain(forbidden);
    }
  });
});
