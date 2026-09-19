import { getEnv, isDemoMode } from "./env";

/**
 * Feature flags gate every *external, paid* provider - each one degrades to
 * a safe, deterministic in-process implementation when off, so the product
 * runs end-to-end without any API keys (Phase 0 "demo mode" requirement).
 * APP_MODE=demo forces these off even if a key happens to be present, so a
 * demo run never accidentally calls out. The queue and the Playwright
 * browser worker are NOT behind a demo/live flag: they always run for
 * real, but only ever against sources in the code-owned registry, which
 * ships with exactly one entry - a local fixture job board - so there is
 * nothing unsafe about always running them live. Wiring a real third-party
 * source is an operator decision made in the source registry, not here.
 */
export function getFeatureFlags() {
  const env = getEnv();
  const demo = isDemoMode();

  return {
    /** Jev HTTP decision provider vs. the deterministic demo provider. */
    liveDecisionProvider: !demo && Boolean(env.JEV_API_KEY),
    /** OpenAI-backed cover-letter drafting vs. the template generator. */
    liveGenerationProvider: !demo && Boolean(env.OPENAI_API_KEY),
    /** S3-backed screenshot storage vs. local filesystem. */
    remoteScreenshotStorage: env.SCREENSHOT_STORAGE_DRIVER === "s3",
    /** Exa/Tavily discovery-expansion adapters. Off until reviewed per-source. */
    semanticDiscovery: Boolean(env.EXA_API_KEY || env.TAVILY_API_KEY),
  } as const;
}

export type FeatureFlags = ReturnType<typeof getFeatureFlags>;
