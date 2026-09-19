import type { JobEvaluationState, JevSignalsOutput } from "./schemas";

/**
 * docs/jev-integration.md: Jev receives normalized state plus typed
 * questions and returns bounded decisions. It never sees raw HTML, browser
 * credentials, screenshots, or untrusted page instructions - only what
 * `JobEvaluationState` carries.
 */
export interface DecisionProvider {
  readonly name: string;
  evaluate(state: JobEvaluationState): Promise<JevSignalsOutput>;
}

export type BrowserRoutingChoice = string;

export interface BrowserRoutingProvider {
  chooseAction(input: {
    observationVersion: string;
    choices: BrowserRoutingChoice[];
    context: string;
  }): Promise<{ choice: BrowserRoutingChoice; observationVersion: string }>;
}
