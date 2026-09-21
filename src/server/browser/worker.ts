import { existsSync } from "node:fs";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { db } from "../db";
import { logger } from "../logger";
import { getEnv } from "../env";
import { captureObservation, isObservationFresh } from "./observation";
import { storeScreenshot } from "./screenshotStorage";
import { getExtractor } from "./extractors";
import { assertDomainAllowed, DomainNotAllowedError } from "./domainGuard";
import { detectUnsafePageState, UnsafePageStateError } from "./safetyChecks";
import { acquireDomainSlot } from "./perDomainConcurrency";
import { deriveSearchTerm } from "./deriveSearchTerm";
import { rawJobInputSchema, type RawJobInput } from "../jobs/types";
import { normalizeJobInput } from "../jobs/normalize";
import { evaluateAndPersistJob } from "../jobs/evaluate";
import { syncResearchRunStatus } from "../researchRuns/syncStatus";
import type { DiscoveryFlow, FlowStatus } from "@prisma/client";
import { isPublicAtsBoardApiUrl } from "../jobSources/publicAts";
import { runPublicAtsFlow } from "../jobSources/runPublicAtsFlow";
import {
  DemoBrowserDecisionProvider,
  getBrowserDecisionProvider,
  type BrowserActionCandidate,
  type BrowserDecisionProvider,
  type ScreenshotHistoryItem,
} from "./decisionProvider";

class FlowCancelledError extends Error {}

let sharedBrowser: Browser | undefined;

/**
 * Prefers an explicitly pinned Chromium binary (set PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
 * or this falls back to a well-known pre-provisioned path) over Playwright's
 * own version-pinned download, so the worker runs without requiring
 * `playwright install` to have fetched a revision matching this exact
 * `playwright` npm version.
 */
function resolveExecutablePath(): string | undefined {
  const pinned = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ?? "/opt/pw-browsers/chromium";
  return existsSync(pinned) ? pinned : undefined;
}

async function getSharedBrowser(): Promise<Browser> {
  if (!sharedBrowser) {
    sharedBrowser = await chromium.launch({ headless: true, executablePath: resolveExecutablePath() });
  }
  return sharedBrowser;
}

export async function closeSharedBrowser(): Promise<void> {
  if (sharedBrowser) {
    await sharedBrowser.close();
    sharedBrowser = undefined;
  }
}

async function emitEvent(
  flowId: string,
  kind: string,
  label: string,
  data: Record<string, unknown> = {},
) {
  await db.browserEvent.create({ data: { flowId, kind, label, data: data as object } });
}

async function setStatus(flowId: string, status: FlowStatus) {
  await db.discoveryFlow.update({ where: { id: flowId }, data: { status } });
}

async function captureScreenshot(page: Page, flowId: string, stepLabel: string) {
  const buffer = await page.screenshot({ type: "png" });
  const stored = await storeScreenshot(buffer, flowId);
  const viewport = page.viewportSize();
  const artifact = await db.screenshotArtifact.create({
    data: {
      flowId,
      stepLabel,
      storageDriver: stored.driver,
      storagePath: stored.storagePath,
      width: viewport?.width ?? 0,
      height: viewport?.height ?? 0,
    },
  });
  return artifact;
}

async function recordObservation(flowId: string, page: Page, screenshotId?: string) {
  const observation = await captureObservation(page);
  await db.browserObservation.create({
    data: {
      flowId,
      observationVersion: observation.observationVersion,
      url: observation.url,
      title: observation.title,
      visibleTextSummary: observation.visibleTextSummary,
      elements: observation.elements,
      screenshotArtifactId: screenshotId,
    },
  });
  return observation;
}

