/**
 * Runtime counterpart to the Zod-level allowlist check in
 * `planner/schema.ts`. That check only guarantees a DiscoveryFlow was
 * *created* with allowed domains - it says nothing about where the page
 * actually ends up after the worker follows a link or a redirect. This is
 * checked against `page.url()` *after* navigation settles, which is the
 * final URL post-redirect, not the requested one - so a page that starts
 * on an allowed domain and 302s elsewhere is caught here, not missed.
 */
export class DomainNotAllowedError extends Error {
  constructor(
    public readonly url: string,
    public readonly allowedDomains: string[],
  ) {
    super(`Navigation to "${url}" resolved outside the allowed domains: ${allowedDomains.join(", ")}`);
    this.name = "DomainNotAllowedError";
  }
}

export function assertDomainAllowed(url: string, allowedDomains: string[]): void {
  const hostname = new URL(url).hostname;
  if (!allowedDomains.includes(hostname)) {
    throw new DomainNotAllowedError(url, allowedDomains);
  }
}
