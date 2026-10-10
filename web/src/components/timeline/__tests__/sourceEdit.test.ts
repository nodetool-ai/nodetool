import { createTimelineStore } from "../../../stores/timeline/TimelineStore";
import { createTimelineUIStore } from "../../../stores/timeline/TimelineUIStore";
import type { Asset } from "../../../stores/ApiTypes";
import { performSourceEdit, sourceRangeFor, sourceTargetTrackId } from "../sourceEdit";
import { DEFAULT_MEDIA_CLIP_DURATION_MS, makeClip } from "@nodetool-ai/timeline";

const videoAsset = {
  id: "asset-1",
  name: "shot.mp4",
  content_type: "video/mp4",
  duration: 10,
  metadata: null
} as unknown as Asset;

function setup() {
  const doc = createTimelineStore();
  const ui = createTimelineUIStore();
  doc.getState().addTrack("video", "V1");
  doc.getState().addTrack("audio", "A1");
  const v1 = doc.getState().tracks[0].id;
  doc.getState().addClips([
    makeClip({ trackId: v1, mediaType: "video", startMs: 0, durationMs: 4000, status: "generated" }),
    makeClip({ trackId: v1, mediaType: "video", startMs: 4000, durationMs: 2000, status: "generated" })
  ]);
  return { doc, ui, v1 };
}

describe("sourceRangeFor", () => {
  it("defaults to the whole asset and clamps a reversed range", () => {
    expect(sourceRangeFor(videoAsset, null)).toEqual({ inMs: 0, outMs: 10000 });
    expect(sourceRangeFor(videoAsset, { assetId: "asset-1", inMs: 3000, outMs: 1000 })).toEqual({ inMs: 3000, outMs: 3000 });
  });
});

describe("sourceRangeFor ownership", () => {
  it("ignores a range marked on another asset", () => {
    expect(
      sourceRangeFor(videoAsset, { assetId: "other", inMs: 2000, outMs: 3000 })
    ).toEqual({ inMs: 0, outMs: 10000 });
  });
});

describe("performSourceEdit", () => {
  it("an image with no marked range gets the default clip length", () => {
    const { doc, ui } = setup();
    const imageAsset = {
      id: "img-1",
      name: "still.png",
      content_type: "image/png",
      duration: null,
      metadata: null
    } as unknown as Asset;
    const id = performSourceEdit("append", { doc: doc.getState(), ui: ui.getState(), playheadMs: 0, asset: imageAsset });
    const clip = doc.getState().clips.find((c) => c.id === id)!;
    expect(clip.durationMs).toBe(DEFAULT_MEDIA_CLIP_DURATION_MS);
  });

  it("does not apply another asset's marks", () => {
    const { doc, ui } = setup();
    ui.getState().setSourceRange({ assetId: "other", inMs: 1000, outMs: 1500 });
    const id = performSourceEdit("append", { doc: doc.getState(), ui: ui.getState(), playheadMs: 0, asset: videoAsset });
    expect(doc.getState().clips.find((c) => c.id === id)!.durationMs).toBe(10000);
  });

  it("append lands after the last clip on the first compatible unlocked track", () => {
    const { doc, ui, v1 } = setup();
    ui.getState().setSourceRange({ assetId: "asset-1", inMs: 1000, outMs: 3500 });
    const id = performSourceEdit("append", { doc: doc.getState(), ui: ui.getState(), playheadMs: 500, asset: videoAsset });
    const clip = doc.getState().clips.find((c) => c.id === id)!;
    expect(sourceTargetTrackId(doc.getState(), videoAsset)).toBe(v1);
    expect(clip.trackId).toBe(v1);
    expect(clip.startMs).toBe(6000);
    expect(clip.inPointMs).toBe(1000);
    expect(clip.outPointMs).toBe(3500);
    expect(clip.durationMs).toBe(2500);
  });

  it("insert at the playhead pushes later clips right", () => {
    const { doc, ui } = setup();
    ui.getState().setSourceRange({ assetId: "asset-1", inMs: 0, outMs: 1000 });
    const id = performSourceEdit("insert", { doc: doc.getState(), ui: ui.getState(), playheadMs: 4000, asset: videoAsset });
    const clips = doc.getState().clips;
    expect(clips.find((c) => c.id === id)!.startMs).toBe(4000);
    expect(clips.find((c) => c.startMs === 5000)!.durationMs).toBe(2000);
  });

  it("overwrite at the playhead trims what it covers", () => {
    const { doc, ui } = setup();
    ui.getState().setSourceRange({ assetId: "asset-1", inMs: 0, outMs: 1000 });
    performSourceEdit("overwrite", { doc: doc.getState(), ui: ui.getState(), playheadMs: 3500, asset: videoAsset });
    const clips = doc.getState().clips.sort((a, b) => a.startMs - b.startMs);
    expect(clips.map((c) => [c.startMs, c.durationMs])).toEqual([
      [0, 3500],
      [3500, 1000],
      [4500, 1500]
    ]);
  });

  it("returns null without an asset or a track", () => {
    const { doc, ui } = setup();
    expect(performSourceEdit("append", { doc: doc.getState(), ui: ui.getState(), playheadMs: 0, asset: undefined })).toBeNull();
    doc.getState().setTrackLocked(doc.getState().tracks[0].id, true);
    expect(performSourceEdit("append", { doc: doc.getState(), ui: ui.getState(), playheadMs: 0, asset: videoAsset })).toBeNull();
  });
});