async function observeStep(input: {
  page: Page;
  flowId: string;
  goal: string;
  stepLabel: string;
  provider: BrowserDecisionProvider;
  screenshotHistory: ScreenshotHistoryItem[];
  forceScreenshot?: boolean;
}) {
  const observation = await captureObservation(input.page);
  const screenshotDecision = input.forceScreenshot
    ? { distinct: true, probability: 1, confidence: 1, provider: "CODE" as const }
    : await judgeScreenshotSafely(input.provider, {
        goal: input.goal,
        observation,
        stepLabel: input.stepLabel,
        history: input.screenshotHistory,
      });
  let screenshotId: string | undefined;

  if (screenshotDecision.distinct) {
    const screenshot = await captureScreenshot(input.page, input.flowId, input.stepLabel);
    screenshotId = screenshot.id;
    input.screenshotHistory.push({ ...observation, stepLabel: input.stepLabel });
    await emitEvent(input.flowId, "SCREENSHOT_KEPT", `Kept distinct screen: ${input.stepLabel}`, {
      screenshotId,
      provider: screenshotDecision.provider,
      probability: screenshotDecision.probability,
      confidence: screenshotDecision.confidence,
    });
  } else {
    await emitEvent(input.flowId, "SCREENSHOT_SKIPPED", `Skipped repeated screen: ${input.stepLabel}`, {
      provider: screenshotDecision.provider,
      probability: screenshotDecision.probability,
      confidence: screenshotDecision.confidence,
    });
  }

  await db.browserObservation.create({
    data: {
      flowId: input.flowId,
      observationVersion: observation.observationVersion,
      url: observation.url,
      title: observation.title,
      visibleTextSummary: observation.visibleTextSummary,
      elements: observation.elements,
      screenshotArtifactId: screenshotId,
    },
  });
  return { observation, screenshotId };
}

async function chooseActionSafely(input: {
  flowId: string;
  goal: string;
  page: Page;
  observation: Awaited<ReturnType<typeof captureObservation>>;
  candidates: BrowserActionCandidate[];
  provider: BrowserDecisionProvider;
  recentActions: string[];
}) {
  let provider: BrowserDecisionProvider = input.provider;
  let decision;
  try {
    decision = await provider.chooseAction({
      goal: input.goal,
      observation: input.observation,
      candidates: input.candidates,
      recentActions: input.recentActions,
    });
  } catch (error) {
    await emitEvent(input.flowId, "JEV_FALLBACK", "Jev was unavailable; used the safe deterministic route", {
      error: error instanceof Error ? error.message : String(error),
    });
    provider = new DemoBrowserDecisionProvider();
    decision = await provider.chooseAction({
      goal: input.goal,
      observation: input.observation,
      candidates: input.candidates,
      recentActions: input.recentActions,
    });
  }

  const current = await captureObservation(input.page);
  if (!isObservationFresh(decision.observationVersion, current)) {
    await emitEvent(input.flowId, "STALE_DECISION", "Discarded a browser choice after the page changed", {
      provider: decision.provider,
      decidedFrom: decision.observationVersion,
      current: current.observationVersion,
    });
    throw new Error("The page changed before the selected browser action could be executed.");
  }

  const candidate = input.candidates.find((item) => item.id === decision.actionId);
  if (!candidate) throw new Error("The selected browser action is no longer available.");
  input.recentActions.push(`${candidate.kind}: ${candidate.label}`);
  await emitEvent(input.flowId, "BROWSER_DECISION", `${decision.provider} chose: ${candidate.label}`, {
    provider: decision.provider,
    confidence: decision.confidence,
    actionId: candidate.id,
    actionKind: candidate.kind,
    observationVersion: decision.observationVersion,
  });
  return { candidate, decision };
}

async function judgeScreenshotSafely(
  provider: BrowserDecisionProvider,
  input: Parameters<BrowserDecisionProvider["judgeScreenshot"]>[0],
) {
  try {
    return await provider.judgeScreenshot(input);
  } catch {
    return new DemoBrowserDecisionProvider().judgeScreenshot(input);
  }
}

