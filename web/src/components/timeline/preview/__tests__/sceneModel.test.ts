import { makeClip, makeTrack } from "@nodetool-ai/timeline";
import type { TimelineClip, TimelineTrack } from "@nodetool-ai/timeline";

import {
  clipSourceTimeSec,
  computeActiveLayers,
  crossfadeOpacity,
  effectiveAssetId,
  isClipActive,
  resolveCaptionAtTime,
  trackZ,
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

describe("crossfadeOpacity", () => {
  it("is 1 for a lone clip with no transition and no overlap", () => {
    const c = clip({ startMs: 0 });
    expect(crossfadeOpacity(c, [c], 50)).toBe(1);
  });

  it("ramps 0→1 over an explicit crossfade window (no overlap needed)", () => {
    const c = clip({
      startMs: 0,
      transitionIn: { type: "crossfade", durationMs: 200 }
    });
    expect(crossfadeOpacity(c, [c], 0)).toBe(0);
    expect(crossfadeOpacity(c, [c], 100)).toBeCloseTo(0.5);
    expect(crossfadeOpacity(c, [c], 200)).toBe(1);
    expect(crossfadeOpacity(c, [c], 500)).toBe(1);
  });

  it("auto-crossfades the incoming clip across an overlap with a preceding clip", () => {
    // A [0,1000) and B [800,1800) overlap by 200ms; B has no explicit
    // transition, so the overlap length is the crossfade duration.
    const a = clip({ id: "a", startMs: 0, durationMs: 1000 });
    const b = clip({ id: "b", startMs: 800, durationMs: 1000 });
    const same = [a, b];
    expect(crossfadeOpacity(b, same, 800)).toBe(0);
    expect(crossfadeOpacity(b, same, 900)).toBeCloseTo(0.5);
    expect(crossfadeOpacity(b, same, 1000)).toBe(1);
    expect(crossfadeOpacity(b, same, 1500)).toBe(1);
    // The outgoing (bottom) clip stays fully opaque — the dissolve is the
    // incoming clip fading in on top.
    expect(crossfadeOpacity(a, same, 900)).toBe(1);
  });

  it("does not auto-crossfade when clips do not overlap", () => {
    const a = clip({ id: "a", startMs: 0, durationMs: 1000 });
    const b = clip({ id: "b", startMs: 2000, durationMs: 1000 });
    expect(crossfadeOpacity(b, [a, b], 2000)).toBe(1);
  });

  it("treats a zero-duration crossfade as an opt-out (hard cut) even when overlapping", () => {
    const a = clip({ id: "a", startMs: 0, durationMs: 1000 });
    const b = clip({
      id: "b",
      startMs: 800,
      durationMs: 1000,
      transitionIn: { type: "crossfade", durationMs: 0 }
    });
    const same = [a, b];
    expect(crossfadeOpacity(b, same, 800)).toBe(1);
    expect(crossfadeOpacity(b, same, 900)).toBe(1);
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

  it("emits a caption layer for a caption-only overlay clip and keeps it on top", () => {
    const tracks = [
      track({ id: "v", index: 0, type: "video" }),
      track({ id: "sub", index: 1, type: "subtitle" })
    ];
    const clips = [
      clip({ id: "vid", trackId: "v", startMs: 0, durationMs: 1000 }),
      clip({
        id: "cap",
        trackId: "sub",
        startMs: 0,
        durationMs: 1000,
        mediaType: "overlay",
        currentAssetId: undefined,
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
    // A caption-only clip draws no media layer (no phantom video).
    expect(layers.filter((l) => l.clipId === "cap")).toHaveLength(1);
    // Captions always composite above the picture, even though the video track
    // here sits at index 0 (which would otherwise be top-most).
    const videoLayer = layers.find((l) => l.kind === "video")!;
    expect(trackZ(captionLayer!.trackIndex)).toBeGreaterThan(
      trackZ(videoLayer.trackIndex)
    );
    // Caption layers are appended last so array order also puts them on top.
    expect(layers[layers.length - 1].kind).toBe("caption");
    // At 100ms the first word is active, the second is not.
    expect(captionLayer!.caption!.words).toEqual([
      { text: "hello", active: true },
      { text: "world", active: false }
    ]);
  });

  it("sources captions from an audio voiceover clip and keeps them on top", () => {
    const tracks = [
      track({ id: "v", index: 0, type: "video" }),
      track({ id: "a", index: 1, type: "audio" })
    ];
    const clips = [
      clip({ id: "vid", trackId: "v", startMs: 0, durationMs: 1000 }),
      clip({
        id: "vo",
        trackId: "a",
        startMs: 0,
        durationMs: 1000,
        mediaType: "audio",
        caption: { words: [{ word: "hi", startMs: 0, endMs: 300 }] }
      })
    ];
    const layers = computeActiveLayers(tracks, clips, 100);
    // The audio clip yields a caption layer but no media layer.
    expect(layers.filter((l) => l.clipId === "vo")).toHaveLength(1);
    const captionLayer = layers.find((l) => l.clipId === "vo")!;
    expect(captionLayer.kind).toBe("caption");
    const videoLayer = layers.find((l) => l.kind === "video")!;
    expect(trackZ(captionLayer.trackIndex)).toBeGreaterThan(
      trackZ(videoLayer.trackIndex)
    );
  });

  it("a captioned video draws both its picture and its caption", () => {
    const tracks = [track({ id: "v", index: 0, type: "video" })];
    const clips = [
      clip({
        id: "talk",
        trackId: "v",
        startMs: 0,
        durationMs: 1000,
        mediaType: "video",
        currentAssetId: "asset-1",
        caption: { words: [{ word: "hey", startMs: 0, endMs: 300 }] }
      })
    ];
    const layers = computeActiveLayers(tracks, clips, 100);
    expect(layers.map((l) => l.kind)).toEqual(["video", "caption"]);
    expect(layers.every((l) => l.clipId === "talk")).toBe(true);
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
