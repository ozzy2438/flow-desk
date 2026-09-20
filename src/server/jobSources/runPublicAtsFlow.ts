import type { DiscoveryFlow } from "@prisma/client";
import { ZodError } from "zod";
import { db } from "../db";
import { normalizeJobInput } from "../jobs/normalize";
import { evaluateAndPersistJob } from "../jobs/evaluate";
import { JobSourceFetchError } from "../jobs/urlImport";
import { logger } from "../logger";
import { syncResearchRunStatus } from "../researchRuns/syncStatus";
import { applyDiscoveryEligibility, discoverPublicAtsJobs } from "./publicAts";
import type { RawJobInput } from "../jobs/types";
import {
  DemoBrowserDecisionProvider,
  type BrowserActionCandidate,
  type BrowserDecisionProvider,
} from "../browser/decisionProvider";
import type { CapturedObservation } from "../browser/observation";

class PublicAtsFlowCancelledError extends Error {}

export async function runPublicAtsFlow(
  flow: DiscoveryFlow,
  userId: string,
  fetchImpl: typeof fetch = fetch,
  visual?: {
    provider: BrowserDecisionProvider;
    openJob: (job: RawJobInput, actionLabel: string) => Promise<void>;
  },
): Promise<void> {
  const deadline = Date.now() + flow.maxDurationSeconds * 1000;

  try {
    await db.discoveryFlow.update({
      where: { id: flow.id },
      data: { status: "OPEN_PAGE", startedAt: new Date() },
    });
    await emit(flow.id, "OPEN_PAGE", "Opening the official public ATS read endpoint");
    await syncResearchRunStatus(flow.researchRunId);

    if (await isCancelled(flow.id)) throw new PublicAtsFlowCancelledError();

    await db.discoveryFlow.update({ where: { id: flow.id }, data: { status: "SEARCHING" } });
    await emit(flow.id, "SEARCHING", "Filtering currently published jobs against the research goal");
    const jobs = await discoverPublicAtsJobs(
      flow.startUrl,
      flow.goal,
      Math.max(1, Math.min(flow.maxSteps - 1, 20)),
      fetchImpl,
    );
    await db.discoveryFlow.update({
      where: { id: flow.id },
      data: { jobsDiscovered: jobs.length },
    });
    await emit(
      flow.id,
      "SEARCHING",
      `Found ${jobs.length} matching jobs in the source's currently published public feed`,
    );

    const eligibleJobs: RawJobInput[] = [];
    for (const discovered of jobs) {
      const eligibility = applyDiscoveryEligibility(discovered, flow.goal);
      if (!eligibility.eligible) {
        await emit(flow.id, "SOURCE_FILTERED", `Filtered "${discovered.title}": ${eligibility.reason}`);
      } else {
        eligibleJobs.push(eligibility.job);
      }
    }
    const remaining = [...eligibleJobs];

    while (remaining.length > 0) {
      if (await isCancelled(flow.id)) throw new PublicAtsFlowCancelledError();
      if (Date.now() > deadline) {
        await emit(flow.id, "STOP", "Duration budget reached");
        break;
      }

      const raw = visual
        ? await chooseNextVisualJob(flow, remaining, visual.provider)
        : remaining[0];
      if (!raw) break;
      remaining.splice(remaining.indexOf(raw), 1);

      if (visual) {
        await visual.openJob(raw, `Open ${raw.title}`);
      }

      await db.discoveryFlow.update({
        where: { id: flow.id },
        data: { status: "EXTRACTING" },
      });
      const candidate = await db.extractedJobCandidate.create({
        data: {
          flowId: flow.id,
          rawPayload: {
            ...raw,
            verification: {
              method: "OFFICIAL_PUBLIC_ATS_API",
              retrievedAt: raw.sourceRetrievedAt,
              openStatus: raw.sourceOpenStatus,
              postedAtBasis: raw.postedAtBasis,
            },
          },
          confidence: raw.extractionConfidence,
        },
      });
      await emit(flow.id, "EXTRACT_JOB", `Extracted "${raw.title}" from the official public API`, {
        candidateId: candidate.id,
      });

      await db.discoveryFlow.update({
        where: { id: flow.id },
        data: { status: "EVALUATING" },
      });
      const { job } = await evaluateAndPersistJob(
        normalizeJobInput(raw),
        userId,
        candidate.id,
      );
      await emit(flow.id, "EVALUATING", `${job.title} -> ${job.evaluation?.decision}`, {
        jobId: job.id,
        decision: job.evaluation?.decision,
      });
      await db.discoveryFlow.update({
        where: { id: flow.id },
        data: {
          jobsNormalized: { increment: 1 },
          ...(job.evaluation?.decision === "APPLY_CANDIDATE" && {
            jobsApplyCandidate: { increment: 1 },
          }),
          ...(job.evaluation?.decision === "REVIEW_REQUIRED" && {
            jobsReviewRequired: { increment: 1 },
          }),
          ...(job.evaluation?.decision === "SKIP" && { jobsSkipped: { increment: 1 } }),
        },
      });
    }

    await emit(flow.id, "STOP", "Published public feed exhausted");
    await db.discoveryFlow.update({
      where: { id: flow.id },
      data: { status: "COMPLETE", finishedAt: new Date() },
    });
  } catch (error) {
    if (error instanceof PublicAtsFlowCancelledError) {
      await emit(flow.id, "CANCELLED", "Cancelled by user");
      await db.discoveryFlow.update({
        where: { id: flow.id },
        data: { status: "CANCELLED", finishedAt: new Date() },
      });
    } else {
      logger.error("Public ATS flow failed", {
        flowId: flow.id,
        error: error instanceof Error ? error.message : String(error),
      });
      await emit(flow.id, "FAILED", error instanceof Error ? error.message : "Unknown error");
      await db.discoveryFlow.update({
        where: { id: flow.id },
        data: {
          status: "FAILED",
          failureCategory: categorize(error),
          finishedAt: new Date(),
        },
      });
    }
  } finally {
    await syncResearchRunStatus(flow.researchRunId);
  }
}

