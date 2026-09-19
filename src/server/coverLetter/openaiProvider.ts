import type { EvidenceMatch, ProfileRecord, JobPosting } from "@prisma/client";
import { getEnv } from "../env";
import type { GenerationProvider } from "./generate";

type MatchWithRecord = EvidenceMatch & { profileRecord: ProfileRecord };

/**
 * The live drafting provider. This is exactly why the claim-verification
 * pipeline exists: an LLM can phrase something that sounds supported but
 * isn't, so its output is treated as no more trustworthy than any other
 * draft - every sentence still goes through `verifyClaim` before Ready can
 * be reached, and this provider is never given final authority.
 */
export class OpenAiGenerationProvider implements GenerationProvider {
  readonly name = "OPENAI";

  async draft(job: JobPosting, matches: MatchWithRecord[], constraints: string[]): Promise<string> {
    const env = getEnv();
    if (!env.OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY is not configured; the live generation provider cannot run.");
    }

    const safeClaims = matches.flatMap((m) => m.safeClaims);
    const system = [
      "You draft short, professional cover letters.",
      "You may ONLY state facts that appear verbatim or near-verbatim in the provided verified evidence list.",
      "Never invent achievements, clients, teams, metrics, dates or tools.",
      "If the evidence is thin, write a shorter letter rather than adding unsupported detail.",
    ].join(" ");

    const user = JSON.stringify({
      jobTitle: job.title,
      company: job.company,
      verifiedEvidence: safeClaims,
      candidateConstraints: constraints,
    });

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI request failed with status ${response.status}`);
    }

    const json = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const text = json.choices?.[0]?.message?.content;
    if (!text) throw new Error("OpenAI response did not include draft text.");
    return text;
  }
}
