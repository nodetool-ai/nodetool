import { makeClip, makeTrack } from "@nodetool-ai/timeline";
import type { TimelineClip, TimelineTrack } from "@nodetool-ai/timeline";

import {
  clipSourceTimeSec,
  computeActiveLayers,
  effectiveAssetId,
  isClipActive,
  resolveCaptionAtTime,
  trackZ,
  transitionOpacity,
  LAYER_Z_BASE
} from "../sceneModel";

const clip = (overrides: Partial<TimelineClip>): TimelineClip =>
  makeClip({
    status: "generated",
    currentAssetId: "asset-1",
    mediaType: "video",
    durationMs: 1000,
    ...overrides
  });

const track = (overrides: Partial<TimelineTrack>): TimelineTrack =>
  makeTrack({ type: "video", visible: true, ...overrides });

describe("isClipActive", () => {
  const c = clip({ startMs: 100, durationMs: 400 });
  it("is active at start, inactive at end (half-open interval)", () => {
    expect(isClipActive(c, 99)).toBe(false);
    expect(isClipActive(c, 100)).toBe(true);
    expect(isClipActive(c, 499)).toBe(true);
    expect(isClipActive(c, 500)).toBe(false);
  });
});

describe("transitionOpacity", () => {
  it("returns 1 with no transition", () => {
    expect(transitionOpacity(clip({ startMs: 0 }), 50)).toBe(1);
  });
  it("ramps 0→1 across the crossfade window", () => {
    const c = clip({
      startMs: 0,
      transitionIn: { type: "crossfade", durationMs: 200 }
    });
    expect(transitionOpacity(c, 0)).toBe(0);
    expect(transitionOpacity(c, 100)).toBeCloseTo(0.5);
    expect(transitionOpacity(c, 200)).toBe(1);
    expect(transitionOpacity(c, 500)).toBe(1);
  });
});

describe("effectiveAssetId", () => {
  it("returns currentAssetId for rendered statuses", () => {
    for (const status of ["generated", "stale", "locked", "generating"] as const) {
      expect(effectiveAssetId(clip({ status, currentAssetId: "a" }))).toBe("a");
    }
  });
  it("returns undefined for draft/failed clips", () => {
    expect(effectiveAssetId(clip({ status: "draft" }))).toBeUndefined();
  });
});

describe("clipSourceTimeSec", () => {
  it("offsets by in-point and timeline position", () => {
    const c = clip({ startMs: 1000, inPointMs: 500 });
    expect(clipSourceTimeSec(c, 1000)).toBeCloseTo(0.5);
    expect(clipSourceTimeSec(c, 2000)).toBeCloseTo(1.5);
  });
  it("applies speed multiplier unless baked", () => {
    const fast = clip({ startMs: 0, speedMultiplier: 2 });
    expect(clipSourceTimeSec(fast, 1000)).toBeCloseTo(2);
    const baked = clip({ startMs: 0, speedMultiplier: 2, speedBaked: true });
    expect(clipSourceTimeSec(baked, 1000)).toBeCloseTo(1);
  });
});

describe("trackZ", () => {
  it("inverts the UI index so the top track composites last", () => {
    expect(trackZ(0)).toBe(LAYER_Z_BASE);
    expect(trackZ(2)).toBeLessThan(trackZ(0));
  });
});

