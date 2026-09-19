import { createHash } from "node:crypto";
import type { Page } from "playwright";
import type { BrowserActionKind } from "./actions";

export type BrowserElement = {
  id: string;
  role: "button" | "link" | "textbox" | "combobox" | "checkbox" | "tab" | "option" | "other";
  name: string;
  value: string | null;
  visible: boolean;
  enabled: boolean;
  supportedActions: BrowserActionKind[];
  risk: "NONE" | "LOW" | "MEDIUM" | "HIGH" | "IRREVERSIBLE";
};

export type CapturedObservation = {
  observationVersion: string;
  url: string;
  title: string;
  visibleTextSummary: string;
  elements: BrowserElement[];
};

/**
 * Observes only visible links and buttons - never form fields, hidden
 * inputs, cookies, tokens or credentials (docs/browser-worker.md and
 * docs/security.md). This is a real, page-agnostic DOM read, not something
 * special-cased to the fixture job board.
 */
export async function captureObservation(page: Page): Promise<CapturedObservation> {
  const url = page.url();
  const title = await page.title();

  const visibleTextSummary = (await page.evaluate(() => document.body?.innerText ?? "")).slice(
    0,
    2000,
  );

  const rawElements = await page.evaluate(() => {
    const nodes = Array.from(document.querySelectorAll<HTMLElement>("a, button"));
    return nodes.slice(0, 80).map((el, index) => {
      const rect = el.getBoundingClientRect();
      const visible = rect.width > 0 && rect.height > 0;
      return {
        index,
        tag: el.tagName.toLowerCase(),
        text: (el.textContent ?? "").trim().slice(0, 120),
        href: el instanceof HTMLAnchorElement ? el.getAttribute("href") : null,
        visible,
        disabled: (el as HTMLButtonElement).disabled ?? false,
      };
    });
  });

  const elements: BrowserElement[] = rawElements.map((el) => ({
    id: `el-${el.index}`,
    role: el.tag === "a" ? "link" : "button",
    name: el.text,
    value: el.href,
    visible: el.visible,
    enabled: !el.disabled,
    supportedActions: ["CLICK"],
    risk: "NONE",
  }));

  const fingerprint = JSON.stringify({ url, elements: elements.map((e) => [e.id, e.name, e.value]) });
  const observationVersion = createHash("sha256").update(fingerprint).digest("hex").slice(0, 16);

  return { observationVersion, url, title, visibleTextSummary, elements };
}

/**
 * A decision computed against one observation must never be executed
 * against a different one - docs/browser-worker.md's stale-state
 * protection. Any caller that holds a decision tied to an observationVersion
 * must re-check with this before acting on it.
 */
export function isObservationFresh(
  decisionObservationVersion: string,
  current: CapturedObservation,
): boolean {
  return decisionObservationVersion === current.observationVersion;
}
