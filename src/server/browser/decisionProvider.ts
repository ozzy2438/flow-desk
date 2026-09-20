import { z } from "zod";
import { getEnv } from "../env";
import { getFeatureFlags } from "../flags";
import { logger } from "../logger";
import type { BrowserActionKind } from "./actions";
import type { CapturedObservation } from "./observation";

export type BrowserActionCandidate = {
  id: string;
  kind: BrowserActionKind;
  label: string;
  description: string;
  elementId?: string;
  value?: string;
};

export type BrowserActionDecision = {
  actionId: string;
  confidence: number;
  probabilities: Record<string, number>;
  provider: "JEV" | "DEMO" | "CODE";
  observationVersion: string;
};

export type ScreenshotDecision = {
  distinct: boolean;
  probability: number;
  confidence: number;
  provider: "JEV" | "DEMO" | "CODE";
};

export type ScreenshotHistoryItem = Pick<
  CapturedObservation,
  "observationVersion" | "url" | "title" | "visibleTextSummary"
> & { stepLabel: string };

export interface BrowserDecisionProvider {
  readonly name: "JEV" | "DEMO";
  chooseAction(input: {
    goal: string;
    observation: CapturedObservation;
    candidates: BrowserActionCandidate[];
    recentActions: string[];
  }): Promise<BrowserActionDecision>;
  judgeScreenshot(input: {
    goal: string;
    observation: CapturedObservation;
    stepLabel: string;
    history: ScreenshotHistoryItem[];
  }): Promise<ScreenshotDecision>;
}

const choiceAnswerSchema = z.object({
  type: z.literal("choice"),
  choice: z.string(),
  probabilities: z.record(z.number().min(0).max(1)),
  confidence: z.number().min(0).max(1),
});

const noulAnswerSchema = z.object({
  type: z.literal("noul"),
  noul: z.number().min(0).max(1),
});

const actionResponseSchema = z.object({
  answers: z.object({ nextAction: choiceAnswerSchema }),
});

const screenshotResponseSchema = z.object({
  answers: z.object({ keepScreenshot: noulAnswerSchema }),
});

export class DemoBrowserDecisionProvider implements BrowserDecisionProvider {
  readonly name = "DEMO" as const;

  async chooseAction(input: {
    goal: string;
    observation: CapturedObservation;
    candidates: BrowserActionCandidate[];
    recentActions: string[];
  }): Promise<BrowserActionDecision> {
    const chosen = input.candidates[0];
    if (!chosen) throw new Error("The browser controller produced no safe action candidates.");
    return {
      actionId: chosen.id,
      confidence: 1,
      probabilities: Object.fromEntries(
        input.candidates.map((candidate) => [candidate.id, candidate.id === chosen.id ? 1 : 0]),
      ),
      provider: "DEMO",
      observationVersion: input.observation.observationVersion,
    };
  }

  async judgeScreenshot(input: {
    goal: string;
    observation: CapturedObservation;
    stepLabel: string;
    history: ScreenshotHistoryItem[];
  }): Promise<ScreenshotDecision> {
    const distinct = !input.history.some(
      (item) => item.observationVersion === input.observation.observationVersion,
    );
    return { distinct, probability: distinct ? 1 : 0, confidence: 1, provider: "DEMO" };
  }
}

export class JevBrowserDecisionProvider implements BrowserDecisionProvider {
  readonly name = "JEV" as const;