describe("computeActiveLayers", () => {
  it("excludes audio clips, subtitle tracks, and hidden tracks", () => {
    const tracks = [
      track({ id: "v", index: 0, type: "video" }),
      track({ id: "sub", index: 1, type: "subtitle" }),
      track({ id: "hidden", index: 2, type: "video", visible: false })
    ];
    const clips = [
      clip({ id: "vid", trackId: "v", startMs: 0, durationMs: 1000 }),
      clip({ id: "aud", trackId: "v", startMs: 0, durationMs: 1000, mediaType: "audio" }),
      clip({ id: "subc", trackId: "sub", startMs: 0, durationMs: 1000 }),
      clip({ id: "hid", trackId: "hidden", startMs: 0, durationMs: 1000 })
    ];
    const layers = computeActiveLayers(tracks, clips, 100);
    expect(layers.map((l) => l.clipId)).toEqual(["vid"]);
  });

  it("orders layers bottom track first (ascending track index)", () => {
    const tracks = [
      track({ id: "top", index: 0 }),
      track({ id: "bottom", index: 1 })
    ];
    const clips = [
      clip({ id: "topClip", trackId: "top", startMs: 0, durationMs: 1000 }),
      clip({ id: "bottomClip", trackId: "bottom", startMs: 0, durationMs: 1000 })
    ];
    const layers = computeActiveLayers(tracks, clips, 100);
    expect(layers.map((l) => l.clipId)).toEqual(["topClip", "bottomClip"]);
    // The top UI track must blend last (highest z).
    const top = layers.find((l) => l.clipId === "topClip")!;
    const bottom = layers.find((l) => l.clipId === "bottomClip")!;
    expect(trackZ(top.trackIndex)).toBeGreaterThan(trackZ(bottom.trackIndex));
  });

  it("classifies image vs video and folds in opacity + transition", () => {
    const tracks = [track({ id: "v", index: 0 })];
    const clips = [
      clip({
        id: "img",
        trackId: "v",
        startMs: 0,
        durationMs: 1000,
        mediaType: "image",
        opacity: 0.5,
        transitionIn: { type: "crossfade", durationMs: 200 }
      })
    ];
    const layers = computeActiveLayers(tracks, clips, 100);
    expect(layers).toHaveLength(1);
    expect(layers[0].kind).toBe("image");
    // base 0.5 * transition 0.5 (halfway through 200ms window) = 0.25
    expect(layers[0].opacity).toBeCloseTo(0.25);
  });

  it("caps simultaneous video layers", () => {
    const tracks = Array.from({ length: 12 }, (_, i) =>
      track({ id: `t${i}`, index: i })
    );
    const clips = tracks.map((t) =>
      clip({ id: `c-${t.id}`, trackId: t.id, startMs: 0, durationMs: 1000 })
    );
    expect(computeActiveLayers(tracks, clips, 100, { maxVideoLayers: 8 })).toHaveLength(8);
  });

  it("does not cap image layers", () => {
    const tracks = Array.from({ length: 12 }, (_, i) =>
      track({ id: `t${i}`, index: i })
    );
    const clips = tracks.map((t) =>
      clip({
        id: `c-${t.id}`,
        trackId: t.id,
        startMs: 0,
        durationMs: 1000,
        mediaType: "image"
      })
    );
    expect(computeActiveLayers(tracks, clips, 100, { maxVideoLayers: 8 })).toHaveLength(12);
  });

  it("carries the unrendered assetId as undefined for draft clips", () => {
    const tracks = [track({ id: "v", index: 0 })];
    const clips = [
      clip({ id: "draft", trackId: "v", startMs: 0, durationMs: 1000, status: "draft" })
    ];
    const layers = computeActiveLayers(tracks, clips, 100);
    expect(layers[0].assetId).toBeUndefined();
  });

  it("emits a caption layer for a caption clip on a subtitle track", () => {
    const tracks = [
      track({ id: "v", index: 1, type: "video" }),
      track({ id: "sub", index: 0, type: "subtitle" })
    ];
    const clips = [
      clip({ id: "vid", trackId: "v", startMs: 0, durationMs: 1000 }),
      clip({
        id: "cap",
        trackId: "sub",
        startMs: 0,
        durationMs: 1000,
        caption: {
          words: [
            { word: "hello", startMs: 0, endMs: 300 },
            { word: "world", startMs: 300, endMs: 600 }
          ]
        }
      })
    ];
    const layers = computeActiveLayers(tracks, clips, 100);
    const captionLayer = layers.find((l) => l.kind === "caption");
    expect(captionLayer).toBeDefined();
    expect(captionLayer!.clipId).toBe("cap");
    expect(captionLayer!.assetId).toBeUndefined();
    // Subtitle track is at index 0 → composites on top of the video at index 1.
    const videoLayer = layers.find((l) => l.kind === "video")!;
    expect(trackZ(captionLayer!.trackIndex)).toBeGreaterThan(
      trackZ(videoLayer.trackIndex)
    );
    // At 100ms the first word is active, the second is not.
    expect(captionLayer!.caption!.words).toEqual([
      { text: "hello", active: true },
      { text: "world", active: false }
    ]);
  });
});

describe("resolveCaptionAtTime", () => {
  it("returns undefined for clips without a caption", () => {
    expect(resolveCaptionAtTime(clip({ startMs: 0 }), 0)).toBeUndefined();
  });

  it("marks the spoken word active using clip-local time", () => {
    const c = clip({
      startMs: 1000,
      caption: {
        words: [
          { word: "a", startMs: 0, endMs: 200 },
          { word: "b", startMs: 200, endMs: 400 }
        ]
      }
    });
    // Playhead at 1100ms → 100ms into the clip → first word active.
    expect(resolveCaptionAtTime(c, 1100)!.words).toEqual([
      { text: "a", active: true },
      { text: "b", active: false }
    ]);
    // Playhead at 1300ms → 300ms in → second word active.
    expect(resolveCaptionAtTime(c, 1300)!.words).toEqual([
      { text: "a", active: false },
      { text: "b", active: true }
    ]);
  });
});
