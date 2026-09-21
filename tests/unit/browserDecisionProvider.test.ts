import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DemoBrowserDecisionProvider,
  JevBrowserDecisionProvider,
  type BrowserActionCandidate,
} from "@/server/browser/decisionProvider";
import type { CapturedObservation } from "@/server/browser/observation";

const observation: CapturedObservation = {
  observationVersion: "obs-1",
  url: "https://jobs.example.test/search",
  title: "Jobs",
  visibleTextSummary: "Data Engineer and Applied AI Engineer roles",
  elements: [],
};

const candidates: BrowserActionCandidate[] = [
  {
    id: "open-data-engineer",
    kind: "OPEN_JOB_DETAIL",
    label: "Data Engineer",
    description: "Open the public Data Engineer job detail.",
  },
  {
    id: "stop-source",
    kind: "STOP",
    label: "Stop",
    description: "Stop only when no useful result remains.",
  },
];

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("browser decision providers", () => {
  it("keeps deterministic demo actions inside the code-owned candidate set", async () => {
    const decision = await new DemoBrowserDecisionProvider().chooseAction({
      goal: "Find data roles",
      observation,
      candidates,
      recentActions: [],
    });

    expect(decision.actionId).toBe("open-data-engineer");
    expect(candidates.some((candidate) => candidate.id === decision.actionId)).toBe(true);
    expect(decision.observationVersion).toBe("obs-1");
  });

  it("drops repeated screenshots from the visual flow timeline", async () => {
    const provider = new DemoBrowserDecisionProvider();
    const repeated = await provider.judgeScreenshot({
      goal: "Find data roles",
      observation,
      stepLabel: "Same screen",
      history: [{ ...observation, stepLabel: "Original screen" }],
    });
    const newScreen = await provider.judgeScreenshot({
      goal: "Find data roles",
      observation: { ...observation, observationVersion: "obs-2", title: "Job detail" },
      stepLabel: "Job detail",
      history: [{ ...observation, stepLabel: "Original screen" }],
    });

    expect(repeated.distinct).toBe(false);
    expect(newScreen.distinct).toBe(true);
  });

  it("rejects a Jev action id that was not supplied by code", async () => {
    vi.stubEnv("JEV_API_KEY", "test-only-key");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            answers: {
              nextAction: {
                type: "choice",
                choice: "invented-login-action",
                probabilities: { "invented-login-action": 1 },
                confidence: 1,
              },
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );

    await expect(
      new JevBrowserDecisionProvider().chooseAction({
        goal: "Find data roles",
        observation,
        candidates,
        recentActions: [],
      }),
    ).rejects.toThrow("outside the code-owned candidate set");
  });
});
