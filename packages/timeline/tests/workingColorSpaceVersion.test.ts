import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { mergeTimelineSource, type TimelineDocumentLike } from "../src/source-merge.js";
const fixtures: Array<{ name: string; document: TimelineDocumentLike }> = JSON.parse(
  readFileSync(new URL("./fixtures/working-color-space-versions.json", import.meta.url), "utf8")
);
describe("code rebake working color space", () => {
  it.each(fixtures)("keeps $name instead of taking the rebuilt document's version", ({ document }) => {
    const merged = mergeTimelineSource(document, { clips: [], workingColorSpaceVersion: 9 }, {});
    expect(Object.hasOwn(merged.document, "workingColorSpaceVersion")).toBe(Object.hasOwn(document, "workingColorSpaceVersion"));
    expect(merged.document.workingColorSpaceVersion).toBe(document.workingColorSpaceVersion);
  });
});
