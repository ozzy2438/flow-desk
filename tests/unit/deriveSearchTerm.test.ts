import { describe, expect, it } from "vitest";
import { deriveSearchTerm } from "@/server/browser/deriveSearchTerm";

describe("deriveSearchTerm", () => {
  it("finds a known role keyword in free-text goal", () => {
    expect(deriveSearchTerm("Find Data Scientist roles in Melbourne.")).toBe("data scientist");
    expect(deriveSearchTerm("Looking for Frontend positions.")).toBe("frontend");
  });

  it("returns null when nothing matches, rather than typing something meaningless", () => {
    expect(deriveSearchTerm("Find interesting opportunities for me.")).toBeNull();
  });
});
