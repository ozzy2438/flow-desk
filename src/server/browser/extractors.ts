import type { Page } from "playwright";

export type ExtractedJobFields = {
  title: string;
  company?: string;
  location?: string;
  workplaceType?: "REMOTE" | "HYBRID" | "ONSITE" | "UNKNOWN";
  employmentType?: "FULL_TIME" | "PART_TIME" | "CONTRACT" | "CASUAL" | "FIXED_TERM" | "UNKNOWN";
  seniority?: "ENTRY" | "MID" | "SENIOR" | "LEAD" | "UNKNOWN";
  salaryMin?: number;
  salaryMax?: number;
  salaryCurrency?: string;
  descriptionRaw: string;
  requiredSkills?: string[];
  preferredSkills?: string[];
  extractionConfidence: number;
};

async function textOf(page: Page, selector: string): Promise<string | undefined> {
  const el = await page.locator(selector).first();
  if ((await el.count()) === 0) return undefined;
  const text = (await el.textContent())?.trim();
  return text || undefined;
}

async function listOf(page: Page, selector: string): Promise<string[]> {
  return page.locator(selector).allTextContents().then((items) => items.map((t) => t.trim()).filter(Boolean));
}

/**
 * Extracts only what's visibly present on the demo job board's detail page.
 * A field the page doesn't clearly state is left undefined - normalize.ts
 * then stores it as UNKNOWN rather than the extractor guessing at it
 * (Phase 4: "mark uncertain fields as unknown; never infer them as facts").
 */
async function extractDemoBoard(page: Page): Promise<ExtractedJobFields> {
  const title = (await textOf(page, ".job-detail-title")) ?? "Untitled role";
  const company = await textOf(page, ".job-detail-company");
  const location = await textOf(page, ".job-detail-location");
  const workplaceType = (await textOf(page, ".job-detail-workplace-type")) as
    | ExtractedJobFields["workplaceType"]
    | undefined;
  const employmentType = (await textOf(page, ".job-detail-employment-type")) as
    | ExtractedJobFields["employmentType"]
    | undefined;
  const seniority = (await textOf(page, ".job-detail-seniority")) as
    | ExtractedJobFields["seniority"]
    | undefined;
  const description = (await textOf(page, ".job-detail-description")) ?? "";

  const salaryEl = page.locator(".job-detail-salary").first();
  const salaryMinAttr = (await salaryEl.count()) > 0 ? await salaryEl.getAttribute("data-min") : null;
  const salaryMaxAttr = (await salaryEl.count()) > 0 ? await salaryEl.getAttribute("data-max") : null;
  const salaryCurrency =
    (await salaryEl.count()) > 0 ? ((await salaryEl.getAttribute("data-currency")) ?? undefined) : undefined;

  const requiredSkills = await listOf(page, ".job-detail-required-skills li");
  const preferredSkills = await listOf(page, ".job-detail-preferred-skills li");

  return {
    title,
    company,
    location,
    workplaceType: workplaceType ?? "UNKNOWN",
    employmentType: employmentType ?? "UNKNOWN",
    seniority: seniority ?? "UNKNOWN",
    salaryMin: salaryMinAttr ? Number(salaryMinAttr) : undefined,
    salaryMax: salaryMaxAttr ? Number(salaryMaxAttr) : undefined,
    salaryCurrency,
    descriptionRaw: description || title,
    requiredSkills,
    preferredSkills,
    extractionConfidence: description ? 0.95 : 0.5,
  };
}

const EXTRACTORS: Record<string, (page: Page) => Promise<ExtractedJobFields>> = {
  DEMO_BOARD_ALL: extractDemoBoard,
  DEMO_BOARD_REMOTE: extractDemoBoard,
  DEMO_BOARD_CONTRACT: extractDemoBoard,
};

export function getExtractor(sourceId: string) {
  const extractor = EXTRACTORS[sourceId];
  if (!extractor) throw new Error(`No extractor registered for source "${sourceId}".`);
  return extractor;
}
