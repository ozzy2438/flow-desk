import type { EvidenceMatch, ProfileRecord } from "@prisma/client";
import { tokenize } from "../textMatch";

export type ClaimStatus = "SUPPORTED" | "PARTIALLY_SUPPORTED" | "AMBIGUOUS" | "UNSUPPORTED";

export type ClaimVerificationResult = {
  claimText: string;
  status: ClaimStatus;
  evidenceId: string | null;
  reason: string;
};

type MatchWithRecord = EvidenceMatch & { profileRecord: ProfileRecord };

function normalize(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * docs/evidence-matching.md claim-safety pipeline: a claim is SUPPORTED
 * only when it traces back to a safe claim already produced by evidence
 * matching (never re-derived from raw job text, which would let a model
 * launder an unverified assertion into "supported"). Partial token overlap
 * against the underlying evidence record is a weaker, explicit fallback -
 * never enough on its own to unblock Ready status.
 */
const FORBIDDEN_OVERLAP_THRESHOLD = 0.55;

/**
 * A claim policy's forbidden_claims (claim_policy.json's "must never be
 * asserted, in any wording, regardless of posting pressure") is a stronger
 * rule than anything keyword overlap or a safe-claim match can override -
 * checked before either, so a paraphrase of a forbidden claim can never
 * slip through because it happens to also overlap a legitimate safe claim.
 */
function tokenOverlapRatio(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  const shared = [...a].filter((t) => b.has(t)).length;
  return shared / Math.min(a.size, b.size);
}

function matchesForbiddenClaim(claim: string, forbiddenClaims: string[]): string | null {
  const claimTokens = tokenize(claim);
  for (const forbidden of forbiddenClaims) {
    if (!forbidden) continue;
    if (tokenOverlapRatio(claimTokens, tokenize(forbidden)) >= FORBIDDEN_OVERLAP_THRESHOLD) return forbidden;
  }
  return null;
}

export function verifyClaim(
  claim: string,
  matches: MatchWithRecord[],
  forbiddenClaims: string[] = [],
): ClaimVerificationResult {
  const claimNorm = normalize(claim);

  const perMatchForbidden = matches.flatMap((m) => m.forbiddenClaims);
  const forbiddenHit = matchesForbiddenClaim(claim, [...forbiddenClaims, ...perMatchForbidden]);
  if (forbiddenHit) {
    return {
      claimText: claim,
      status: "UNSUPPORTED",
      evidenceId: null,
      reason: `Matches a forbidden claim: "${forbiddenHit}". Never assert this regardless of wording.`,
    };
  }

  for (const match of matches) {
    const hit = match.safeClaims.find((safeClaim) => {
      const safeNorm = normalize(safeClaim);
      return safeNorm === claimNorm || claimNorm.includes(safeNorm) || safeNorm.includes(claimNorm);
    });
    if (hit) {
      return {
        claimText: claim,
        status: "SUPPORTED",
        evidenceId: match.profileRecordId,
        reason: `Matches a safe claim generated from "${match.profileRecord.title}".`,
      };
    }
  }

  const claimTokens = tokenize(claim);
  let best: { ratio: number; record: ProfileRecord } | null = null;

  for (const match of matches) {
    const data = match.profileRecord.data as Record<string, unknown>;
    const skills = Array.isArray(data.skills) ? (data.skills as string[]) : [];
    const tools = Array.isArray(data.tools) ? (data.tools as string[]) : [];
    const recordTokens = new Set<string>();
    for (const s of [...skills, ...tools]) for (const t of tokenize(s)) recordTokens.add(t);
    for (const t of tokenize(match.profileRecord.title ?? "")) recordTokens.add(t);

    const overlap = [...claimTokens].filter((t) => recordTokens.has(t)).length;
    const ratio = claimTokens.size === 0 ? 0 : overlap / claimTokens.size;
    if (!best || ratio > best.ratio) best = { ratio, record: match.profileRecord };
  }

  if (best && best.ratio >= 0.5) {
    return {
      claimText: claim,
      status: "PARTIALLY_SUPPORTED",
      evidenceId: best.record.evidenceId,
      reason: `Overlaps with "${best.record.title}" but was not produced as a verified safe claim. Keep the wording qualified.`,
    };
  }
  if (best && best.ratio > 0) {
    return {
      claimText: claim,
      status: "AMBIGUOUS",
      evidenceId: best.record.evidenceId,
      reason: `Weak overlap with "${best.record.title}" only. Needs a human read before this can be sent.`,
    };
  }

  return {
    claimText: claim,
    status: "UNSUPPORTED",
    evidenceId: null,
    reason: "No verified evidence record supports this claim. Never fabricate achievements, clients, teams or metrics.",
  };
}

export function verifyClaims(
  claims: string[],
  matches: MatchWithRecord[],
  forbiddenClaims: string[] = [],
): ClaimVerificationResult[] {
  return claims.map((claim) => verifyClaim(claim, matches, forbiddenClaims));
}
