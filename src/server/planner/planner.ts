import {
  SOURCE_REGISTRY,
  MANUAL_SOURCE_REGISTRY,
  ALL_ALLOWED_ACTIONS,
} from "../browser/sourceRegistry";
import { getEnv } from "../env";
import { discoveryFlowCandidateSchema, type DiscoveryFlowCandidate } from "./schema";
import { parsePublicAtsBoardUrl } from "../jobSources/publicAts";
import type { SourceDefinition } from "../browser/sourceRegistry";

const RESEARCH_ANGLES = [
  { label: "Direct results", prompt: "Find the strongest direct results for the request." },
  { label: "Alternatives", prompt: "Look for credible alternatives and adjacent results." },
  { label: "Requirements", prompt: "Inspect the most important requirements and constraints." },
  { label: "Recency", prompt: "Prioritize current, still-available information." },
  { label: "Location", prompt: "Check location and access constraints carefully." },
  { label: "Comparison", prompt: "Capture information that helps compare the strongest results." },
  { label: "Risks", prompt: "Look for blockers, uncertainty, or missing information." },
  { label: "Evidence", prompt: "Capture the clearest supporting evidence from the source." },
  { label: "Availability", prompt: "Verify that the result remains available at research time." },
  { label: "Summary", prompt: "Find one final result that improves the overall research picture." },
] as const;

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
  const automaticSources = configuredSources.length > 0 ? configuredSources : SOURCE_REGISTRY;
  const availableSources = [...manualSources, ...automaticSources];
  const ranked = [...availableSources].sort(
    (a, b) => relevance(b.id, lowerGoal) - relevance(a.id, lowerGoal),
  );
  const selected = expandToRequestedCount(ranked, automaticSources, requestedFlowCount);

  const candidates = await Promise.all(
    selected.map(async ({ source, angle }) => {
      const repeated = selected.filter((item) => item.source.id === source.id).length > 1;
      const candidate = {
        source: source.id,
        title: (repeated ? `${source.label} · ${angle.label}` : source.label).slice(0, 120),
        startUrl: await source.resolveStartUrl(),
        goal: `${source.defaultGoal} ${angle.prompt} User request: "${compact(goal, 260)}".`.slice(0, 500),
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

function expandToRequestedCount(
  rankedSources: SourceDefinition[],
  automaticSources: SourceDefinition[],
  requestedFlowCount: number,
) {
  const selected = rankedSources.slice(0, requestedFlowCount).map((source, index) => ({
    source,
    angle: RESEARCH_ANGLES[index % RESEARCH_ANGLES.length]!,
  }));
  const repeatPool = automaticSources.length > 0 ? automaticSources : rankedSources;
  let repeatIndex = 0;

  while (selected.length < requestedFlowCount && repeatPool.length > 0) {
    selected.push({
      source: repeatPool[repeatIndex % repeatPool.length]!,
      angle: RESEARCH_ANGLES[selected.length % RESEARCH_ANGLES.length]!,
    });
    repeatIndex += 1;
  }

  return selected;
}

function compact(value: string, maxLength: number): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 1).trim()}…` : normalized;
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