async function isCancelled(flowId: string): Promise<boolean> {
  const flow = await db.discoveryFlow.findUnique({
    where: { id: flowId },
    select: { cancellationRequested: true },
  });
  return flow?.cancellationRequested ?? false;
}

/**
 * Short, deliberate pause after each meaningful step, purely so the live
 * dashboard (screenshots + event timeline over SSE) is actually watchable -
 * the fixture board has no real network latency, so without this every flow
 * finishes in under a second. Not used for correctness anywhere; set to 0 to
 * run at full speed (e.g. in CI).
 */
const STEP_PACE_MS = Number(process.env.BROWSER_STEP_PACE_MS ?? 800);

function categorizeFailure(error: unknown): string {
  if (error instanceof DomainNotAllowedError) return "POLICY_BLOCKED";
  if (error instanceof UnsafePageStateError) return error.category;
  const message = error instanceof Error ? error.message : String(error);
  if (/timeout/i.test(message)) return "TIMEOUT";
  if (/net::/i.test(message)) return "NETWORK";
  return "UNKNOWN";
}

/**
 * Navigates, then re-checks safety on the URL the page actually settled on
 * (post-redirect) rather than the one requested - a domain allowed at flow
 * creation time is not the same guarantee as "every page this flow ever
 * lands on." Throws instead of continuing on an off-allowlist domain, a
 * rate-limit response, a login wall or a CAPTCHA.
 */
async function guardedGoto(page: Page, url: string, allowedDomains: string[]): Promise<void> {
  const response = await page.goto(url, { waitUntil: "domcontentloaded" });
  assertDomainAllowed(page.url(), allowedDomains);
  const unsafe = await detectUnsafePageState(page, response);
  if (unsafe) throw unsafe;
}

/**
 * Runs one DiscoveryFlow end to end: open an isolated context, walk the
 * listing page, open each job detail page up to budget, extract, normalize
 * and evaluate it, then close the context. Mirrors
 * docs/browser-worker.md's worker lifecycle. Every navigation re-observes
 * the page and stamps a fresh observationVersion (`isObservationFresh` is
 * the guard a future model-routed action would need to pass before acting
 * on a stale decision - this deterministic POC has no such gap, but the
 * check is real, not decorative).
 */
