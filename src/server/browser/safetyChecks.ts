import type { Page, Response } from "playwright";

export type UnsafePageStateCategory = "LOGIN_REQUIRED" | "CAPTCHA" | "RATE_LIMITED";

export class UnsafePageStateError extends Error {
  constructor(public readonly category: UnsafePageStateCategory, detail: string) {
    super(`Unsafe page state detected (${category}): ${detail}`);
    this.name = "UnsafePageStateError";
  }
}

const CAPTCHA_PATTERN = /captcha|verify you are human|unusual traffic|are you a robot/i;
const LOGIN_PATH_PATTERN = /\/(login|signin|sign-in|authwall)(\/|$|\?)/i;
const PASSWORD_FIELD_SELECTOR = 'input[type="password"]';

/**
 * AGENCY_BRIEF.md Phase 3: "Stop on login requirements, CAPTCHA, blocked
 * access or unsafe UI states." Checked after every navigation settles, on
 * the response status and a bounded read of the page - never by executing
 * model-supplied logic against page content.
 */
export async function detectUnsafePageState(
  page: Page,
  response: Response | null,
): Promise<UnsafePageStateError | null> {
  const status = response?.status();
  if (status === 429) {
    return new UnsafePageStateError("RATE_LIMITED", `HTTP 429 from ${page.url()}`);
  }

  const url = page.url();
  if (LOGIN_PATH_PATTERN.test(new URL(url).pathname)) {
    return new UnsafePageStateError("LOGIN_REQUIRED", `URL path looks like a login wall: ${url}`);
  }

  const hasPasswordField = (await page.locator(PASSWORD_FIELD_SELECTOR).count()) > 0;
  if (hasPasswordField) {
    return new UnsafePageStateError("LOGIN_REQUIRED", "Page contains a password field.");
  }

  const bodyText = await page
    .evaluate(() => document.body?.innerText ?? "")
    .then((text) => text.slice(0, 2000))
    .catch(() => "");
  if (CAPTCHA_PATTERN.test(bodyText) || CAPTCHA_PATTERN.test(await page.title().catch(() => ""))) {
    return new UnsafePageStateError("CAPTCHA", "Page text matches a CAPTCHA/human-verification pattern.");
  }

  return null;
}
