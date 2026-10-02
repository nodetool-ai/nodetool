import { beforeEach, describe, expect, it } from "vitest";
import { Asset, Script, Storyboard, TimelineSequence, commitFinishedStoryboard, initTestDb } from "@nodetool-ai/models";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import { finishStoryboard, previewStoryboardDesign } from "../src/capabilities/finish-storyboard.js";
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
    expect(result).toMatchObject({ status: "unreviewed_draft", reviewed: false, reviews: [] });
    const savedBoard = (await Storyboard.findById(board.id))!;
    expect(savedBoard.timeline_id).toBe(result.timelineId);
    expect(savedBoard.revision).toBe(result.storyboardRevision);
    const timeline = (await TimelineSequence.findById(result.timelineId))!;
    expect(JSON.parse(timeline.document).clips[0].currentAssetId).toBe(asset.id);
    expect(timeline.width).toBe(1080);
    expect(timeline.toTimelineSequence().storyboardMaterializations).toEqual([{ boardId: board.id, elementKeys: ["hook/product"] }]);
    expect(JSON.parse(TimelineSequence.fromTimelineSequence("u1", timeline.toTimelineSequence()).document).storyboardMaterializations).toEqual(timeline.toDocument().storyboardMaterializations);
  });
  it("never certifies a metadata-only source that has no renderable bytes", async () => {
    const { board } = await fixture();
    const result = await finishStoryboard.impl(run(), { storyboardId: board.id, expectedStoryboardRevision: board.revision });
    expect(result).toMatchObject({ status: "unreviewed_draft", reviewed: false, reviews: [] });
  });
  it("ignores retained disabled optional layers in both preview and draft output", async () => {
    const { board, asset } = await fixture();
    const doc = board.toDocument();
    doc.shots[0].production = { media_strategy: "still_motion_graphics" };
    doc.shots[0].keyframe = { type: "image", asset_id: asset.id };
    doc.shots[0].graphics = { mode: "none", elements: [{ id: "disabled", kind: "asset", asset_id: "unavailable" }] };
    board.document = JSON.stringify(doc); await board.save();
    const preview = await previewStoryboardDesign.impl(run(), { storyboardId: board.id, expectedStoryboardRevision: board.revision }) as { timeline: { data: { clips: { storyboardElementId?: string }[] } } };
    expect(preview.timeline.data.clips.some((clip) => clip.storyboardElementId === "disabled")).toBe(false);
    const result = await finishStoryboard.impl(run(), { storyboardId: board.id, expectedStoryboardRevision: board.revision }) as { timelineId: string };
    expect((await TimelineSequence.findById(result.timelineId))!.toDocument().clips.some((clip) => clip.storyboardElementId === "disabled")).toBe(false);
  });
  it("authorizes covered video through its canonical source and retains audio windows", async () => {
    const { board, asset } = await fixture();
    asset.content_type = "video/mp4"; await asset.save();
    const doc = board.toDocument();
    doc.shots = [
      { type: "shot", id: "a", index: 0, action: "A", status: "rendered", clip: { type: "video", asset_id: asset.id, duration: 8 }, duration_seconds: 3 },
      { type: "shot", id: "b", index: 1, action: "B", status: "rendered", covered_by: { shot_id: "a", start_seconds: 3, end_seconds: 8 } }
    ];
    board.document = JSON.stringify(doc); await board.save();
    const result = await finishStoryboard.impl(run(), { storyboardId: board.id, expectedStoryboardRevision: board.revision }) as { timelineId: string };
    const clips = (await TimelineSequence.findById(result.timelineId))!.toDocument().clips;
    expect(clips.filter((clip) => clip.storyboardShotId === "b")).toEqual(expect.arrayContaining([
      expect.objectContaining({ mediaType: "video", currentAssetId: asset.id, inPointMs: 3000, outPointMs: 8000 }),
      expect.objectContaining({ mediaType: "audio", currentAssetId: asset.id, inPointMs: 3000, outPointMs: 8000 })
    ]));
  });
  it("measures source bytes before preview and finishing when the video ref lacks duration", async () => {
    const { board, asset } = await fixture();
    asset.content_type = "video/mp4"; await asset.save();
    const doc = board.toDocument();
    doc.shots = [{ type: "shot", id: "a", index: 0, action: "A", status: "rendered", clip: { type: "video", asset_id: asset.id }, duration_seconds: 1.5 }];
    board.document = JSON.stringify(doc); await board.save();
    const bytes = new Uint8Array(116);
    const view = new DataView(bytes.buffer);
    view.setUint32(0, 116); bytes.set(new TextEncoder().encode("moov"), 4);
    view.setUint32(8, 108); bytes.set(new TextEncoder().encode("mvhd"), 12);
    view.setUint32(28, 1000); view.setUint32(32, 5184);
    const measuredRun = createCapabilityRun({ context: { userId: "u1", resolveAssetBytes: async () => ({ bytes }) } as unknown as ProcessingContext, gate: UNGATED });
    const preview = await previewStoryboardDesign.impl(measuredRun, { storyboardId: board.id, expectedStoryboardRevision: board.revision }) as { timeline: { data: { durationMs: number } } };
    expect(preview.timeline.data.durationMs).toBe(5184);
    const result = await finishStoryboard.impl(measuredRun, { storyboardId: board.id, expectedStoryboardRevision: board.revision }) as { timelineId: string };
    expect((await TimelineSequence.findById(result.timelineId))!.toDocument().clips.map((clip) => clip.durationMs)).toEqual([5184, 5184]);
  });
  it("binds linked script finishing to the script fingerprint returned by preview", async () => {
    const { board } = await fixture();
    const script = await Script.create<Script>({ user_id: "u1", project_id: "default", name: "Words", document: JSON.stringify({ cast: [], sections: [] }) });
    const doc = board.toDocument();
    doc.screenplay = { type: "screenplay", id: "play", title: "", shots: doc.shots, script_id: script.id };
    board.document = JSON.stringify(doc); await board.save();
    const preview = await previewStoryboardDesign.impl(run(), { storyboardId: board.id, expectedStoryboardRevision: board.revision }) as { linkedScriptFingerprint: string };
    expect(preview.linkedScriptFingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(await finishStoryboard.impl(run(), { storyboardId: board.id, expectedStoryboardRevision: board.revision })).toHaveProperty("error", "Linked script changed or has not been reviewed. Refresh the design preview before finishing.");
    script.document = JSON.stringify({ cast: [], sections: [{ id: "changed", lines: [] }] }); await script.save();
    expect(await finishStoryboard.impl(run(), { storyboardId: board.id, expectedStoryboardRevision: board.revision, expectedLinkedScriptFingerprint: preview.linkedScriptFingerprint })).toHaveProperty("error", "Linked script changed or has not been reviewed. Refresh the design preview before finishing.");
    expect(await TimelineSequence.listByUser("u1")).toHaveLength(0);
    const refreshed = await previewStoryboardDesign.impl(run(), { storyboardId: board.id, expectedStoryboardRevision: board.revision }) as { linkedScriptFingerprint: string };
    expect(await finishStoryboard.impl(run(), { storyboardId: board.id, expectedStoryboardRevision: board.revision, expectedLinkedScriptFingerprint: refreshed.linkedScriptFingerprint })).toHaveProperty("status", "unreviewed_draft");
  });
  it.each(["owned", "ambiguous", "foreign"])("resolves protected short assets only when uniquely owned: %s", async (kind) => {
    const { board, asset } = await fixture();
    const prefix = asset.id.slice(0, 12);
    if (kind === "ambiguous") await Asset.create<Asset>({ id: prefix + "0".repeat(20), user_id: "u1", content_type: "image/png", name: "Other" });
    if (kind === "foreign") { asset.user_id = "other"; await asset.save(); }
    const doc = board.toDocument(); doc.shots[0].production!.protected_inputs![0].asset_id = prefix; board.document = JSON.stringify(doc); await board.save();
    const result = await finishStoryboard.impl(run(), { storyboardId: board.id, expectedStoryboardRevision: board.revision }) as { timelineId?: string };
    if (kind === "owned") expect(JSON.parse((await TimelineSequence.findById(result.timelineId!))!.document).clips[0].currentAssetId).toBe(asset.id);
    else { expect(result).toHaveProperty("error"); expect((await Storyboard.findById(board.id))!.timeline_id).toBeFalsy(); }
  });
  it.each([false, true])("preserves persisted metadata and rejects unsupported camera before atomic writes: %s", async (withCamera) => {
    const { board } = await fixture();
    const first = await finishStoryboard.impl(run(), { storyboardId: board.id, expectedStoryboardRevision: board.revision }) as { timelineId: string };
    const savedBoard = (await Storyboard.findById(board.id))!;
    const timeline = (await TimelineSequence.findById(first.timelineId))!;
    const metadata = {
      tempo: { bpm: 87, offsetMs: 12, timeSignature: { beatsPerBar: 3, beatUnit: 4 } },
      transcript: [{ id: "line", text: "Manual notes", beatStartMs: 0, clipIds: [] }],
      trackFolders: [{ id: "folder", name: "Manual folder" }],
      setup: { stage: "done" as const, brief: "Manual brief" },
      scriptEnabled: false,
      camera2d: withCamera ? { position: { x: 12, y: 0 }, depthPx: 0, focalLengthPx: 1000 } : null
    };
    await TimelineSequence.updateDocumentIfUnchanged(timeline.id, timeline.updated_at, { ...timeline.toDocument(), ...metadata });
    const latest = (await TimelineSequence.findById(timeline.id))!;
    const result = await finishStoryboard.impl(run(), { storyboardId: board.id, expectedStoryboardRevision: savedBoard.revision, expectedTimelineRevision: latest.revision });
    const actual = (await TimelineSequence.findById(timeline.id))!;
    expect(actual.toDocument()).toMatchObject(metadata);
    if (withCamera) {
      expect(result).toHaveProperty("error");
      expect(result).toHaveProperty("validation", expect.arrayContaining([expect.objectContaining({ code: "manual_conflict" })]));
      expect(actual.document).toBe(latest.document);
      expect(actual.revision).toBe(latest.revision);
      expect((await Storyboard.findById(board.id))!.revision).toBe(savedBoard.revision);
    } else {
      expect(result).toHaveProperty("validation", []);
      expect(actual.revision).toBe(latest.revision + 1);
    }
  });
  it("rejects stale board revisions and foreign ownership without writes", async () => {
    const { board } = await fixture();
    expect(await finishStoryboard.impl(run(), { storyboardId: board.id, expectedStoryboardRevision: board.revision + 1 })).toEqual({ error: "Storyboard revision conflict." });
    expect(await finishStoryboard.impl(run("foreign"), { storyboardId: board.id, expectedStoryboardRevision: board.revision })).toEqual({ error: "Storyboard was not found." });
    expect((await Storyboard.findById(board.id))!.timeline_id).toBeFalsy();
  });
  it("rejects deletion of a previously materialized product without writes", async () => {
    const { board } = await fixture();
    const first = await finishStoryboard.impl(run(), { storyboardId: board.id, expectedStoryboardRevision: board.revision }) as { timelineId: string };
    const savedBoard = (await Storyboard.findById(board.id))!;
    const timeline = (await TimelineSequence.findById(first.timelineId))!;
    const document = timeline.toDocument(); document.clips = [];
    await TimelineSequence.updateDocumentIfUnchanged(timeline.id, timeline.updated_at, document);
    const latest = (await TimelineSequence.findById(timeline.id))!;
    const result = await finishStoryboard.impl(run(), { storyboardId: board.id, expectedStoryboardRevision: savedBoard.revision, expectedTimelineRevision: latest.revision });
    expect(result).toHaveProperty("error");
    expect((await Storyboard.findById(board.id))!.revision).toBe(savedBoard.revision);
    expect((await TimelineSequence.findById(timeline.id))!.toDocument().clips).toEqual([]);
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

  it("resolves genuine short entity-only graphics references without changing the storyboard", async () => {
    const { board, asset } = await fixture();
    asset.metadata = { nodetool_entity: { kind: "prop", name: "Product", descriptor: "Original product" } };
    await asset.save();
    const document = board.toDocument();
    delete document.shots[0].production;
    document.shots[0].graphics!.elements = [{ id: "product", kind: "asset", role: "product", entity_id: asset.id.slice(0, 12) }];
    board.document = JSON.stringify(document); await board.save();
    const original = board.document;
    const result = await finishStoryboard.impl(run(), { storyboardId: board.id, expectedStoryboardRevision: board.revision }) as { timelineId: string };
    expect(result).toHaveProperty("validation", []);
    expect(JSON.parse((await TimelineSequence.findById(result.timelineId))!.document).clips[0].currentAssetId).toBe(asset.id);
    expect((await Storyboard.findById(board.id))!.document).toBe(original);
  });
  it.each(["ordinary", "foreign-reference"])("rejects %s entity references before writes", async (kind) => {
    const { board, asset } = await fixture();
    if (kind === "foreign-reference") {
      const foreign = await Asset.create<Asset>({ user_id: "foreign", name: "Other", content_type: "image/png" });
      asset.metadata = { nodetool_entity: { kind: "prop", name: "Product", descriptor: "Product", reference_asset_id: foreign.id } };
      await asset.save();
    }
    const document = board.toDocument(); delete document.shots[0].production;
    document.shots[0].graphics!.elements = [{ id: "product", kind: "asset", entity_id: asset.id }];
    board.document = JSON.stringify(document); await board.save();
    expect(await finishStoryboard.impl(run(), { storyboardId: board.id, expectedStoryboardRevision: board.revision })).toHaveProperty("error");
    expect((await Storyboard.findById(board.id))!.timeline_id).toBeFalsy();
  });

  it("ignores unused stale video under an explicit still strategy", async () => {
    const { board, asset } = await fixture();
    const document = board.toDocument();
    document.shots[0].keyframe = { type: "image", asset_id: asset.id };
    document.shots[0].clip = { type: "video", asset_id: "missing-stale-video" };
    board.document = JSON.stringify(document); await board.save();
    const result = await finishStoryboard.impl(run(), { storyboardId: board.id, expectedStoryboardRevision: board.revision });
    expect(result).toHaveProperty("validation", []);
  });
  it("rejects an unavailable video when policy selects generated video", async () => {
    const { board, asset } = await fixture();
    const document = board.toDocument();
    document.shots[0].production!.media_strategy = "generated_video";
    document.shots[0].keyframe = { type: "image", asset_id: asset.id };
    document.shots[0].clip = { type: "video", asset_id: "missing-selected-video" };
    board.document = JSON.stringify(document); await board.save();
    expect(await finishStoryboard.impl(run(), { storyboardId: board.id, expectedStoryboardRevision: board.revision })).toHaveProperty("error");
    expect((await Storyboard.findById(board.id))!.timeline_id).toBeFalsy();
  });

});


describe("finishing source MIME contracts", () => {
  beforeEach(() => initTestDb());
  it.each(["graphics", "still", "video"])("rejects wrong MIME for %s before provider dispatch or a save", async (kind) => {
    const { board, asset } = await fixture();
    asset.content_type = kind === "video" ? "image/png" : "video/mp4"; await asset.save();
    const document = board.toDocument();
    if (kind === "still") document.shots[0].keyframe = { type: "image", asset_id: asset.id };
    if (kind === "video") { document.shots[0].production = { media_strategy: "generated_video" }; document.shots[0].graphics = undefined; document.shots[0].clip = { type: "video", asset_id: asset.id }; }
    board.document = JSON.stringify(document); await board.save();
    expect(await finishStoryboard.impl(run(), { storyboardId: board.id, expectedStoryboardRevision: board.revision })).toMatchObject({ error: expect.stringMatching(/must be an image|must be a video/) });
    expect(await previewStoryboardDesign.impl(run(), { storyboardId: board.id, expectedStoryboardRevision: board.revision })).toHaveProperty("error");
    expect(await TimelineSequence.listByUser("u1")).toHaveLength(0);
  });
});

describe("preview_storyboard_design", () => {
  beforeEach(() => initTestDb());
  it("returns a fully shaped inline Timeline envelope without saving or dispatching a provider", async () => {
    const { board, asset } = await fixture();
    const result = await previewStoryboardDesign.impl(run(), { storyboardId: board.id.slice(0, 12), expectedStoryboardRevision: board.revision }) as { timeline: { type: string; data: { id: string; width: number; height: number; fps: number; clips: { currentAssetId: string; storyboardElementId: string }[] } }; storyboardRevision: number; validation: unknown[] };
    expect(result).toMatchObject({ storyboardRevision: board.revision, validation: [], timeline: { type: "timeline", data: { id: board.id, width: 1080, height: 1920, fps: 30 } } });
    expect(result.timeline).not.toHaveProperty("id");
    expect(result.timeline.data.clips[0]).toMatchObject({ currentAssetId: asset.id, storyboardElementId: "product" });
    expect(await TimelineSequence.listByUser("u1")).toHaveLength(0);
    expect((await Storyboard.findById(board.id))!.revision).toBe(board.revision);
    expect((await Storyboard.findById(board.id))!.timeline_id).toBeFalsy();
  });
  it("rejects stale/foreign boards and inaccessible assets instead of returning an unconstrained preview", async () => {
    const { board, asset } = await fixture();
    expect(await previewStoryboardDesign.impl(run(), { storyboardId: board.id, expectedStoryboardRevision: board.revision + 1 })).toHaveProperty("error");
    expect(await previewStoryboardDesign.impl(run("foreign"), { storyboardId: board.id, expectedStoryboardRevision: board.revision })).toHaveProperty("error");
    asset.user_id = "foreign"; await asset.save();
    expect(await previewStoryboardDesign.impl(run(), { storyboardId: board.id, expectedStoryboardRevision: board.revision })).toHaveProperty("error");
    expect(await TimelineSequence.listByUser("u1")).toHaveLength(0);
  });
});
