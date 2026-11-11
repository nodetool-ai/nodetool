import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { timelineDocument, timelineSequenceResponse } from "../src/api-schemas/timeline.js";
const fixtures: Array<{ name: string; document: Record<string, unknown> }> = JSON.parse(
  readFileSync(new URL("../../timeline/tests/fixtures/working-color-space-versions.json", import.meta.url), "utf8")
);
describe("working color space version schema", () => {
  it.each(fixtures)("preserves $name in documents and responses", ({ document }) => {
    expect(timelineDocument.parse(document)).toEqual(document);
    const response = { ...document, id: "sequence", projectId: "project", name: "Test",
      fps: 30, width: 1920, height: 1080, durationMs: 0, createdAt: "2026-01-01", updatedAt: "2026-01-01" };
    expect(timelineSequenceResponse.parse(response)).toEqual(response);
  });
  it.each([0, -1, 1.5, null, "2", true, NaN, Infinity])("rejects %s", (value) => {
    expect(timelineDocument.safeParse({ tracks: [], clips: [], markers: [], workingColorSpaceVersion: value }).success).toBe(false);
    expect(timelineSequenceResponse.shape.workingColorSpaceVersion.safeParse(value).success).toBe(false);
  });
  it("accepts future positive integers", () => {
    expect(timelineDocument.parse({ tracks: [], clips: [], markers: [], workingColorSpaceVersion: 1000 }).workingColorSpaceVersion).toBe(1000);
  });
});