export async function runFlow(flowId: string, userId: string): Promise<void> {
  const flow = await db.discoveryFlow.findUnique({
    where: { id: flowId },
    include: { researchRun: { select: { mode: true } } },
  });
  if (!flow) {
    logger.error("runFlow: flow not found", { flowId });
    return;
  }

  if (flow.source === "LINKEDIN_MANUAL" || flow.source === "SEEK_MANUAL") {
    await runManualHandoffFlow(flow);
    return;
  }

  const provider = getBrowserDecisionProvider();

  if (isPublicAtsBoardApiUrl(flow.startUrl)) {
    const visualSession = createPublicAtsVisualSession(flow, provider);
    try {
      await runPublicAtsFlow(flow, userId, fetch, {
        provider,
        openJob: visualSession.openJob,
      });
    } finally {
      await visualSession.close();
    }
    return;
  }

  const deadline = Date.now() + flow.maxDurationSeconds * 1000;
  let context: BrowserContext | undefined;
  let releaseDomainSlot: (() => void) | undefined;

  try {
    const startHostname = new URL(flow.startUrl).hostname;
    releaseDomainSlot = await acquireDomainSlot(startHostname, getEnv().BROWSER_PER_DOMAIN_CONCURRENCY);

    await setStatus(flowId, "OPENING_BROWSER");
    await db.discoveryFlow.update({ where: { id: flowId }, data: { startedAt: new Date() } });
    await emitEvent(flowId, "OPENING_BROWSER", "Opening an isolated browser context");
    await syncResearchRunStatus(flow.researchRunId);

    if (await isCancelled(flowId)) throw new FlowCancelledError();

    const browser = await getSharedBrowser();
    const mobile = flow.researchRun.mode === "READ_ONLY:MOBILE_WEB";
    context = await browser.newContext({
      viewport: mobile ? { width: 430, height: 932 } : { width: 1440, height: 960 },
      isMobile: mobile,
    });
    const page = await context.newPage();

    await setStatus(flowId, "OPEN_PAGE");
    await guardedGoto(page, flow.startUrl, flow.allowedDomains);
    let pageCount = 1;
    await page.waitForTimeout(STEP_PACE_MS); // paced for the live dashboard, not correctness
    const screenshotHistory: ScreenshotHistoryItem[] = [];
    const recentActions: string[] = [];
    const openStep = await observeStep({
      page,
      flowId,
      goal: flow.goal,
      stepLabel: "Open source",
      provider,
      screenshotHistory,
      forceScreenshot: true,
    });
    let observation = openStep.observation;
    const openScreenshotId = openStep.screenshotId;
    await emitEvent(flowId, "OPEN_PAGE", `Opened ${observation.url}`, {
      screenshotId: openScreenshotId,
      browserDecisionProvider: provider.name,
    });

    const searchTerm = deriveSearchTerm(flow.goal);
    const searchInput = observation.elements.find(
      (element) => element.role === "textbox" && element.visible && element.enabled,
    );
    if (searchTerm && searchInput) {
      await setStatus(flowId, "SEARCHING");
      const { candidate: searchChoice } = await chooseActionSafely({
        flowId,
        goal: flow.goal,
        page,
        observation,
        provider,
        recentActions,
        candidates: [
          {
            id: "type-search-goal",
            kind: "TYPE_TEXT",
            label: `Search for “${searchTerm}”`,
            description: "Use the visible job-board search field to narrow results to the user's role goal.",
            elementId: searchInput.id,
            value: searchTerm,
          },
          {
            id: "continue-unfiltered",
            kind: "WAIT",
            label: "Continue with the current listing",
            description: "Use only when the current listing is already focused enough for the goal.",
          },
        ],
      });

      if (searchChoice.kind === "TYPE_TEXT" && searchChoice.elementId) {
        await emitEvent(flowId, "SEARCHING", `Typing "${searchTerm}" into the selected search field`);
        await page.locator(`[data-flowdesk-id="${searchChoice.elementId}"]`).fill(searchTerm);
        await page.waitForTimeout(STEP_PACE_MS);
        ({ observation } = await observeStep({
          page,
          flowId,
          goal: flow.goal,
          stepLabel: `Search term entered: "${searchTerm}"`,
          provider,
          screenshotHistory,
        }));

        const searchButton = observation.elements.find(
          (element) =>
            element.role === "button" && /search/i.test(element.name) && element.visible && element.enabled,
        );
        if (searchButton) {
          const { candidate: submitChoice } = await chooseActionSafely({
            flowId,
            goal: flow.goal,
            page,
            observation,
            provider,
            recentActions,
            candidates: [
              {
                id: "submit-search",
                kind: "CLICK",
                label: "Run the job-board search",
                description: "Submit the visible read-only search filter and inspect the result list.",
                elementId: searchButton.id,
              },
              {
                id: "keep-current-results",
                kind: "WAIT",
                label: "Keep the current results",
                description: "Use only if submitting would not improve the current state.",
              },
            ],
          });
          if (submitChoice.kind === "CLICK" && submitChoice.elementId) {
            const [searchResponse] = await Promise.all([
              page.waitForNavigation({ waitUntil: "domcontentloaded" }),
              page.locator(`[data-flowdesk-id="${submitChoice.elementId}"]`).click(),
            ]);
            assertDomainAllowed(page.url(), flow.allowedDomains);
            const unsafeAfterSearch = await detectUnsafePageState(page, searchResponse);
            if (unsafeAfterSearch) throw unsafeAfterSearch;
            pageCount++;
            await page.waitForTimeout(STEP_PACE_MS);
            const searchResultStep = await observeStep({
              page,
              flowId,
              goal: flow.goal,
              stepLabel: `Search results for "${searchTerm}"`,
              provider,
              screenshotHistory,
            });
            observation = searchResultStep.observation;
            await emitEvent(flowId, "SEARCHING", `Search results updated for "${searchTerm}"`, {
              screenshotId: searchResultStep.screenshotId,
            });
          }
        }
      }
    }

    await setStatus(flowId, "SEARCHING");
    const jobDetailPattern = /\/jobs\/[a-z0-9-]+$/;
    const jobLinks = [
      ...new Set(
        observation.elements
          .filter((el) => el.role === "link" && el.value && jobDetailPattern.test(el.value))
          .map((el) => new URL(el.value as string, observation.url).toString()),
      ),
    ];
    await db.discoveryFlow.update({ where: { id: flowId }, data: { jobsDiscovered: jobLinks.length } });
    await emitEvent(flowId, "SEARCHING", `Found ${jobLinks.length} job cards on the listing page`);

    const extractor = getExtractor(flow.source);
    let stepCount = 1;
    const remainingLinks = [...jobLinks];
    const listingUrl = page.url();

    while (remainingLinks.length > 0) {
      stepCount++;
      if (stepCount > flow.maxSteps) {
        await emitEvent(flowId, "STOP", "Step budget reached");
        break;
      }
      if (pageCount >= flow.maxPages) {
        await emitEvent(flowId, "STOP", "Page budget reached");
        break;
      }
      if (Date.now() > deadline) {
        await emitEvent(flowId, "STOP", "Duration budget reached");
        break;
      }
      if (await isCancelled(flowId)) throw new FlowCancelledError();

      const candidates: BrowserActionCandidate[] = remainingLinks.slice(0, 20).map((link, index) => {
        const matchingElement = observation.elements.find(
          (element) => element.role === "link" && element.value && new URL(element.value, observation.url).toString() === link,
        );
        return {
          id: `open-job-${index}`,
          kind: "OPEN_JOB_DETAIL",
          label: matchingElement?.name || `Open job ${index + 1}`,
          description: `Open this remaining public job detail page: ${matchingElement?.name || link}`,
          value: link,
        };
      });
      candidates.push({
        id: "stop-listing",
        kind: "STOP",
        label: "Stop this source",
        description: "Choose only when none of the remaining visible jobs can advance the research goal.",
      });
      const { candidate: jobChoice } = await chooseActionSafely({
        flowId,
        goal: flow.goal,
        page,
        observation,
        candidates,
        provider,
        recentActions,
      });
      if (jobChoice.kind === "STOP" || !jobChoice.value) {
        await emitEvent(flowId, "STOP", `${provider.name} found no useful remaining detail page`);
        break;
      }
      const link = jobChoice.value;
      remainingLinks.splice(remainingLinks.indexOf(link), 1);

      await setStatus(flowId, "OPENING_JOB_DETAIL");
      await guardedGoto(page, link, flow.allowedDomains);
      pageCount++;
      await page.waitForTimeout(STEP_PACE_MS);
      const detailResult = await observeStep({
        page,
        flowId,
        goal: flow.goal,
        stepLabel: `Open job detail: ${jobChoice.label}`,
        provider,
        screenshotHistory,
      });
      observation = detailResult.observation;
      await emitEvent(flowId, "OPENING_JOB_DETAIL", `Opened ${observation.title}`, {
        screenshotId: detailResult.screenshotId,
      });

      await setStatus(flowId, "EXTRACTING");
      const { candidate: detailChoice } = await chooseActionSafely({
        flowId,
        goal: flow.goal,
        page,
        observation,
        provider,
        recentActions,
        candidates: [
          {
            id: "scroll-detail",
            kind: "SCROLL",
            label: "Reveal more of the job detail",
            description: "Scroll the public detail page to inspect requirements not yet visible.",
          },
          {
            id: "extract-visible-detail",
            kind: "EXTRACT_JOB",
            label: "Extract the visible job detail now",
            description: "Use when the visible page already contains enough information for bounded extraction.",
          },
        ],
      });
      if (detailChoice.kind === "SCROLL") {
        await page.mouse.wheel(0, 520);
        await page.waitForTimeout(STEP_PACE_MS);
        ({ observation } = await observeStep({
          page,
          flowId,
          goal: flow.goal,
          stepLabel: `Requirements for ${observation.title}`,
          provider,
          screenshotHistory,
        }));
      }
      const extracted = await extractor(page);
      const candidate = await db.extractedJobCandidate.create({
        data: { flowId, rawPayload: extracted, confidence: extracted.extractionConfidence },
      });
      await emitEvent(flowId, "EXTRACT_JOB", `Extracted "${extracted.title}"`, {
        candidateId: candidate.id,
      });

      await setStatus(flowId, "EVALUATING");
      const rawInput = rawJobInputSchema.parse({
        ...extracted,
        source: flow.source,
        sourceUrl: link,
        ingestSource: "BROWSER_FLOW",
      });
      const { job } = await evaluateAndPersistJob(normalizeJobInput(rawInput), userId, candidate.id);
      await emitEvent(flowId, "EVALUATING", `${job.title} -> ${job.evaluation?.decision}`, {
        jobId: job.id,
        decision: job.evaluation?.decision,
      });

      await db.discoveryFlow.update({
        where: { id: flowId },
        data: {
          jobsNormalized: { increment: 1 },
          ...(job.evaluation?.decision === "APPLY_CANDIDATE" && { jobsApplyCandidate: { increment: 1 } }),
          ...(job.evaluation?.decision === "REVIEW_REQUIRED" && { jobsReviewRequired: { increment: 1 } }),
          ...(job.evaluation?.decision === "SKIP" && { jobsSkipped: { increment: 1 } }),
        },
      });

      if (remainingLinks.length > 0 && pageCount < flow.maxPages) {
        await guardedGoto(page, listingUrl, flow.allowedDomains);
        await page.waitForTimeout(STEP_PACE_MS);
        observation = await recordObservation(flowId, page);
      }
    }

    await emitEvent(flowId, "STOP", "Listing exhausted");
    await db.discoveryFlow.update({
      where: { id: flowId },
      data: { status: "COMPLETE", finishedAt: new Date() },
    });
  } catch (error) {
    if (error instanceof FlowCancelledError) {
      await emitEvent(flowId, "CANCELLED", "Cancelled by user");
      await db.discoveryFlow.update({
        where: { id: flowId },
        data: { status: "CANCELLED", finishedAt: new Date() },
      });
    } else {
      logger.error("Flow failed", { flowId, error: error instanceof Error ? error.message : String(error) });
      await emitEvent(flowId, "FAILED", error instanceof Error ? error.message : "Unknown error");
      await db.discoveryFlow.update({
        where: { id: flowId },
        data: {
          status: "FAILED",
          failureCategory: categorizeFailure(error),
          finishedAt: new Date(),
        },
      });
    }
  } finally {
    await context?.close();
    releaseDomainSlot?.();
    await syncResearchRunStatus(flow.researchRunId);
  }
}

