import { beforeEach, describe, expect, it } from "vitest";
import { Asset, Storyboard, TimelineSequence, commitFinishedStoryboard, initTestDb } from "@nodetool-ai/models";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import { finishStoryboard } from "../src/capabilities/finish-storyboard.js";
import { createCapabilityRun, UNGATED } from "../src/capabilities/invoke.js";
const run = (userId = "u1") => createCapabilityRun({ context: { userId } as ProcessingContext, gate: UNGATED });
async function fixture() {
  const asset = await Asset.create<Asset>({ user_id: "u1", name: "Product", content_type: "image/png" });
  const board = await Storyboard.create<Storyboard>({ user_id: "u1", project_id: "default", name: "Ad", document: JSON.stringify({ shots: [{ type: "shot", id: "hook", index: 0, action: "Product", status: "planned", duration_seconds: 3, production: { media_strategy: "still_motion_graphics", protected_inputs: [{ id: "product", kind: "product", asset_id: asset.id, allowed_transformations: ["position", "scale", "opacity"] }] }, graphics: { mode: "graphics_first", elements: [{ id: "product", kind: "asset", role: "product", protected_input_id: "product" }] } }], entityIds: [], aspectRatio: "9:16", screenplay: null }) });
  return { board, asset };
}
describe("finish_storyboard", () => {
  beforeEach(() => initTestDb());
  it("accepts owned prefixes and atomically produces separately editable layers without provider calls", async () => {
    const { board, asset } = await fixture();
    const result = await finishStoryboard.impl(run(), { storyboardId: board.id.slice(0, 12), expectedStoryboardRevision: board.revision }) as { timelineId: string; storyboardRevision: number; validation: unknown[] };
    expect(result.validation).toEqual([]);
    const savedBoard = (await Storyboard.findById(board.id))!;
    expect(savedBoard.timeline_id).toBe(result.timelineId);
    expect(savedBoard.revision).toBe(result.storyboardRevision);
    const timeline = (await TimelineSequence.findById(result.timelineId))!;
    expect(JSON.parse(timeline.document).clips[0].currentAssetId).toBe(asset.id);
    expect(timeline.width).toBe(1080);
  });
  it("rejects stale board revisions and foreign ownership without writes", async () => {
    const { board } = await fixture();
    expect(await finishStoryboard.impl(run(), { storyboardId: board.id, expectedStoryboardRevision: board.revision + 1 })).toEqual({ error: "Storyboard revision conflict." });
    expect(await finishStoryboard.impl(run("foreign"), { storyboardId: board.id, expectedStoryboardRevision: board.revision })).toEqual({ error: "Storyboard was not found." });
    expect((await Storyboard.findById(board.id))!.timeline_id).toBeFalsy();
  });
  it("requires current timeline revision and preserves manual product placement on rerun", async () => {
    const { board } = await fixture();
    const first = await finishStoryboard.impl(run(), { storyboardId: board.id, expectedStoryboardRevision: board.revision }) as { timelineId: string };
    const savedBoard = (await Storyboard.findById(board.id))!;
    const timeline = (await TimelineSequence.findById(first.timelineId))!;
    const document = JSON.parse(timeline.document);
    document.clips[0].transform.position.x = 99;
    await TimelineSequence.updateDocumentIfUnchanged(timeline.id, timeline.updated_at, document);
    const latest = (await TimelineSequence.findById(timeline.id))!;
    const stale = await finishStoryboard.impl(run(), { storyboardId: board.id, expectedStoryboardRevision: savedBoard.revision, expectedTimelineRevision: timeline.revision });
    expect(stale).toHaveProperty("error");
    expect((await Storyboard.findById(board.id))!.revision).toBe(savedBoard.revision);
    const result = await finishStoryboard.impl(run(), { storyboardId: board.id, expectedStoryboardRevision: savedBoard.revision, expectedTimelineRevision: latest.revision });
    expect(result).toHaveProperty("validation", []);
    const next = JSON.parse((await TimelineSequence.findById(timeline.id))!.document);
    expect(next.clips).toHaveLength(1);
    expect(next.clips[0].transform.position.x).toBe(99);
  });
  it("rejects foreign protected assets and invalid semantic references before creating a timeline", async () => {
    const { board, asset } = await fixture();
    asset.user_id = "foreign";
    await asset.save();
    expect(await finishStoryboard.impl(run(), { storyboardId: board.id, expectedStoryboardRevision: board.revision })).toHaveProperty("error");
    expect((await Storyboard.findById(board.id))!.timeline_id).toBeFalsy();
  });
  it("rolls back the board link revision when a timeline CAS fails inside the transaction", async () => {
    const { board } = await fixture();
    const first = await finishStoryboard.impl(run(), { storyboardId: board.id, expectedStoryboardRevision: board.revision }) as { timelineId: string };
    const savedBoard = (await Storyboard.findById(board.id))!;
    const staleTimeline = (await TimelineSequence.findById(first.timelineId))!;
    const document = JSON.parse(staleTimeline.document);
    await TimelineSequence.updateDocumentIfUnchanged(staleTimeline.id, staleTimeline.updated_at, document);
    await expect(commitFinishedStoryboard({ board: savedBoard, timeline: staleTimeline, document, width: 1080, height: 1920, durationMs: 3000 })).rejects.toThrow("Timeline was modified concurrently");
    expect((await Storyboard.findById(board.id))!.revision).toBe(savedBoard.revision);
  });

});
