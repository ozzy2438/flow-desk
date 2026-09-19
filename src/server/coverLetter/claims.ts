const CLAIM_VERBS = [
  "built",
  "delivered",
  "reduced",
  "increased",
  "led",
  "developed",
  "designed",
  "implemented",
  "shipped",
  "automated",
  "cut",
  "improved",
  "grew",
  "managed",
  "launched",
  "migrated",
  "owned",
  "supports",
];

/**
 * Splits a draft into sentences and keeps only the ones that assert
 * something checkable (an achievement verb or a number). Boilerplate
 * ("Dear Hiring Manager,") never needs evidence and is left unverified
 * rather than flagged.
 */
export function extractClaims(draftText: string): string[] {
  const sentences = draftText
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);

  return sentences.filter((sentence) => {
    const lower = sentence.toLowerCase();
    return CLAIM_VERBS.some((verb) => lower.includes(verb)) || /\d/.test(sentence);
  });
}
