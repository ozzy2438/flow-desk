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
import { rawJobInputSchema } from "../jobs/types";
import { normalizeJobInput } from "../jobs/normalize";
import { evaluateAndPersistJob } from "../jobs/evaluate";
import { syncResearchRunStatus } from "../researchRuns/syncStatus";
import type { FlowStatus } from "@prisma/client";

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

async function recordObservation(flowId: string, page: Page, screenshotId: string) {
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
const STEP_PACE_MS = Number(process.env.BROWSER_STEP_PACE_MS ?? 350);

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
  const flow = await db.discoveryFlow.findUnique({ where: { id: flowId } });
  if (!flow) {
    logger.error("runFlow: flow not found", { flowId });
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
    context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
    const page = await context.newPage();

    await setStatus(flowId, "OPEN_PAGE");
    await guardedGoto(page, flow.startUrl, flow.allowedDomains);
    let pageCount = 1;
    await page.waitForTimeout(STEP_PACE_MS); // paced for the live dashboard, not correctness
    const openScreenshot = await captureScreenshot(page, flowId, "Open source");
    let observation = await recordObservation(flowId, page, openScreenshot.id);
    await emitEvent(flowId, "OPEN_PAGE", `Opened ${observation.url}`, {
      screenshotId: openScreenshot.id,
    });

    const searchTerm = deriveSearchTerm(flow.goal);
    if (searchTerm && (await page.locator("#search-input").count()) > 0) {
      await setStatus(flowId, "SEARCHING");
      await emitEvent(flowId, "SEARCHING", `Typing "${searchTerm}" into the search box`);
      await page.locator("#search-input").fill(searchTerm);
      await page.waitForTimeout(STEP_PACE_MS);
      const typedScreenshot = await captureScreenshot(page, flowId, `Search term entered: "${searchTerm}"`);
      await emitEvent(flowId, "SEARCHING", `Entered search term "${searchTerm}"`, {
        screenshotId: typedScreenshot.id,
      });

      const [searchResponse] = await Promise.all([
        page.waitForNavigation({ waitUntil: "domcontentloaded" }),
        page.locator("#search-button").click(),
      ]);
      assertDomainAllowed(page.url(), flow.allowedDomains);
      const unsafeAfterSearch = await detectUnsafePageState(page, searchResponse);
      if (unsafeAfterSearch) throw unsafeAfterSearch;
      pageCount++;
      await page.waitForTimeout(STEP_PACE_MS);
      const resultsScreenshot = await captureScreenshot(page, flowId, `Search results for "${searchTerm}"`);
      observation = await recordObservation(flowId, page, resultsScreenshot.id);
      await emitEvent(flowId, "SEARCHING", `Search results updated for "${searchTerm}"`, {
        screenshotId: resultsScreenshot.id,
      });
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

    for (const link of jobLinks) {
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

      await setStatus(flowId, "OPENING_JOB_DETAIL");
      await guardedGoto(page, link, flow.allowedDomains);
      pageCount++;
      await page.waitForTimeout(STEP_PACE_MS);
      const detailScreenshot = await captureScreenshot(page, flowId, `Open job detail: ${link}`);
      observation = await recordObservation(flowId, page, detailScreenshot.id);
      if (!isObservationFresh(observation.observationVersion, observation)) {
        // Always true immediately after capture; kept as an explicit guard
        // so a future model-routed action must re-check before acting.
        continue;
      }
      await emitEvent(flowId, "OPENING_JOB_DETAIL", `Opened ${observation.title}`, {
        screenshotId: detailScreenshot.id,
      });

      await setStatus(flowId, "EXTRACTING");
      await page.mouse.wheel(0, 300);
      await page.waitForTimeout(STEP_PACE_MS);
      const extracted = await extractor(page);
      const candidate = await db.extractedJobCandidate.create({
        data: { flowId, rawPayload: extracted, confidence: extracted.extractionConfidence },
      });
      await captureScreenshot(page, flowId, "Extract visible details");
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
