import type { DecisionProvider } from "./provider";
import { jevSignalsSchema, type JobEvaluationState, type JevSignalsOutput } from "./schemas";
import { tokenize, overlapRatio } from "../textMatch";

const RED_FLAG_KEYWORDS = [
  "unpaid",
  "equity only",
  "no salary",
  "commission only",
  "urgent hire",
  "immediate start required",
  "must relocate immediately",
];

const SCORE_RUBRIC = [0, 25, 50, 75, 100] as const;

function nearestRubricScore(value: number): (typeof SCORE_RUBRIC)[number] {
  return SCORE_RUBRIC.reduce((closest, candidate) =>
    Math.abs(candidate - value) < Math.abs(closest - value) ? candidate : closest,
  );
}

/**
 * A deterministic, keyword-overlap heuristic standing in for Jev. It is
 * intentionally simple and fully reproducible (same input -> same output)
 * so the UI, policy engine and tests all work with zero API keys -
 * docs/jev-integration.md: "A deterministic demo provider must return the
 * same shape as the Jev provider so UI, policy and tests work without an
 * API key."
 */
export class DemoDecisionProvider implements DecisionProvider {
  readonly name = "DEMO_DETERMINISTIC";

  async evaluate(state: JobEvaluationState): Promise<JevSignalsOutput> {
    const candidateTokens = new Set<string>();
    let maxYearsExperience = 0;
    for (const evidence of state.evidenceCandidates) {
      for (const skill of [...evidence.skills, ...evidence.tools]) {
        for (const token of tokenize(skill)) candidateTokens.add(token);
      }
      for (const token of tokenize(evidence.title)) candidateTokens.add(token);
      if (evidence.yearsExperience) maxYearsExperience = Math.max(maxYearsExperience, evidence.yearsExperience);
    }

    const requiredRatio = overlapRatio(state.job.requiredSkills, candidateTokens);
    const preferredRatio = overlapRatio(state.job.preferredSkills, candidateTokens);
    const titleTokens = [...tokenize(state.job.title)];
    const titleRatio =
      titleTokens.length === 0
        ? 0
        : titleTokens.filter((t) => candidateTokens.has(t)).length / titleTokens.length;
    const descriptionOverlap = overlapRatio([...tokenize(state.job.descriptionRaw)], candidateTokens);

    const skillsFitRaw =
      state.job.requiredSkills.length > 0
        ? requiredRatio * 70 + preferredRatio * 30
        : descriptionOverlap * 100;
    const roleFitRaw = titleRatio * 60 + descriptionOverlap * 40;

    let seniorityFitRaw = 50;
    if (state.job.seniority !== "UNKNOWN") {
      const bands: Record<string, [number, number]> = {
        ENTRY: [0, 2],
        MID: [2, 4],
        SENIOR: [4, 8],
        LEAD: [7, 100],
      };
      const [low, high] = bands[state.job.seniority] ?? [0, 100];
      seniorityFitRaw = maxYearsExperience >= low && maxYearsExperience <= high ? 90 : 40;
    }

    const strategicValueRaw = roleFitRaw * 0.5 + skillsFitRaw * 0.5;

    const filledKeyFields = [
      state.job.workplaceType !== "UNKNOWN",
      state.job.employmentType !== "UNKNOWN",
      state.job.seniority !== "UNKNOWN",
      state.job.requiredSkills.length > 0,
      state.job.descriptionRaw.length > 60,
    ].filter(Boolean).length;
    const missingCriticalInfo = filledKeyFields < 2;
    const confidence = Math.max(0.3, Math.min(0.95, 0.35 + filledKeyFields * 0.13));

    const descriptionLower = state.job.descriptionRaw.toLowerCase();
    const redFlagLikely = RED_FLAG_KEYWORDS.some((kw) => descriptionLower.includes(kw));

    const evidenceRelevance: JevSignalsOutput["evidenceRelevance"] =
      state.job.requiredSkills.length === 0
        ? descriptionOverlap >= 0.3
          ? "WEAK_ADJACENT"
          : "NOT_RELEVANT"
        : requiredRatio >= 0.6
          ? "DIRECT"
          : requiredRatio >= 0.3
            ? "STRONG_ADJACENT"
            : requiredRatio > 0
              ? "WEAK_ADJACENT"
              : "EVIDENCE_GAP";

    const averageScore = (roleFitRaw + skillsFitRaw + seniorityFitRaw) / 3;
    let recommendation: JevSignalsOutput["recommendation"] = "REVIEW_REQUIRED";
    if (!redFlagLikely && !missingCriticalInfo && averageScore >= 65 && evidenceRelevance !== "EVIDENCE_GAP") {
      recommendation = "APPLY_CANDIDATE";
    } else if (averageScore < 25 && evidenceRelevance === "EVIDENCE_GAP") {
      recommendation = "SKIP";
    }

    const result: JevSignalsOutput = {
      roleFitScore: nearestRubricScore(roleFitRaw),
      skillsFitScore: nearestRubricScore(skillsFitRaw),
      seniorityFitScore: nearestRubricScore(seniorityFitRaw),
      strategicValueScore: nearestRubricScore(strategicValueRaw),
      missingCriticalInfo,
      redFlagLikely,
      recommendation,
      confidence: Math.round(confidence * 100) / 100,
      evidenceRelevance,
    };

    return jevSignalsSchema.parse(result);
  }
}
