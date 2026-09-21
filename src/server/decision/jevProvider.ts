import { setTimeout as delay } from "node:timers/promises";
import { z } from "zod";
import { getEnv } from "../env";
import { logger } from "../logger";
import type { DecisionProvider } from "./provider";
import {
  jevSignalsSchema,
  SCORE_RUBRIC,
  type JobEvaluationState,
  type JevSignalsOutput,
} from "./schemas";

const scoreAnswerSchema = z.object({
  type: z.literal("score"),
  score: z.number().min(0).max(4),
  confidence: z.number().min(0).max(1),
});

const noulAnswerSchema = z.object({
  type: z.literal("noul"),
  noul: z.number().min(0).max(1),
});

const choiceAnswerSchema = z.object({
  type: z.literal("choice"),
  choice: z.string().min(1),
  confidence: z.number().min(0).max(1),
});

const jevApiResponseSchema = z.object({
  answers: z.object({
    roleFitScore: scoreAnswerSchema,
    skillsFitScore: scoreAnswerSchema,
    seniorityFitScore: scoreAnswerSchema,
    strategicValueScore: scoreAnswerSchema,
    missingCriticalInfo: noulAnswerSchema,
    redFlagLikely: noulAnswerSchema,
    recommendation: choiceAnswerSchema,
    evidenceRelevance: choiceAnswerSchema,
  }),
});

export const jevQuestions = {
  roleFitScore: {
    type: "score",
    instructions: "How well does the job's role scope fit the candidate evidence and constraints?",
    criteria: [
      "No credible role fit",
      "Weak role fit",
      "Partial role fit",
      "Strong role fit",
      "Excellent role fit supported by evidence",
    ],
  },
  skillsFitScore: {
    type: "score",
    instructions: "How well do the candidate's evidenced skills match the job's required skills?",
    criteria: [
      "No evidenced skills fit",
      "Weak evidenced skills fit",
      "Partial evidenced skills fit",
      "Strong evidenced skills fit",
      "Excellent evidenced skills fit",
    ],
  },
  seniorityFitScore: {
    type: "score",
    instructions: "How well does the candidate's evidenced experience match the job seniority?",
    criteria: [
      "Clearly unsuitable seniority",
      "Weak seniority fit",
      "Partial seniority fit",
      "Strong seniority fit",
      "Excellent seniority fit",
    ],
  },
  strategicValueScore: {
    type: "score",
    instructions: "How strategically valuable is this role given the candidate evidence and constraints?",
    criteria: [
      "No strategic value",
      "Low strategic value",
      "Moderate strategic value",
      "High strategic value",
      "Exceptional strategic value",
    ],
  },
  missingCriticalInfo: {
    type: "noul",
    instructions:
      "Is critical information missing such that a confident job-fit decision would be unsafe?",
    criteria: {
      true: "Critical information is missing",
      false: "The supplied state is sufficient for a bounded fit decision",
    },
  },
  redFlagLikely: {
    type: "noul",
    instructions: "Is a material job-fit or eligibility red flag likely present in the supplied state?",
    criteria: {
      true: "A material red flag is likely",
      false: "No material red flag is evident",
    },
  },
  recommendation: {
    type: "choice",
    instructions:
      "Which bounded recommendation best follows from the supplied job and candidate evidence?",
    criteria: {
      APPLY_CANDIDATE: "Strong fit with sufficient direct or strongly adjacent evidence",
      REVIEW_REQUIRED: "Potential fit, but uncertainty or missing evidence requires human review",
      SKIP: "Insufficient fit or a material concern makes the role unsuitable",
    },
  },
  evidenceRelevance: {
    type: "choice",
    instructions: "How relevant is the supplied candidate evidence to this job?",
    criteria: {
      DIRECT: "The evidence directly demonstrates the required capability",
      STRONG_ADJACENT: "The evidence strongly transfers to the required capability",
      WEAK_ADJACENT: "The evidence is related but materially weaker than the requirement",
      NOT_RELEVANT: "The evidence does not support the requirement",
      EVIDENCE_GAP: "There is not enough candidate evidence to assess relevance safely",
    },
  },
} as const;

/**
 * Live TypeSafe/Jev provider. Sends only normalized application state to the
 * official System One endpoint and converts typed answers into Flow Desk's
 * bounded 0/25/50/75/100 decision contract.
 */
export class JevDecisionProvider implements DecisionProvider {
  readonly name = "JEV";

  async evaluate(state: JobEvaluationState): Promise<JevSignalsOutput> {
    const env = getEnv();
    if (!env.JEV_API_KEY) {
      throw new Error("JEV_API_KEY is not configured; the live Jev provider cannot run.");
    }

    const endpoint = `${env.JEV_API_URL.replace(/\/$/, "")}/v1/systemone`;
    let response: Response | undefined;

    for (let attempt = 0; attempt < 3; attempt += 1) {
      response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${env.JEV_API_KEY}`,
        },
        body: JSON.stringify({
          model: "jev-latest",
          state,
          questions: jevQuestions,
        }),
        signal: AbortSignal.timeout(30_000),
      });

      if (response.status !== 429 && response.status !== 529) break;
      if (attempt < 2) await delay(250 * 2 ** attempt);
    }

    if (!response?.ok) {
      logger.error("Jev decision request failed", { status: response?.status ?? "NO_RESPONSE" });
      throw new Error(`Jev request failed with status ${response?.status ?? "NO_RESPONSE"}`);
    }

    return mapJevApiResponse(await response.json());
  }
}

export function mapJevApiResponse(input: unknown): JevSignalsOutput {
  const { answers } = jevApiResponseSchema.parse(input);
  const confidence = Math.min(
    answers.roleFitScore.confidence,
    answers.skillsFitScore.confidence,
    answers.seniorityFitScore.confidence,
    answers.strategicValueScore.confidence,
    answers.recommendation.confidence,
    answers.evidenceRelevance.confidence,
    noulCertainty(answers.missingCriticalInfo.noul),
    noulCertainty(answers.redFlagLikely.noul),
  );

  return jevSignalsSchema.parse({
    roleFitScore: toFlowDeskScore(answers.roleFitScore.score),
    skillsFitScore: toFlowDeskScore(answers.skillsFitScore.score),
    seniorityFitScore: toFlowDeskScore(answers.seniorityFitScore.score),
    strategicValueScore: toFlowDeskScore(answers.strategicValueScore.score),
    missingCriticalInfo: answers.missingCriticalInfo.noul >= 0.5,
    redFlagLikely: answers.redFlagLikely.noul >= 0.5,
    recommendation: answers.recommendation.choice,
    confidence,
    evidenceRelevance: answers.evidenceRelevance.choice,
  });
}

function toFlowDeskScore(score: number): (typeof SCORE_RUBRIC)[number] {
  const index = Math.max(0, Math.min(SCORE_RUBRIC.length - 1, Math.round(score)));
  return SCORE_RUBRIC[index]!;
}

function noulCertainty(probability: number): number {
  return Math.abs(probability - 0.5) * 2;
}
