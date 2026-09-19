/**
 * Small deterministic keyword-overlap helpers shared by the demo decision
 * provider, the pre-Jev evidence-gap check, and cover-letter claim
 * verification. No fuzziness, no randomness: same input always produces
 * the same output.
 */
const STOPWORDS = new Set([
  "a", "an", "the", "and", "or", "of", "to", "in", "on", "with", "for", "by",
  "at", "is", "are", "was", "were", "be", "been", "this", "that", "it", "as",
  "from", "i", "we", "you", "your", "our", "will", "would", "have", "has",
  "had", "not", "but", "so", "if", "into", "over", "under", "than",
]);

export function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9+.#]+/)
      .map((t) => t.trim())
      .filter((t) => t.length > 1 && !STOPWORDS.has(t)),
  );
}

export function overlapRatio(needle: string[], haystack: Set<string>): number {
  if (needle.length === 0) return 0;
  const matched = needle.filter((skill) => {
    const skillTokens = tokenize(skill);
    return [...skillTokens].some((t) => haystack.has(t)) || haystack.has(skill.toLowerCase().trim());
  });
  return matched.length / needle.length;
}