async function runManualHandoffFlow(flow: DiscoveryFlow): Promise<void> {
  const sourceName = flow.source === "LINKEDIN_MANUAL" ? "LinkedIn" : "SEEK";
  await db.discoveryFlow.update({
    where: { id: flow.id },
    data: { status: "OPENING_BROWSER", startedAt: new Date() },
  });
  await emitEvent(
    flow.id,
    "OPENING_BROWSER",
    `${sourceName} needs the operator's signed-in browser session`,
  );
  await emitEvent(
    flow.id,
    "HUMAN_HANDOFF",
    `Open ${sourceName}, inspect the visible posting, then capture it through Job Inbox`,
    {
      source: sourceName,
      sourceUrl: flow.startUrl,
      destination: "/inbox",
      reason: "LOGIN_OR_ANTI_BOT_BOUNDARY",
    },
  );
  await db.discoveryFlow.update({
    where: { id: flow.id },
    data: {
      status: "FAILED",
      failureCategory: "LOGIN_REQUIRED",
      finishedAt: new Date(),
    },
  });
  await syncResearchRunStatus(flow.researchRunId);
}

function createPublicAtsVisualSession(
  flow: DiscoveryFlow & { researchRun: { mode: string } },
  provider: BrowserDecisionProvider,
) {
  let context: BrowserContext | undefined;
  let page: Page | undefined;
  const screenshotHistory: ScreenshotHistoryItem[] = [];
  const recentActions: string[] = [];
  const approvedVisualHosts = new Set([
    "boards.greenhouse.io",
    "job-boards.greenhouse.io",
    "jobs.lever.co",
    "jobs.eu.lever.co",
  ]);

  return {
    openJob: async (job: RawJobInput, actionLabel: string) => {
      if (!job.sourceUrl) {
        await emitEvent(flow.id, "SCREENSHOT_SKIPPED", `No public page URL for ${job.title}`);
        return;
      }
      const target = new URL(job.sourceUrl);
      if (target.protocol !== "https:" || !approvedVisualHosts.has(target.hostname)) {
        await emitEvent(
          flow.id,
          "SCREENSHOT_SKIPPED",
          `Skipped visual capture outside approved public ATS hosts: ${target.hostname}`,
          { sourceUrl: job.sourceUrl },
        );
        return;
      }

      if (!context) {
        const browser = await getSharedBrowser();
        const mobile = flow.researchRun.mode === "READ_ONLY:MOBILE_WEB";
        context = await browser.newContext({
          viewport: mobile ? { width: 430, height: 932 } : { width: 1440, height: 960 },
          isMobile: mobile,
        });
        page = await context.newPage();
        await emitEvent(flow.id, "OPENING_BROWSER", "Opened an isolated public ATS browser context", {
          browserDecisionProvider: provider.name,
        });
      }

      await setStatus(flow.id, "OPENING_JOB_DETAIL");
      await guardedGoto(page!, job.sourceUrl, [target.hostname]);
      await page!.waitForTimeout(STEP_PACE_MS);
      let result = await observeStep({
        page: page!,
        flowId: flow.id,
        goal: flow.goal,
        stepLabel: actionLabel,
        provider,
        screenshotHistory,
        forceScreenshot: screenshotHistory.length === 0,
      });
      await emitEvent(flow.id, "OPENING_JOB_DETAIL", `Opened public page for ${job.title}`, {
        screenshotId: result.screenshotId,
        sourceUrl: job.sourceUrl,
      });

      const { candidate } = await chooseActionSafely({
        flowId: flow.id,
        goal: flow.goal,
        page: page!,
        observation: result.observation,
        provider,
        recentActions,
        candidates: [
          {
            id: "scroll-public-detail",
            kind: "SCROLL",
            label: `Inspect requirements for ${job.title}`,
            description: "Reveal more of the public job description before extraction and evaluation.",
          },
          {
            id: "keep-public-detail",
            kind: "WAIT",
            label: `Keep the current ${job.title} view`,
            description: "Use when the current public job view already represents the useful flow step.",
          },
        ],
      });
      if (candidate.kind === "SCROLL") {
        await page!.mouse.wheel(0, 620);
        await page!.waitForTimeout(STEP_PACE_MS);
        result = await observeStep({
          page: page!,
          flowId: flow.id,
          goal: flow.goal,
          stepLabel: `Requirements for ${job.title}`,
          provider,
          screenshotHistory,
        });
      }
    },
    close: async () => {
      await context?.close();
    },
  };
}
