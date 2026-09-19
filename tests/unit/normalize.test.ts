import { describe, expect, it } from "vitest";
import { computeDedupeKey, normalizeJobInput } from "@/server/jobs/normalize";
import { rawJobInputSchema } from "@/server/jobs/types";

function input(overrides: Record<string, unknown> = {}) {
  return rawJobInputSchema.parse({
    source: "TEST",
    title: "Applied AI Engineer",
    descriptionRaw: "Build things.",
    ...overrides,
  });
}

describe("computeDedupeKey", () => {
  it("prefers the source external ID when present", () => {
    const a = computeDedupeKey(input({ sourceExternalId: "abc", sourceUrl: "https://x.test/1" }));
    const b = computeDedupeKey(input({ sourceExternalId: "abc", sourceUrl: "https://x.test/2" }));
    expect(a).toBe(b);
  });

  it("falls back to a normalized URL when there is no external ID", () => {
    const a = computeDedupeKey(input({ sourceUrl: "https://x.test/jobs/1?utm=abc#frag" }));
    const b = computeDedupeKey(input({ sourceUrl: "https://x.test/jobs/1" }));
    expect(a).toBe(b);
  });

  it("falls back to a title/company/location fingerprint when neither is present", () => {
    const a = computeDedupeKey(input({ title: "Applied AI Engineer", company: "Acme", location: "Melbourne" }));
    const b = computeDedupeKey(
      input({ title: "  applied AI  engineer ", company: "ACME", location: "melbourne" }),
    );
    expect(a).toBe(b);
  });

  it("produces different keys for genuinely different postings", () => {
    const a = computeDedupeKey(input({ title: "Applied AI Engineer", company: "Acme" }));
    const b = computeDedupeKey(input({ title: "Frontend Engineer", company: "Acme" }));
    expect(a).not.toBe(b);
  });
});

describe("normalizeJobInput", () => {
  it("stores an omitted field as null/UNKNOWN rather than inferring a value", () => {
    const normalized = normalizeJobInput(input());
    expect(normalized.company).toBeNull();
    expect(normalized.salaryMin).toBeNull();
    expect(normalized.workplaceType).toBe("UNKNOWN");
    expect(normalized.employmentType).toBe("UNKNOWN");
  });

  it("trims whitespace on free-text fields", () => {
    const normalized = normalizeJobInput(input({ title: "  Applied AI Engineer  ", company: "  Acme  " }));
    expect(normalized.title).toBe("Applied AI Engineer");
    expect(normalized.company).toBe("Acme");
  });
});
