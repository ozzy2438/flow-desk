import type { EvidenceMatch, ProfileRecord, JobPosting } from "@prisma/client";

type MatchWithRecord = EvidenceMatch & { profileRecord: ProfileRecord };

export interface GenerationProvider {
  readonly name: string;
  draft(job: JobPosting, matches: MatchWithRecord[], constraints: string[]): Promise<string>;
}

/**
 * The default, zero-API-key generator. It only ever emits the job's own
 * title/company and safe claims that evidence matching already produced -
 * it cannot introduce a new fact because it has no source of facts beyond
 * those two inputs. This is what makes the claim verifier mostly see
 * SUPPORTED claims by construction; the live provider below is the one
 * that actually needs the verifier's blocking behavior.
 */
export class TemplateGenerationProvider implements GenerationProvider {
  readonly name = "TEMPLATE";

  async draft(job: JobPosting, matches: MatchWithRecord[], _constraints: string[]): Promise<string> {
    const strongMatches = matches.filter(
      (m) => m.category === "DIRECT" || m.category === "STRONG_ADJACENT",
    );
    const claims = strongMatches.flatMap((m) => m.safeClaims).slice(0, 6);
    const uniqueClaims = [...new Set(claims)];

    const lines = [
      "Dear Hiring Manager,",
      "",
      `I am writing to express interest in the ${job.title} role${job.company ? ` at ${job.company}` : ""}.`,
      "",
      ...uniqueClaims,
      "",
      "I would welcome the chance to discuss how this experience applies to your team.",
      "",
      "Regards,",
    ];

    return lines.join("\n");
  }
}
