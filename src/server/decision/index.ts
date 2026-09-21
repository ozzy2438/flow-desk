import { getFeatureFlags } from "../flags";
import type { DecisionProvider } from "./provider";
import { DemoDecisionProvider } from "./demoProvider";
import { JevDecisionProvider } from "./jevProvider";

let cached: DecisionProvider | undefined;

export function getDecisionProvider(): DecisionProvider {
  if (cached) return cached;
  const flags = getFeatureFlags();
  cached = flags.liveDecisionProvider ? new JevDecisionProvider() : new DemoDecisionProvider();
  return cached;
}

export * from "./provider";
export * from "./schemas";
