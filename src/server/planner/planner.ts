import {
  SOURCE_REGISTRY,
  MANUAL_SOURCE_REGISTRY,
  ALL_ALLOWED_ACTIONS,
} from "../browser/sourceRegistry";
import { getEnv } from "../env";
import { discoveryFlowCandidateSchema, type DiscoveryFlowCandidate } from "./schema";
import { parsePublicAtsBoardUrl } from "../jobSources/publicAts";

/**
 * AGENCY_BRIEF.md Phase 2: turns a free-text goal into up to
 * `requestedFlowCount` DiscoveryFlow candidates. With a source registry of
 * three entries (docs/data-apis.md's own recommended rollout: start with a
 * manually configured registry before adding real per-source adapters),
 * "planning" is honest about what it actually does - it orders the
 * registry by relevance to the goal's own wording and takes the top N,
 * rather than pretending to run a semantic search it doesn't have.
 */
export async function planDiscoveryFlows(
  goal: string,
  requestedFlowCount: number,
  sourceUrls: string[] = [],
  sourceOptions: { linkedIn?: boolean; seek?: boolean } = {},
): Promise<DiscoveryFlowCandidate[]> {
  const env = getEnv();
  const lowerGoal = goal.toLowerCase();

  const configuredSources = sourceUrls.map(parsePublicAtsBoardUrl);
  const manualSources = MANUAL_SOURCE_REGISTRY.filter(
    (source) =>
      (source.id === "LINKEDIN_MANUAL" && sourceOptions.linkedIn !== false) ||
      (source.id === "SEEK_MANUAL" && sourceOptions.seek !== false),
  );
  const fallbackSources = env.APP_MODE === "live" ? [...manualSources, ...SOURCE_REGISTRY] : SOURCE_REGISTRY;
  const availableSources =
    configuredSources.length > 0
      ? [...configuredSources, ...manualSources]
      : fallbackSources;
  const ranked = [...availableSources].sort(
    (a, b) => relevance(b.id, lowerGoal) - relevance(a.id, lowerGoal),
  );
  const selected = ranked.slice(0, Math.min(requestedFlowCount, ranked.length));

  const candidates = await Promise.all(
    selected.map(async (source) => {
      const candidate = {
        source: source.id,
        title: source.label,
        startUrl: await source.resolveStartUrl(),
        goal: `${source.defaultGoal} User's research goal: "${goal}".`,
        stopCondition: source.defaultStopCondition,
        allowedDomains: source.allowedDomains,
        allowedActions: ALL_ALLOWED_ACTIONS,
        maxPages: env.BROWSER_MAX_PAGES_PER_FLOW,
        maxSteps: env.BROWSER_MAX_STEPS_PER_FLOW,
        maxDurationSeconds: env.BROWSER_MAX_DURATION_SECONDS,
      };
      return discoveryFlowCandidateSchema.parse(candidate);
    }),
  );

  return candidates;
}

function relevance(sourceId: string, lowerGoal: string): number {
  if (sourceId === "LINKEDIN_MANUAL" && /linkedin/.test(lowerGoal)) return 4;
  if (sourceId === "SEEK_MANUAL" && /seek/.test(lowerGoal)) return 4;
  if (sourceId === "LINKEDIN_MANUAL" || sourceId === "SEEK_MANUAL") return 1;
  if (sourceId === "DEMO_BOARD_REMOTE" && /remote/.test(lowerGoal)) return 2;
  if (
    sourceId === "DEMO_BOARD_CONTRACT" &&
    /(contract|fixed[- ]term|independent)/.test(lowerGoal)
  ) {
    return 2;
  }
  if (sourceId === "DEMO_BOARD_ALL") return 1;
  return 0;
}
