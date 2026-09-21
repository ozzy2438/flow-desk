import { describe, expect, it } from "vitest";
import { jevQuestions, mapJevApiResponse } from "../../src/server/decision/jevProvider";

describe("Jev provider contract", () => {
  it("defines a TypeSafe question map using Score, Noul and Choice", () => {
    expect(jevQuestions.roleFitScore.type).toBe("score");
    expect(jevQuestions.missingCriticalInfo.type).toBe("noul");
    expect(jevQuestions.recommendation.type).toBe("choice");
  });

  it("maps official typed answers into Flow Desk's bounded signal contract", () => {
    expect(
      mapJevApiResponse({
        model: "jev-1.13.0",
        answers: {
          roleFitScore: { type: "score", score: 3.6, confidence: 0.91 },
          skillsFitScore: { type: "score", score: 2.2, confidence: 0.82 },
          seniorityFitScore: { type: "score", score: 3.0, confidence: 0.8 },
          strategicValueScore: { type: "score", score: 1.4, confidence: 0.79 },
          missingCriticalInfo: { type: "noul", noul: 0.2 },
          redFlagLikely: { type: "noul", noul: 0.1 },
          recommendation: {
            type: "choice",
            choice: "APPLY_CANDIDATE",
            confidence: 0.88,
          },
          evidenceRelevance: { type: "choice", choice: "DIRECT", confidence: 0.84 },
        },
        usage: { input_tokens: 100, output_tokens: 20 },
      }),
    ).toEqual({
      roleFitScore: 100,
      skillsFitScore: 50,
      seniorityFitScore: 75,
      strategicValueScore: 25,
      missingCriticalInfo: false,
      redFlagLikely: false,
      recommendation: "APPLY_CANDIDATE",
      confidence: 0.6,
      evidenceRelevance: "DIRECT",
    });
  });

  it("rejects an answer outside Flow Desk's controlled choices", () => {
    expect(() =>
      mapJevApiResponse({
        answers: {
          roleFitScore: { type: "score", score: 2, confidence: 1 },
          skillsFitScore: { type: "score", score: 2, confidence: 1 },
          seniorityFitScore: { type: "score", score: 2, confidence: 1 },
          strategicValueScore: { type: "score", score: 2, confidence: 1 },
          missingCriticalInfo: { type: "noul", noul: 0 },
          redFlagLikely: { type: "noul", noul: 0 },
          recommendation: { type: "choice", choice: "AUTO_APPLY", confidence: 1 },
          evidenceRelevance: { type: "choice", choice: "DIRECT", confidence: 1 },
        },
      }),
    ).toThrow();
  });
});
