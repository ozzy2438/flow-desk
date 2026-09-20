import { describe, expect, it, vi } from "vitest";
import {
  applyDiscoveryEligibility,
  discoverPublicAtsJobs,
  isPublicAtsBoardApiUrl,
  parsePublicAtsBoardUrl,
} from "@/server/jobSources/publicAts";
import { UnsupportedJobUrlError } from "@/server/jobs/urlImport";

function response(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200 });
}

describe("public ATS Research Run sources", () => {
  it("normalizes company board and individual posting URLs to board API definitions", async () => {
    const board = parsePublicAtsBoardUrl("https://job-boards.greenhouse.io/acme/jobs/123456");
    expect(board).toMatchObject({
      id: "GREENHOUSE_BOARD:acme",
      allowedDomains: ["boards-api.greenhouse.io"],
    });
    expect(await board.resolveStartUrl()).toBe(
      "https://boards-api.greenhouse.io/v1/boards/acme/jobs",
    );

    const lever = parsePublicAtsBoardUrl("https://jobs.eu.lever.co/acme/abc-123");
    expect(await lever.resolveStartUrl()).toBe("https://api.eu.lever.co/v0/postings/acme");
  });

  it("recognizes only the exact official API list shapes as public ATS flows", () => {
    expect(
      isPublicAtsBoardApiUrl("https://boards-api.greenhouse.io/v1/boards/acme/jobs"),
    ).toBe(true);
    expect(isPublicAtsBoardApiUrl("https://api.lever.co/v0/postings/acme")).toBe(true);
    expect(isPublicAtsBoardApiUrl("https://api.lever.co/v0/postings/acme/job-id")).toBe(false);
    expect(isPublicAtsBoardApiUrl("https://example.com/v0/postings/acme")).toBe(false);
  });

  it("filters a board by explicit role families before fetching job details", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith("/jobs")) {
        return response({
          jobs: [
            { id: 1, title: "Data Engineer" },
            { id: 2, title: "Account Executive" },
          ],
        });
      }
      if (new URL(url).pathname.endsWith("/jobs/1")) {
        return response({
          id: 1,
          title: "Data Engineer",
          company_name: "Acme",
          first_published: "2026-09-18T01:02:03Z",
          location: { name: "Melbourne, Australia" },
          content: "<p>Build data platforms.</p>",
          absolute_url: "https://job-boards.greenhouse.io/acme/jobs/1",
        });
      }
      throw new Error(`Unexpected URL ${url}`);
    });

    const jobs = await discoverPublicAtsJobs(
      "https://boards-api.greenhouse.io/v1/boards/acme/jobs",
      "Find Data Engineer roles in Melbourne",
      10,
      fetchMock as typeof fetch,
    );

    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({ title: "Data Engineer", sourceOpenStatus: "OPEN" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("uses Lever country metadata to exclude non-Melbourne jobs before detail fetches", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith("/v0/postings/acme")) {
        return response([
          {
            id: "fr-job",
            text: "Data Engineer",
            categories: { allLocations: [] },
            country: "FR",
            workplaceType: "hybrid",
          },
          {
            id: "au-job",
            text: "Data Engineer",
            categories: { location: "Melbourne", allLocations: ["Melbourne"] },
            country: "AU",
            workplaceType: "hybrid",
          },
        ]);
      }
      if (url.endsWith("/v0/postings/acme/au-job")) {
        return response({
          id: "au-job",
          text: "Data Engineer",
          categories: { location: "Melbourne", allLocations: ["Melbourne"] },
          country: "AU",
          descriptionPlain: "Build data platforms.",
          hostedUrl: "https://jobs.lever.co/acme/au-job",
          workplaceType: "hybrid",
        });
      }
      throw new Error(`Unexpected URL ${url}`);
    });

    const jobs = await discoverPublicAtsJobs(
      "https://api.lever.co/v0/postings/acme",
      "Find Data Engineer roles in Melbourne",
      10,
      fetchMock as typeof fetch,
    );

    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({ sourceExternalId: "au-job", location: "Melbourne" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("rejects LinkedIn and SEEK as unattended board sources", () => {
    for (const url of ["https://www.linkedin.com/jobs/search", "https://www.seek.com.au/jobs"]) {
      try {
        parsePublicAtsBoardUrl(url);
        throw new Error("Expected parsing to fail");
      } catch (error) {
        expect(error).toBeInstanceOf(UnsupportedJobUrlError);
        expect((error as UnsupportedJobUrlError).code).toBe("MANUAL_CAPTURE_REQUIRED");
      }
    }
  });

  it("filters verified stale jobs and routes unknown recency to human review", () => {
    const now = new Date("2026-09-19T00:00:00Z");
    const base = {
      source: "LEVER:acme",
      title: "Data Engineer",
      location: "Melbourne",
      workplaceType: "HYBRID" as const,
      employmentType: "UNKNOWN" as const,
      seniority: "UNKNOWN" as const,
      descriptionRaw: "Build data products.",
      responsibilities: [],
      requiredSkills: [],
      preferredSkills: [],
      visaRequirements: [],
      sourceOpenStatus: "OPEN" as const,
      postedAtBasis: "UNKNOWN" as const,
      eligibilityUncertainties: [],
      extractionConfidence: 0.98,
      ingestSource: "URL_IMPORT" as const,
    };

    const unknown = applyDiscoveryEligibility(base, "Find Melbourne roles from the last 7 days", now);
    expect(unknown.eligible).toBe(true);
    expect(unknown.job.eligibilityUncertainties[0]).toContain("does not expose a verifiable published date");

    const stale = applyDiscoveryEligibility(
      { ...base, postedAt: "2026-09-01T00:00:00Z", postedAtBasis: "FIRST_PUBLISHED" },
      "Find Melbourne roles from the last 7 days",
      now,
    );
    expect(stale.eligible).toBe(false);
    expect(stale.reason).toContain("older than");

    const outsideTarget = applyDiscoveryEligibility(
      { ...base, location: undefined, country: "FR", workplaceType: "HYBRID" },
      "Find Melbourne roles",
      now,
    );
    expect(outsideTarget.eligible).toBe(false);
    expect(outsideTarget.reason).toContain("does not match");

    const unknownLocation = applyDiscoveryEligibility(
      { ...base, location: undefined, workplaceType: "HYBRID" },
      "Find Melbourne roles",
      now,
    );
    expect(unknownLocation.eligible).toBe(true);
    expect(unknownLocation.job.eligibilityUncertainties).toContain(
      "The research goal has a location constraint, but this source does not expose a verifiable job location.",
    );
  });
});
