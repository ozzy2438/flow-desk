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
 * Observes visible, non-sensitive read-only controls. Password fields,
 * hidden inputs, cookies, tokens and credentials are never included.
 * Stable `data-flowdesk-id` values bind a code-owned action candidate to
 * the exact DOM state Jev saw; the observation hash prevents stale use.
 */
export async function captureObservation(page: Page): Promise<CapturedObservation> {
  const url = page.url();
  const title = await page.title();

  const visibleTextSummary = (await page.evaluate(() => document.body?.innerText ?? "")).slice(
    0,
    2000,
  );
  const scrollY = await page.evaluate(() => Math.round(window.scrollY));

  const rawElements = await page.evaluate(() => {
    const nodes = Array.from(
      document.querySelectorAll<HTMLElement>(
        'a, button, input:not([type="hidden"]):not([type="password"]), select, [role="tab"]',
      ),
    );
    return nodes.slice(0, 80).map((el, index) => {
      const rect = el.getBoundingClientRect();
      const visible = rect.width > 0 && rect.height > 0;
      const id = `el-${index}`;
      el.dataset.flowdeskId = id;
      const input = el instanceof HTMLInputElement ? el : null;
      const select = el instanceof HTMLSelectElement ? el : null;
      return {
        id,
        index,
        tag: el.tagName.toLowerCase(),
        type: input?.type ?? null,
        role: el.getAttribute("role"),
        text: (
          el.getAttribute("aria-label") ??
          input?.placeholder ??
          select?.selectedOptions[0]?.textContent ??
          el.textContent ??
          ""
        )
          .trim()
          .slice(0, 120),
        href: el instanceof HTMLAnchorElement ? el.getAttribute("href") : null,
        value: input?.value ?? select?.value ?? null,
        visible,
        disabled:
          (el instanceof HTMLButtonElement ||
          el instanceof HTMLInputElement ||
          el instanceof HTMLSelectElement
            ? el.disabled
            : false) ?? false,
      };
    });
  });

  const elements: BrowserElement[] = rawElements.map((el) => {
    const role: BrowserElement["role"] =
      el.tag === "a"
        ? "link"
        : el.tag === "button"
          ? "button"
          : el.tag === "select"
            ? "combobox"
            : el.type === "checkbox"
              ? "checkbox"
              : el.tag === "input"
                ? "textbox"
                : el.role === "tab"
                  ? "tab"
                  : "other";
    const supportedActions: BrowserActionKind[] =
      role === "textbox"
        ? ["TYPE_TEXT"]
        : role === "combobox"
          ? ["SELECT_OPTION"]
          : ["CLICK"];
    return {
      id: el.id,
      role,
      name: el.text,
      value: el.href ?? el.value,
      visible: el.visible,
      enabled: !el.disabled,
      supportedActions,
      risk: "NONE",
    };
  });

  const fingerprint = JSON.stringify({
    url,
    scrollY,
    visibleTextSummary,
    elements: elements.map((e) => [e.id, e.name, e.value]),
  });
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