async function chooseNextVisualJob(
  flow: DiscoveryFlow,
  remaining: RawJobInput[],
  provider: BrowserDecisionProvider,
): Promise<RawJobInput | undefined> {
  const candidates: BrowserActionCandidate[] = remaining.slice(0, 20).map((job, index) => ({
    id: `open-public-job-${index}`,
    kind: "OPEN_JOB_DETAIL",
    label: job.title,
    description: `Open ${job.title} at ${job.company ?? "the listed company"} · ${job.location ?? "location unknown"}`,
    value: job.sourceExternalId ?? job.sourceUrl ?? String(index),
  }));
  candidates.push({
    id: "stop-public-source",
    kind: "STOP",
    label: "Stop this public source",
    description: "Choose only if none of the remaining published jobs advances the research goal.",
  });
  const observation: CapturedObservation = {
    observationVersion: `public-${flow.id}-${remaining.length}`,
    url: flow.startUrl,
    title: flow.title,
    visibleTextSummary: remaining
      .map((job) => `${job.title} · ${job.company ?? ""} · ${job.location ?? ""}`)
      .join("\n")
      .slice(0, 2000),
    elements: candidates
      .filter((candidate) => candidate.kind === "OPEN_JOB_DETAIL")
      .map((candidate) => ({
        id: candidate.id,
        role: "link" as const,
        name: candidate.label,
        value: candidate.value ?? null,
        visible: true,
        enabled: true,
        supportedActions: ["OPEN_JOB_DETAIL" as const],
        risk: "NONE" as const,
      })),
  };

  let decision;
  try {
    decision = await provider.chooseAction({
      goal: flow.goal,
      observation,
      candidates,
      recentActions: [],
    });
  } catch (error) {
    await emit(flow.id, "JEV_FALLBACK", "Jev was unavailable; used the safe public-feed order", {
      error: error instanceof Error ? error.message : String(error),
    });
    decision = await new DemoBrowserDecisionProvider().chooseAction({
      goal: flow.goal,
      observation,
      candidates,
      recentActions: [],
    });
  }
  const chosen = candidates.find((candidate) => candidate.id === decision.actionId);
  if (!chosen || chosen.kind === "STOP") {
    await emit(flow.id, "BROWSER_DECISION", `${decision.provider} stopped this public source`, {
      provider: decision.provider,
      confidence: decision.confidence,
      actionId: decision.actionId,
    });
    return undefined;
  }
  await emit(flow.id, "BROWSER_DECISION", `${decision.provider} chose: ${chosen.label}`, {
    provider: decision.provider,
    confidence: decision.confidence,
    actionId: chosen.id,
    actionKind: chosen.kind,
    observationVersion: decision.observationVersion,
  });
  const chosenIndex = Number(chosen.id.replace("open-public-job-", ""));
  return remaining[chosenIndex];
}

async function emit(
  flowId: string,
  kind: string,
  label: string,
  data: Record<string, unknown> = {},
) {
  await db.browserEvent.create({ data: { flowId, kind, label, data: data as object } });
}

async function isCancelled(flowId: string): Promise<boolean> {
  const current = await db.discoveryFlow.findUnique({
    where: { id: flowId },
    select: { cancellationRequested: true },
  });
  return current?.cancellationRequested ?? false;
}

function categorize(error: unknown): string {
  if (error instanceof ZodError) return "EXTRACTION_INCOMPLETE";
  if (error instanceof JobSourceFetchError) {
    return /timed out/i.test(error.message) ? "TIMEOUT" : "NETWORK";
  }
  return "UNKNOWN";
}
