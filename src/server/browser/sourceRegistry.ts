import { ensureFixtureServer } from "./fixtureServer";
import { READ_ONLY_ALLOWED_ACTIONS } from "./actions";

export type SourceDefinition = {
  id: string;
  label: string;
  /** Resolves the approved start URL. Async because the fixture source boots a local server. */
  resolveStartUrl: () => Promise<string>;
  allowedDomains: string[];
  defaultGoal: string;
  defaultStopCondition: string;
};

/**
 * docs/data-apis.md's rollout plan: build first against a manually
 * configured source registry, add real source adapters only after their
 * terms, reliability and legal constraints are reviewed. This build ships
 * exactly one entry - a local fixture job board - so `pnpm dev` can run
 * Milestone 6/7's proof of concept with zero external risk. Adding SEEK,
 * LinkedIn, Indeed or Jora is a deliberate follow-up, not a default.
 */
export const SOURCE_REGISTRY: SourceDefinition[] = [
  {
    id: "DEMO_BOARD",
    label: "Flow Desk demo job board",
    resolveStartUrl: async () => `${await ensureFixtureServer()}/jobs`,
    allowedDomains: ["127.0.0.1"],
    defaultGoal: "Discover open roles from the demo job board and extract their full detail pages.",
    defaultStopCondition: "The listing page's job cards have all been visited, or the page/step budget is reached.",
  },
];

export function getSourceDefinition(id: string): SourceDefinition | undefined {
  return SOURCE_REGISTRY.find((s) => s.id === id);
}

export const ALL_ALLOWED_ACTIONS = READ_ONLY_ALLOWED_ACTIONS;
