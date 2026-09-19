import { getEnv, isDemoMode } from "./env";

/**
 * Feature flags gate every external provider. Each one degrades to a safe,
 * deterministic in-process implementation when off, so the product runs
 * end-to-end without any API keys (Phase 0 "demo mode" requirement).
 */
export function getFeatureFlags() {
  const env = getEnv();
  const demo = isDemoMode();

  return {
    /** Real Playwright browser contexts vs. the local fixture-backed demo source. */
    liveBrowserWorker: !demo,
    /** Jev HTTP decision provider vs. the deterministic demo provider. */
    liveDecisionProvider: !demo && Boolean(env.JEV_API_KEY),
    /** OpenAI-backed cover-letter drafting vs. the template generator. */
    liveGenerationProvider: !demo && Boolean(env.OPENAI_API_KEY),
    /** BullMQ + Redis queue vs. the in-process queue used for demo/tests. */
    durableQueue: !demo,
    /** S3-backed screenshot storage vs. local filesystem. */
    remoteScreenshotStorage: env.SCREENSHOT_STORAGE_DRIVER === "s3",
    /** Exa/Tavily discovery-expansion adapters. Off until reviewed per-source. */
    semanticDiscovery: Boolean(env.EXA_API_KEY || env.TAVILY_API_KEY),
  } as const;
}

export type FeatureFlags = ReturnType<typeof getFeatureFlags>;
