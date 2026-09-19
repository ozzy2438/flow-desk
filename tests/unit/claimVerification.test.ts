import { describe, expect, it } from "vitest";
import { verifyClaim } from "@/server/coverLetter/verify";
import { extractClaims } from "@/server/coverLetter/claims";
import type { EvidenceMatch, ProfileRecord } from "@prisma/client";

type MatchWithRecord = EvidenceMatch & { profileRecord: ProfileRecord };

function match(overrides: Partial<MatchWithRecord> & { profileRecord?: Partial<ProfileRecord> }): MatchWithRecord {
  const profileRecord = {
    id: "rec-1",
    importId: "import-1",
    rowIndex: 0,
    evidenceId: "proj-001",
    kind: "PROJECT",
    title: "Customer 360 identity resolution platform",
    data: { skills: ["python", "data engineering"], tools: ["BigQuery"] },
    rawRow: {},
    ...overrides.profileRecord,
  } as ProfileRecord;

  return {
    id: "match-1",
    jobId: "job-1",
    profileRecordId: profileRecord.id,
    category: "DIRECT",
    supportedRequirements: ["python"],
    unsupportedRequirements: [],
    safeClaims: ['"Customer 360 identity resolution platform" supports the required skill "python".'],
    forbiddenClaims: [],
    confidence: 0.9,
    createdAt: new Date(),
    ...overrides,
    profileRecord,
  } as MatchWithRecord;
}

describe("verifyClaim (cover-letter claim safety)", () => {
  it("marks a claim SUPPORTED when it traces back to a safe claim from evidence matching", () => {
    const result = verifyClaim(
      '"Customer 360 identity resolution platform" supports the required skill "python".',
      [match({})],
    );
    expect(result.status).toBe("SUPPORTED");
    expect(result.evidenceId).toBe("rec-1");
  });

  it("marks a fabricated claim UNSUPPORTED, never SUPPORTED, regardless of source", () => {
    const result = verifyClaim(
      "I led a team of 50 engineers and increased revenue by 400% at Google.",
      [match({})],
    );
    expect(result.status).toBe("UNSUPPORTED");
    expect(result.evidenceId).toBeNull();
  });

  it("never upgrades a claim to SUPPORTED purely from keyword overlap", () => {
    // Shares tokens ("data", "platform") with the evidence record's title but was never
    // produced as one of its safe claims - must not silently count as verified.
    const result = verifyClaim(
      "I personally built the entire data platform from scratch in one weekend.",
      [match({})],
    );
    expect(result.status).not.toBe("SUPPORTED");
  });

  it("returns PARTIALLY_SUPPORTED for strong but not-safe-claim overlap", () => {
    const result = verifyClaim("I have deep python and data engineering experience.", [match({})]);
    expect(["PARTIALLY_SUPPORTED", "AMBIGUOUS"]).toContain(result.status);
  });
});

describe("extractClaims", () => {
  it("keeps fact-bearing sentences and drops boilerplate", () => {
    const claims = extractClaims(
      "Dear Hiring Manager,\n\nI reduced pipeline failures by 90%.\n\nRegards,",
    );
    expect(claims).toContain("I reduced pipeline failures by 90%.");
    expect(claims.some((c) => c.includes("Dear Hiring Manager"))).toBe(false);
    expect(claims.some((c) => c.includes("Regards"))).toBe(false);
  });
});
