import { getEnv } from "../env";
import { logger } from "../logger";
import type { DecisionProvider } from "./provider";
import { jevSignalsSchema, type JobEvaluationState, type JevSignalsOutput } from "./schemas";

/**
 * Live Jev/TypeSafe AI provider. Sends only the normalized
 * `JobEvaluationState` - never raw HTML, screenshots, credentials or
 * page instructions - and validates the response against the exact same
 * schema the demo provider returns, so a bad or malformed live response
 * fails loudly instead of silently reaching the policy engine.
 */
export class JevDecisionProvider implements DecisionProvider {
  readonly name = "JEV";

  async evaluate(state: JobEvaluationState): Promise<JevSignalsOutput> {
    const env = getEnv();
    if (!env.JEV_API_KEY) {
      throw new Error("JEV_API_KEY is not configured; the live Jev provider cannot run.");
    }

    const response = await fetch(`${env.JEV_API_URL}/v1/decisions/job-evaluation`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.JEV_API_KEY}`,
      },
      body: JSON.stringify({
        state,
        questions: [
          "roleFitScore",
          "skillsFitScore",
          "seniorityFitScore",
          "strategicValueScore",
          "missingCriticalInfo",
          "redFlagLikely",
          "recommendation",
          "evidenceRelevance",
        ],
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      logger.error("Jev decision request failed", { status: response.status, body });
      throw new Error(`Jev request failed with status ${response.status}`);
    }

    const json = await response.json();
    return jevSignalsSchema.parse(json);
  }
}
