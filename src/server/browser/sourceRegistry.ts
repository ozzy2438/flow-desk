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
 * three entries, all served by the same local fixture job board with
 * different role filters - not three real external sites - so
 * `pnpm dev` can run Milestone 7's parallel-flow proof of concept (several
 * real, isolated Playwright contexts navigating at once) with zero
 * external risk. Wiring a real source (SEEK, LinkedIn, Indeed, Jora) is a
 * deliberate, reviewed follow-up, not a default this build makes.
 */
export const SOURCE_REGISTRY: SourceDefinition[] = [
  {
    id: "DEMO_BOARD_ALL",
    label: "Demo board — all roles",
    resolveStartUrl: async () => `${await ensureFixtureServer()}/jobs?filter=all`,
    allowedDomains: ["127.0.0.1"],
    defaultGoal: "Discover open roles from the demo job board and extract their full detail pages.",
    defaultStopCondition: "The listing page's job cards have all been visited, or the page/step budget is reached.",
  },
  {
    id: "DEMO_BOARD_REMOTE",
    label: "Demo board — remote only",
    resolveStartUrl: async () => `${await ensureFixtureServer()}/jobs?filter=remote`,
    allowedDomains: ["127.0.0.1"],
    defaultGoal: "Discover remote-only roles from the demo job board and extract their full detail pages.",
    defaultStopCondition: "The listing page's job cards have all been visited, or the page/step budget is reached.",
  },
  {
    id: "DEMO_BOARD_CONTRACT",
    label: "Demo board — contract & fixed-term",
    resolveStartUrl: async () => `${await ensureFixtureServer()}/jobs?filter=contract`,
    allowedDomains: ["127.0.0.1"],
    defaultGoal:
      "Discover contract and fixed-term roles from the demo job board and extract their full detail pages.",
    defaultStopCondition: "The listing page's job cards have all been visited, or the page/step budget is reached.",
  },
];

export function getSourceDefinition(id: string): SourceDefinition | undefined {
  return SOURCE_REGISTRY.find((s) => s.id === id);
}

export const ALL_ALLOWED_ACTIONS = READ_ONLY_ALLOWED_ACTIONS;
export const ALLOWED_DOMAINS = ["127.0.0.1"];
