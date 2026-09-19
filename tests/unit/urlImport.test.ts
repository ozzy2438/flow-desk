import { describe, expect, it, vi } from "vitest";
import {
  importPublicJobUrl,
  parseSupportedJobUrl,
  UnsupportedJobUrlError,
} from "@/server/jobs/urlImport";

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

describe("public ATS URL import", () => {
  it("converts a Greenhouse page to its official public API endpoint", () => {
    expect(
      parseSupportedJobUrl("https://job-boards.greenhouse.io/acme/jobs/123456"),
    ).toMatchObject({
      kind: "GREENHOUSE",
      boardToken: "acme",
      postingId: "123456",
      apiUrl:
        "https://boards-api.greenhouse.io/v1/boards/acme/jobs/123456?pay_transparency=true",
    });
  });

  it("imports Greenhouse facts without treating updated_at as the posted date", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        id: 123456,
        title: "Data Engineer",
        company_name: "Acme",
        first_published: "2026-09-18T01:02:03Z",
        application_deadline: null,
        updated_at: "2026-09-19T01:02:03Z",
        location: { name: "Melbourne, Australia (Hybrid)" },
        content: "<p>Build &amp; validate data products.</p>",
        absolute_url: "https://job-boards.greenhouse.io/acme/jobs/123456",
        pay_input_ranges: [
          { min_cents: 10000000, max_cents: 12000000, currency_type: "AUD" },
        ],
      }),
    );

    const job = await importPublicJobUrl(
      "https://job-boards.greenhouse.io/acme/jobs/123456",
      fetchMock as typeof fetch,
    );

    expect(fetchMock).toHaveBeenCalledWith(
      "https://boards-api.greenhouse.io/v1/boards/acme/jobs/123456?pay_transparency=true",
      expect.objectContaining({ credentials: "omit", redirect: "error" }),
    );
    expect(job).toMatchObject({
      source: "GREENHOUSE:acme",
      sourceExternalId: "123456",
      postedAt: "2026-09-18T01:02:03Z",
      workplaceType: "HYBRID",
      salaryMin: 100000,
      salaryMax: 120000,
      salaryCurrency: "AUD",
      descriptionRaw: "Build & validate data products.",
      ingestSource: "URL_IMPORT",
    });
  });

  it("imports Lever fields and leaves unsupported recency unknown", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        id: "abc-123",
        text: "Analytics Engineer",
        categories: {
          location: "Melbourne, Victoria",
          commitment: "Full-time",
        },
        country: "AU",
        descriptionPlain: "Build reliable analytics models.",
        hostedUrl: "https://jobs.lever.co/acme/abc-123",
        workplaceType: "hybrid",
      }),
    );

    const job = await importPublicJobUrl(
      "https://jobs.lever.co/acme/abc-123",
      fetchMock as typeof fetch,
    );

    expect(job).toMatchObject({
      source: "LEVER:acme",
      employmentType: "FULL_TIME",
      workplaceType: "HYBRID",
      country: "AU",
    });
    expect(job.postedAt).toBeUndefined();
  });

  it.each([
    "https://www.linkedin.com/jobs/view/123",
    "https://www.seek.com.au/job/123",
    "https://au.seek.com/job/123",
  ])("routes session-bound sources to manual capture: %s", (url) => {
    try {
      parseSupportedJobUrl(url);
      throw new Error("Expected parsing to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(UnsupportedJobUrlError);
      expect((error as UnsupportedJobUrlError).code).toBe("MANUAL_CAPTURE_REQUIRED");
    }
  });

  it("rejects arbitrary hosts instead of server-side fetching them", () => {
    expect(() => parseSupportedJobUrl("https://example.com/jobs/123")).toThrow(
      UnsupportedJobUrlError,
    );
  });
});
