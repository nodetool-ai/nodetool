/**
 * `list_tracks`/`delete_track_object`/`bind_to_track`/`unbind_track` through
 * `applyTimelineOp` (P0 AI Video, Phase 2). Also covers `split_clip` and
 * `trim_clip` reslicing a matching `MediaTrack`.
 */

import { describe, expect, it } from "vitest";
import { applyTimelineOp } from "../src/ops/apply.js";
import type { TimelineOpContext, TimelineOpState } from "../src/ops/types.js";
import { makeClip, makeTrack } from "../src/index.js";
import type { MediaTrack, TimelineClip, TimelineTrack } from "../src/types.js";

function context(): TimelineOpContext {
  let n = 0;
  return { newId: (kind) => `${kind}_${++n}` };
}

function state(
  clips: TimelineClip[],
  mediaTracks: MediaTrack[] = [],
  tracks: TimelineTrack[] = [
    makeTrack({ id: "track_v", type: "video", name: "Video 1", index: 0 })
  ]
): TimelineOpState {
  return {
    fps: 30,
    width: 1920,
    height: 1080,
    tracks,
    clips,
    markers: [],
    mediaTracks,
    playheadMs: 0,
    selectedClipIds: []
  };
}

function videoClip(overrides: Partial<TimelineClip> = {}): TimelineClip {
  return makeClip({
    id: "clip_1",
    trackId: "track_v",
    name: "Product shot",
    startMs: 0,
    durationMs: 4000,
    mediaType: "video",
    sourceType: "imported",
    currentAssetId: "asset_1",
    ...overrides
  });
}

function mediaTrack(overrides: Partial<MediaTrack> = {}): MediaTrack {
  return {
    id: "track_media_1",
    clipId: "clip_1",
    sourceAssetId: "asset_1",
    name: "Product",
    kind: "box",
    sourceStartMs: 0,
    sourceEndMs: 4000,
    samples: [
      { sourceMs: 0, x: 0.1, y: 0.1, width: 0.2, height: 0.2 },
      { sourceMs: 2000, x: 0.4, y: 0.4, width: 0.2, height: 0.2 },
      { sourceMs: 4000, x: 0.7, y: 0.7, width: 0.2, height: 0.2 }
    ],
    status: "ready",
    ...overrides
  };
}

describe("list_tracks", () => {
  it("summarizes tracks and reframe state in get_state without sample arrays", async () => {
    const clip = videoClip({
      reframe: {
        mode: "track",
        trackId: "track_media_1",
        safeMargin: 0.1,
        samples: [{ sourceMs: 0, x: 0.5, y: 0.5 }],
        keyframes: [{ sourceMs: 1000, x: 0.6, y: 0.5 }]
      }
    });
    const out = await applyTimelineOp(
      state([clip], [mediaTrack()]),
      { op: "get_state" },
      context()
    );
    const result = out.result as {
      clips: Array<Record<string, unknown>>;
      mediaTracks: Array<Record<string, unknown>>;
    };
    expect(result.clips[0]?.reframe).toEqual({
      mode: "track",
      trackId: "track_media_1",
      safeMargin: 0.1,
      smoothing: undefined,
      sampleCount: 1,
      keyframeCount: 1
    });
    expect(result.mediaTracks[0]).toMatchObject({
      id: "track_media_1",
      sampleCount: 3
    });
    expect(result.mediaTracks[0]).not.toHaveProperty("samples");
  });

  it("lists every document track when no target is given, without samples", async () => {
    const out = await applyTimelineOp(
      state([videoClip()], [mediaTrack()]),
      { op: "list_tracks" },
      context()
    );
    expect(out.error).toBeUndefined();
    const result = out.result as { tracks: Array<Record<string, unknown>> };
    expect(result.tracks).toHaveLength(1);
    expect(result.tracks[0]).toMatchObject({
      id: "track_media_1",
      clipId: "clip_1",
      sampleCount: 3
    });
    expect(result.tracks[0]).not.toHaveProperty("samples");
  });

  it("filters to one clip's tracks by target", async () => {
    const other = videoClip({ id: "clip_2", name: "Other shot" });
    const out = await applyTimelineOp(
      state(
        [videoClip(), other],
        [mediaTrack(), mediaTrack({ id: "track_media_2", clipId: "clip_2" })]
      ),
      { op: "list_tracks", target: "clip_1" },
      context()
    );
    const result = out.result as { tracks: Array<{ id: string }> };
    expect(result.tracks.map((t) => t.id)).toEqual(["track_media_1"]);
  });
});

