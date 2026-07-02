/**
 * TimelineDemoEngine determinism: seeking to a time must make the timeline
 * stores reflect exactly the events up to that time, regardless of seek
 * direction (mirrors the workflow DemoEngine's contract).
 */
import { makeSequence, makeTrack, makeClip } from "@nodetool-ai/timeline";
import { TimelineDemoEngine, seedTimelineCastAssets } from "../timelineReplay";
import { useAssetStore } from "../../../stores/AssetStore";
import type { TimelineCastEvent, TimelineDemoCast } from "../timelineCastTypes";

const videoTrackId = "track-video";
const clipAId = "clip-a";
const clipBId = "clip-b";

const clipA = makeClip({
  id: clipAId,
  trackId: videoTrackId,
  name: "A",
  startMs: 0,
  durationMs: 4000,
  mediaType: "video",
  status: "generated",
});

function buildCast(events: TimelineCastEvent[]): TimelineDemoCast {
  return {
    version: 1,
    kind: "timeline",
    id: "timeline-test",
    name: "Test",
    createdAt: "2026-01-01T00:00:00Z",
    durationMs: 5000,
    fps: 30,
    sequence: makeSequence({
      id: "seq-test",
      tracks: [makeTrack({ id: videoTrackId, type: "video" })],
      clips: [clipA],
    }),
    assets: [],
    events,
  };
}

describe("TimelineDemoEngine", () => {
  let engine: TimelineDemoEngine;

  afterEach(() => {
    engine?.dispose();
  });

  it("seeds the instance with the cast's starting sequence", () => {
    engine = new TimelineDemoEngine(buildCast([]));
    engine.seekToTime(0);
    expect(engine.instance.doc.getState().clips.map((c) => c.id)).toEqual([clipAId]);
  });

  it("applies addClip / patchClip / select / zoom events up to the given time", () => {
    const clipB = makeClip({
      id: clipBId,
      trackId: videoTrackId,
      name: "B",
      startMs: 4000,
      durationMs: 2000,
      mediaType: "image",
      status: "generated",
    });
    engine = new TimelineDemoEngine(
      buildCast([
        { t: 1000, payload: { kind: "select", clipIds: [clipAId] } },
        { t: 2000, payload: { kind: "patchClip", clipId: clipAId, patch: { durationMs: 3000 } } },
        { t: 3000, payload: { kind: "addClip", clip: clipB } },
        { t: 4000, payload: { kind: "zoom", msPerPx: 12 } },
      ])
    );

    engine.seekToTime(1500);
    expect(engine.instance.ui.getState().selectedClipIds.has(clipAId)).toBe(true);
    expect(engine.instance.doc.getState().clips).toHaveLength(1);

    engine.seekToTime(2500);
    expect(
      engine.instance.doc.getState().clips.find((c) => c.id === clipAId)?.durationMs
    ).toBe(3000);

    engine.seekToTime(3500);
    expect(engine.instance.doc.getState().clips.map((c) => c.id).sort()).toEqual(
      [clipAId, clipBId].sort()
    );

    engine.seekToTime(4500);
    expect(engine.instance.ui.getState().msPerPx).toBe(12);
  });

  it("ramps the playhead smoothly across a playRange event", () => {
    engine = new TimelineDemoEngine(
      buildCast([{ t: 1000, payload: { kind: "playRange", fromMs: 0, toMs: 4000, rampMs: 2000 } }])
    );

    engine.seekToTime(2000); // 1000ms into a 2000ms ramp → halfway
    expect(engine.instance.playback.getState().currentTimeMs).toBeCloseTo(2000);

    engine.seekToTime(3000); // ramp complete
    expect(engine.instance.playback.getState().currentTimeMs).toBeCloseTo(4000);
  });

  it("is a pure function of time across a backward seek", () => {
    engine = new TimelineDemoEngine(
      buildCast([{ t: 1000, payload: { kind: "select", clipIds: [clipAId] } }])
    );

    engine.seekToTime(1500);
    expect(engine.instance.ui.getState().selectedClipIds.has(clipAId)).toBe(true);

    engine.seekToTime(0);
    expect(engine.instance.ui.getState().selectedClipIds.size).toBe(0);

    engine.seekToTime(1500);
    expect(engine.instance.ui.getState().selectedClipIds.has(clipAId)).toBe(true);
  });
});

describe("seedTimelineCastAssets", () => {
  it("resolves a seeded asset id to its inline data URI", async () => {
    seedTimelineCastAssets([
      { key: "inline-asset-1", dataUri: "data:image/png;base64,AAA", contentType: "image/png" },
    ]);

    const asset = await useAssetStore.getState().get("inline-asset-1");
    expect(asset.get_url).toBe("data:image/png;base64,AAA");
  });
});
