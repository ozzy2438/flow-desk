/**
 * docs/browser-worker.md's code-owned action allowlist. A model (or, in
 * this build, the deterministic worker logic) may only select from this
 * set - never emit a CSS selector, a URL, or JavaScript of its own.
 */
export const BROWSER_ACTION_KINDS = [
  "CLICK",
  "TYPE_TEXT",
  "SELECT_OPTION",
  "SCROLL",
  "NEXT_PAGE",
  "OPEN_JOB_DETAIL",
  "EXTRACT_JOB",
  "WAIT",
  "STOP",
] as const;

export type BrowserActionKind = (typeof BROWSER_ACTION_KINDS)[number];

export const READ_ONLY_ALLOWED_ACTIONS: BrowserActionKind[] = [
  "CLICK",
  "TYPE_TEXT",
  "SELECT_OPTION",
  "SCROLL",
  "NEXT_PAGE",
  "OPEN_JOB_DETAIL",
  "EXTRACT_JOB",
  "WAIT",
  "STOP",
];

/** Never present in the allowlist, regardless of flow config. */
export const FORBIDDEN_ACTION_LABELS = [
  "LOGIN",
  "SUBMIT",
  "EASY_APPLY",
  "SEND_MESSAGE",
  "UPLOAD",
  "CREATE_ACCOUNT",
  "PAYMENT",
  "EXECUTE_SCRIPT",
  "SOLVE_CAPTCHA",
  "BYPASS_ANTI_BOT",
] as const;