describe("delete_track_object", () => {
  it("removes the track and clears trackBinding on any clip referencing it", async () => {
    const follower = videoClip({
      id: "clip_2",
      name: "Caption",
      mediaType: "text",
      trackBinding: { trackId: "track_media_1", mode: "position" }
    });
    const out = await applyTimelineOp(
      state([videoClip(), follower], [mediaTrack()]),
      { op: "delete_track_object", trackId: "track_media_1" },
      context()
    );
    expect(out.error).toBeUndefined();
    expect(out.state.mediaTracks).toEqual([]);
    const clip2 = out.state.clips.find((c) => c.id === "clip_2");
    expect(clip2?.trackBinding).toBeUndefined();
  });

  it("refuses a missing track id", async () => {
    const out = await applyTimelineOp(
      state([videoClip()], [mediaTrack()]),
      { op: "delete_track_object", trackId: "nope" },
      context()
    );
    expect(out.error).toMatch(/no track/i);
  });
});

describe("bind_to_track", () => {
  it("sets trackBinding in position mode", async () => {
    const textClip = videoClip({
      id: "clip_2",
      name: "Caption",
      mediaType: "text"
    });
    const out = await applyTimelineOp(
      state([videoClip(), textClip], [mediaTrack()]),
      {
        op: "bind_to_track",
        target: "clip_2",
        trackId: "track_media_1",
        mode: "position",
        offset: { x: 10, y: -5 }
      },
      context()
    );
    expect(out.error).toBeUndefined();
    const clip2 = out.state.clips.find((c) => c.id === "clip_2");
    expect(clip2?.trackBinding).toEqual({
      trackId: "track_media_1",
      mode: "position",
      offset: { x: 10, y: -5 }
    });
  });

  it("refuses a mode that is not live yet", async () => {
    const textClip = videoClip({ id: "clip_2", mediaType: "text" });
    const out = await applyTimelineOp(
      state([videoClip(), textClip], [mediaTrack()]),
      {
        op: "bind_to_track",
        target: "clip_2",
        trackId: "track_media_1",
        mode: "mask"
      },
      context()
    );
    expect(out.error).toMatch(/not implemented/i);
  });

  it("refuses a track that does not exist", async () => {
    const textClip = videoClip({ id: "clip_2", mediaType: "text" });
    const out = await applyTimelineOp(
      state([videoClip(), textClip], []),
      {
        op: "bind_to_track",
        target: "clip_2",
        trackId: "nope",
        mode: "position"
      },
      context()
    );
    expect(out.error).toMatch(/no track/i);
  });
});

describe("unbind_track", () => {
  it("clears trackBinding", async () => {
    const textClip = videoClip({
      id: "clip_2",
      mediaType: "text",
      trackBinding: { trackId: "track_media_1", mode: "position" }
    });
    const out = await applyTimelineOp(
      state([videoClip(), textClip], [mediaTrack()]),
      { op: "unbind_track", target: "clip_2" },
      context()
    );
    expect(out.error).toBeUndefined();
    const clip2 = out.state.clips.find((c) => c.id === "clip_2");
    expect(clip2?.trackBinding).toBeUndefined();
  });

  it("is a no-op on an already-unbound clip", async () => {
    const textClip = videoClip({ id: "clip_2", mediaType: "text" });
    const out = await applyTimelineOp(
      state([videoClip(), textClip], []),
      { op: "unbind_track", target: "clip_2" },
      context()
    );
    expect(out.error).toBeUndefined();
  });
});

describe("trim_clip reslices a matching MediaTrack", () => {
  it("narrows the track's window and samples to the trimmed clip", async () => {
    const out = await applyTimelineOp(
      state([videoClip()], [mediaTrack()]),
      { op: "trim_clip", target: "clip_1", durationMs: 2000 },
      context()
    );
    expect(out.error).toBeUndefined();
    const track = out.state.mediaTracks?.find((t) => t.clipId === "clip_1");
    expect(track).toBeDefined();
    expect(track!.sourceEndMs).toBeLessThanOrEqual(2000);
    expect(track!.samples.every((s) => s.sourceMs <= track!.sourceEndMs)).toBe(
      true
    );
  });
});

describe("split_clip gives each half its own resliced track", () => {
  it("creates two tracks with fresh ids, each owning one half's clipId", async () => {
    const out = await applyTimelineOp(
      state([videoClip()], [mediaTrack()]),
      { op: "split_clip", target: "clip_1", atMs: 2000 },
      context()
    );
    expect(out.error).toBeUndefined();
    const clipIds = out.state.clips.map((c) => c.id);
    expect(clipIds).toHaveLength(2);
    const tracks = out.state.mediaTracks ?? [];
    expect(tracks).toHaveLength(2);
    expect(new Set(tracks.map((t) => t.id)).size).toBe(2);
    expect(tracks.map((t) => t.clipId).sort()).toEqual([...clipIds].sort());
  });
});
