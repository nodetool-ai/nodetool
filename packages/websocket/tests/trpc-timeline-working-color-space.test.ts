import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import { initTestDb, TimelineSequence } from "@nodetool-ai/models";
import { timelineDocument } from "@nodetool-ai/protocol/api-schemas/timeline.js";
import { cloneTimelineForBoard, retargetSequence, adaptSequenceFormat } from "@nodetool-ai/timeline";
import { timelineRouter, __resetTimelineAutosaveVersionState } from "../src/trpc/routers/timeline.js";
import { createCallerFactory } from "../src/trpc/index.js";
import type { Context } from "../src/trpc/context.js";
const fixtures: Array<{ name: string; document: Record<string, unknown> }> = JSON.parse(
  readFileSync(new URL("../../timeline/tests/fixtures/working-color-space-versions.json", import.meta.url), "utf8")
);
const context: Context = {
  userId: "user-1", registry: {} as never,
  apiOptions: { metadataRoots: [], registry: {} as never } as never,
  pythonBridge: {} as never, getPythonBridgeReady: () => false
};
const createCaller = createCallerFactory(timelineRouter);
function expectVersion(actual: object, expected: Record<string, unknown>): void {
  expect(Object.hasOwn(actual, "workingColorSpaceVersion")).toBe(Object.hasOwn(expected, "workingColorSpaceVersion"));
  expect(Reflect.get(actual, "workingColorSpaceVersion")).toBe(expected.workingColorSpaceVersion);
}
describe("working color space version round trip", () => {
  beforeEach(() => { initTestDb(); __resetTimelineAutosaveVersionState(); });
  it.each(fixtures)("preserves $name through conversion, copies, saves and history", async ({ document }) => {
    const caller = createCaller(context);
    const created = await caller.create({ name: "Test", projectId: "project" });
    expectVersion(created, {});
    const parsed = timelineDocument.parse(document);
    const model = TimelineSequence.fromTimelineSequence("user-1", { ...created, ...parsed });
    expectVersion(model.toDocument(), document);
    const sequence = model.toTimelineSequence();
    expectVersion(sequence, document);
    expectVersion(TimelineSequence.fromTimelineSequence("user-1", sequence).toDocument(), document);
    expectVersion(cloneTimelineForBoard(sequence, { boardId: "from" }, { boardId: "to" }), document);
    expectVersion(retargetSequence(sequence, "9:16", "contain").sequence, document);
    expectVersion(adaptSequenceFormat(sequence, "9:16", { strategy: "center" }).sequence, document);
    expectVersion(await caller.update({ id: created.id, document: parsed }), document);
    expectVersion(await caller.get({ id: created.id }), document);
    expectVersion((await TimelineSequence.findById(created.id))!.toDocument(), document);
    // Browser format adaptation creates with templateId, then saves a payload that omits the version.
    const adapted = await caller.create({ name: "Adapted", projectId: "project", templateId: created.id });
    expectVersion(adapted, document);
    expectVersion(await caller.update({ id: adapted.id, document: { tracks: [], clips: [], markers: [] } }), document);
    const autosaves = await caller.versions.list({ id: created.id, saveType: "autosave" });
    expect(autosaves.length).toBe(1);
    expectVersion((await caller.versions.get({ id: created.id, version: autosaves[0].version })).document, document);
    const snapshot = await caller.versions.create({ id: created.id, name: "Keep version" });
    expectVersion((await caller.versions.get({ id: created.id, version: snapshot.version })).document, document);
    expectVersion(await caller.update({ id: created.id, name: "Renamed" }), document);
    expectVersion(await caller.update({ id: created.id, document: { tracks: [], clips: [], markers: [] } }), document);
    // Restore must replace a different version, including removing it for the absent fixture.
    await caller.update({ id: created.id, document: { ...parsed, workingColorSpaceVersion: 9 } });
    expectVersion(await caller.versions.restore({ id: created.id, version: snapshot.version }), document);
    expectVersion((await TimelineSequence.findById(created.id))!.toDocument(), document);
  });
  it.each([0, -1, 1.5, null, "2", true])("rejects invalid version %s on save and load", async (value) => {
    const caller = createCaller(context);
    const created = await caller.create({ name: "Invalid", projectId: "project" });
    const document = { tracks: [], clips: [], markers: [], workingColorSpaceVersion: value };
    await expect(caller.update({ id: created.id, document: document as never })).rejects.toThrow();
    const model = new TimelineSequence({ document: JSON.stringify(document) });
    expect(() => model.toTimelineSequence()).toThrow("workingColorSpaceVersion must be a positive integer");
    expect(() => model.beforeSave()).toThrow("workingColorSpaceVersion must be a positive integer");
  });
});
