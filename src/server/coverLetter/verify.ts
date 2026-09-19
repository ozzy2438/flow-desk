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
export function verifyClaim(claim: string, matches: MatchWithRecord[]): ClaimVerificationResult {
  const claimNorm = normalize(claim);

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

export function verifyClaims(claims: string[], matches: MatchWithRecord[]): ClaimVerificationResult[] {
  return claims.map((claim) => verifyClaim(claim, matches));
}
