import { describe, expect, it } from "vitest";
import { assertDomainAllowed, DomainNotAllowedError } from "@/server/browser/domainGuard";

describe("assertDomainAllowed", () => {
  it("passes when the URL's hostname is in the allowlist", () => {
    expect(() => assertDomainAllowed("http://127.0.0.1:4000/jobs", ["127.0.0.1"])).not.toThrow();
  });

  it("throws when the hostname is outside the allowlist", () => {
    expect(() => assertDomainAllowed("http://evil.example.com/jobs", ["127.0.0.1"])).toThrow(
      DomainNotAllowedError,
    );
  });

  it("checks the hostname the URL actually resolves to, not a substring match", () => {
    // "127.0.0.1.evil.example.com" contains the allowed string but is a different host.
    expect(() =>
      assertDomainAllowed("http://127.0.0.1.evil.example.com/jobs", ["127.0.0.1"]),
    ).toThrow(DomainNotAllowedError);
  });

  it("is port-insensitive (hostname only, matching how the source registry declares domains)", () => {
    expect(() => assertDomainAllowed("http://127.0.0.1:9999/jobs", ["127.0.0.1"])).not.toThrow();
  });
});
