/**
 * A small, code-owned keyword list - not a model call - that turns the
 * user's free-text goal into a term the worker can actually type into the
 * job board's search box. This is what turns the flow from "just navigate
 * to a URL" into a real TYPE_TEXT + CLICK interaction: docs/browser-worker.md's
 * action allowlist includes both, but nothing previously exercised them.
 * Returns null when nothing in the goal matches a known role family, so the
 * worker can skip the search step rather than typing something meaningless.
 */
const ROLE_KEYWORDS = [
  "data scientist",
  "data engineer",
  "analytics engineer",
  "data analyst",
  "applied ai",
  "ai engineer",
  "machine learning",
  "frontend",
  "front-end",
  "automation",
  "business development",
  "java",
  "backend",
  "back-end",
  "full-stack",
  "full stack",
];

export function deriveSearchTerm(goalText: string): string | null {
  return deriveSearchTerms(goalText)[0] ?? null;
}

export function deriveSearchTerms(goalText: string): string[] {
  const lower = goalText.toLowerCase();
  return ROLE_KEYWORDS.filter((keyword) => lower.includes(keyword));
}