  async chooseAction(input: {
    goal: string;
    observation: CapturedObservation;
    candidates: BrowserActionCandidate[];
    recentActions: string[];
  }): Promise<BrowserActionDecision> {
    if (input.candidates.length === 0) {
      throw new Error("The browser controller produced no safe action candidates.");
    }
    if (input.candidates.length === 1) {
      return {
        actionId: input.candidates[0]!.id,
        confidence: 1,
        probabilities: { [input.candidates[0]!.id]: 1 },
        provider: "CODE",
        observationVersion: input.observation.observationVersion,
      };
    }

    const criteria = Object.fromEntries(
      input.candidates.map((candidate) => [
        candidate.id,
        {
          action: candidate.kind,
          label: candidate.label,
          when_to_choose: candidate.description,
        },
      ]),
    );
    const payload = await postSystemOne({
      state: {
        goal: input.goal,
        page: observationState(input.observation),
        recent_actions: input.recentActions.slice(-6),
        safety_boundary:
          "Choose exactly one code-owned read-only action. Do not infer another URL, selector, command, login, submission, message, upload, or CAPTCHA action.",
      },
      questions: {
        nextAction: {
          type: "choice",
          instructions:
            "Which available read-only action most directly advances the browser toward the stated goal from the current page?",
          criteria,
        },
      },
    });
    const answer = actionResponseSchema.parse(payload).answers.nextAction;
    if (!input.candidates.some((candidate) => candidate.id === answer.choice)) {
      throw new Error("Jev returned an action outside the code-owned candidate set.");
    }
    return {
      actionId: answer.choice,
      confidence: answer.confidence,
      probabilities: answer.probabilities,
      provider: "JEV",
      observationVersion: input.observation.observationVersion,
    };
  }

  async judgeScreenshot(input: {
    goal: string;
    observation: CapturedObservation;
    stepLabel: string;
    history: ScreenshotHistoryItem[];
  }): Promise<ScreenshotDecision> {
    if (input.history.length === 0) {
      return { distinct: true, probability: 1, confidence: 1, provider: "CODE" };
    }
    const payload = await postSystemOne({
      state: {
        goal: input.goal,
        proposed_step: input.stepLabel,
        current_page: observationState(input.observation),
        already_kept_steps: input.history.slice(-8).map((item) => ({
          step: item.stepLabel,
          url: item.url,
          title: item.title,
          visible_text: compactText(item.visibleTextSummary),
        })),
      },
      questions: {
        keepScreenshot: {
          type: "noul",
          instructions:
            "Would this page add a distinct, useful step to a visual browser-flow timeline instead of repeating an already kept state?",
          criteria: {
            true: "A meaningfully new page, result state, detail, error, blocker, or completed goal",
            false: "A duplicate, cosmetic change, loading frame, or state already represented",
          },
        },
      },
    });
    const probability = screenshotResponseSchema.parse(payload).answers.keepScreenshot.noul;
    return {
      distinct: probability >= 0.55,
      probability,
      confidence: Math.abs(probability - 0.5) * 2,
      provider: "JEV",
    };
  }
}

export function getBrowserDecisionProvider(): BrowserDecisionProvider {
  const env = getEnv();
  if (env.NODE_ENV !== "test" && getFeatureFlags().liveDecisionProvider) {
    return new JevBrowserDecisionProvider();
  }
  return new DemoBrowserDecisionProvider();
}

function observationState(observation: CapturedObservation) {
  return {
    observation_version: observation.observationVersion,
    url: observation.url,
    title: observation.title,
    visible_text: compactText(observation.visibleTextSummary),
    interactive_elements: observation.elements.slice(0, 60).map((element) => ({
      id: element.id,
      role: element.role,
      name: element.name,
      value: element.value,
      enabled: element.enabled,
      supported_actions: element.supportedActions,
      risk: element.risk,
    })),
  };
}

function compactText(value: string): string {
  return value.replace(/\s+/g, " ").trim().slice(0, 1800);
}

async function postSystemOne(body: { state: unknown; questions: Record<string, unknown> }) {
  const env = getEnv();
  if (!env.JEV_API_KEY) throw new Error("JEV_API_KEY is not configured.");
  const endpoint = `${env.JEV_API_URL.replace(/\/$/, "")}/v1/systemone`;
  let response: Response | undefined;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.JEV_API_KEY}`,
      },
      body: JSON.stringify({ model: "jev-latest", ...body }),
      signal: AbortSignal.timeout(30_000),
    });
    if (response.status !== 429 && response.status !== 529) break;
    if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 250 * 2 ** attempt));
  }

  if (!response?.ok) {
    logger.error("Jev browser decision request failed", { status: response?.status ?? "NO_RESPONSE" });
    throw new Error(`Jev browser decision request failed with status ${response?.status ?? "NO_RESPONSE"}`);
  }
  return response.json();
}
