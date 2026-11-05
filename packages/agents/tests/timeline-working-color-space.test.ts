import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import { initTestDb, TimelineSequence } from "@nodetool-ai/models";
import { timelineDocument } from "@nodetool-ai/protocol/api-schemas/timeline.js";
import { applyOps } from "../src/capabilities/timeline-operations.js";
import type { CapabilityRun } from "../src/capabilities/types.js";
const fixtures: Array<{ name: string; document: Record<string, unknown> }> = JSON.parse(
  readFileSync(new URL("../../timeline/tests/fixtures/working-color-space-versions.json", import.meta.url), "utf8")
);
describe("agent format adaptation working color space", () => {
  beforeEach(() => { initTestDb(); });
  it.each(fixtures)("persists $name through the agent bridge and retarget writer", async ({ document }) => {
    const parsed = timelineDocument.parse(document);
    const source = await TimelineSequence.create({ user_id: "user-1", project_id: "project", name: "Source", document: JSON.stringify(parsed) });
    // This operation needs only the owner identity, with no provider or media hooks.
    const run = { context: { userId: "user-1" } } as unknown as CapabilityRun;
    const result = await applyOps(run, source, source.toDocument(), [{ op: "ui_timeline_retarget_format", input: { aspect_ratio: "9:16", strategy: "center" } }]);
    expect(result.records).toEqual([expect.objectContaining({ ok: true })]);
    const rows = await TimelineSequence.listByUser("user-1");
    const derived = rows.find((row) => row.id !== source.id);
    expect(derived).toBeDefined();
    const saved = derived!.toDocument();
    expect(Object.hasOwn(saved, "workingColorSpaceVersion")).toBe(Object.hasOwn(document, "workingColorSpaceVersion"));
    expect(saved.workingColorSpaceVersion).toBe(document.workingColorSpaceVersion);
  });
});
