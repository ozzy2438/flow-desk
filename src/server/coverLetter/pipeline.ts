import { db } from "../db";
import { getFeatureFlags } from "../flags";
import { TemplateGenerationProvider } from "./generate";
import { OpenAiGenerationProvider } from "./openaiProvider";
import { extractClaims } from "./claims";
import { verifyClaims } from "./verify";

export class JobNotFoundError extends Error {
  constructor() {
    super("Job not found.");
    this.name = "JobNotFoundError";
  }
}

export class NoEvidenceMatchesError extends Error {
  constructor() {
    super("No evidence matches for this job yet; nothing to ground a draft in.");
    this.name = "NoEvidenceMatchesError";
  }
}

/**
 * docs/evidence-matching.md claim-safety pipeline, in full: draft -> extract
 * atomic claims -> verify each against evidence -> block Ready if anything
 * is unsupported. Runs regardless of which GenerationProvider produced the
 * draft, because the draft is never trusted on its own.
 */
export async function generateAndVerifyCoverLetter(jobId: string) {
  const job = await db.jobPosting.findUnique({
    where: { id: jobId },
    include: { evidenceMatches: { include: { profileRecord: true } } },
  });
  if (!job) throw new JobNotFoundError();
  if (job.evidenceMatches.length === 0) throw new NoEvidenceMatchesError();

  const profileImport = await db.candidateProfileImport.findFirst({
    where: { records: { some: { evidenceMatches: { some: { jobId } } } } },
  });
  const constraints = profileImport
    ? (
        await db.profileRecord.findMany({
          where: { importId: profileImport.id, kind: { in: ["CONSTRAINT", "FACT"] } },
        })
      )
        .map((r) => {
          const data = r.data as Record<string, unknown>;
          return typeof data.summary === "string" && data.summary ? data.summary : (r.title ?? "");
        })
        .filter(Boolean)
    : [];

  const flags = getFeatureFlags();
  const provider = flags.liveGenerationProvider
    ? new OpenAiGenerationProvider()
    : new TemplateGenerationProvider();

  const draftText = await provider.draft(job, job.evidenceMatches, constraints);
  const claims = extractClaims(draftText);
  const verifications = verifyClaims(claims, job.evidenceMatches);

  const hasUnsupported = verifications.some((v) => v.status === "UNSUPPORTED");
  const hasUncertain = verifications.some(
    (v) => v.status === "AMBIGUOUS" || v.status === "PARTIALLY_SUPPORTED",
  );
  const status = hasUnsupported ? "BLOCKED" : hasUncertain ? "DRAFT" : "READY";

  return db.coverLetterDraft.create({
    data: {
      jobId,
      provider: provider.name,
      draftText,
      status,
      claims: {
        create: verifications.map((v) => ({
          claimText: v.claimText,
          status: v.status,
          evidenceId: v.evidenceId,
          reason: v.reason,
        })),
      },
    },
    include: { claims: true },
  });
}
