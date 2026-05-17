import type {
  ClipStatus,
  TimelineClip,
  TimelineTrack
} from "@nodetool-ai/timeline";

import {
  effectiveAssetId,
  isClipActive,
  snapshotLayers,
  transitionOpacity
} from "../layerSnapshot";

function makeTrack(
  id: string,
  index: number,
  overrides: Partial<TimelineTrack> = {}
): TimelineTrack {
  return {
    id,
    name: id,
    type: "video",
    index,
    visible: true,
    locked: false,
    ...overrides
  };
}

function makeClip(
  id: string,
  trackId: string,
  startMs: number,
  durationMs: number,
  overrides: Partial<TimelineClip> = {}
): TimelineClip {
  return {
    id,
    trackId,
    name: id,
    startMs,
    durationMs,
    mediaType: "video",
    sourceType: "imported",
    status: "generated",
    currentAssetId: `asset-${id}`,
    locked: false,
    versions: [],
    ...overrides
  };
}

describe("layerSnapshot", () => {
  describe("isClipActive", () => {
    it("matches the half-open [start, start+duration) range", () => {
      const clip = makeClip("c1", "t1", 1000, 500);
      expect(isClipActive(clip, 999)).toBe(false);
      expect(isClipActive(clip, 1000)).toBe(true);
      expect(isClipActive(clip, 1499)).toBe(true);
      expect(isClipActive(clip, 1500)).toBe(false);
    });
  });

  describe("transitionOpacity", () => {
    it("ramps linearly from 0 to 1 across the transition window", () => {
      const clip = makeClip("c1", "t1", 1000, 2000, {
        transitionIn: { type: "crossfade", durationMs: 1000 }
      });
      expect(transitionOpacity(clip, 1000)).toBeCloseTo(0);
      expect(transitionOpacity(clip, 1500)).toBeCloseTo(0.5);
      expect(transitionOpacity(clip, 1999)).toBeCloseTo(0.999, 2);
      expect(transitionOpacity(clip, 2000)).toBe(1);
      expect(transitionOpacity(clip, 3000)).toBe(1);
    });

    it("returns 1 when no transition is configured", () => {
      const clip = makeClip("c1", "t1", 0, 1000);
      expect(transitionOpacity(clip, 500)).toBe(1);
    });
  });

  describe("effectiveAssetId", () => {
    it.each<ClipStatus>(["generated", "stale", "locked", "generating"])(
      "uses currentAssetId for status=%s",
      (status) => {
        const clip = makeClip("c1", "t1", 0, 100, {
          status,
          currentAssetId: "asset-x"
        });
        expect(effectiveAssetId(clip)).toBe("asset-x");
      }
    );

    it.each<ClipStatus>(["draft", "queued", "failed", "missing"])(
      "returns undefined for status=%s",
      (status) => {
        const clip = makeClip("c1", "t1", 0, 100, {
          status,
          currentAssetId: "asset-x"
        });
        expect(effectiveAssetId(clip)).toBeUndefined();
      }
    );
  });

  describe("snapshotLayers", () => {
    it("returns an empty list when nothing is active", () => {
      const tracks = [makeTrack("v1", 0)];
      const clips = [makeClip("c1", "v1", 0, 1000)];
      expect(snapshotLayers({ tracks, clips }, 2000)).toEqual([]);
    });

    it("filters audio clips, hidden clips, and invisible tracks", () => {
      const tracks = [
        makeTrack("v1", 0),
        makeTrack("v2", 1, { visible: false }),
        makeTrack("a1", 2, { type: "audio" })
      ];
      const clips = [
        makeClip("c1", "v1", 0, 1000),
        makeClip("c-hidden", "v1", 0, 1000, { hidden: true }),
        makeClip("c-invisible-track", "v2", 0, 1000),
        makeClip("c-audio-track", "a1", 0, 1000),
        makeClip("c-audio-clip", "v1", 0, 1000, { mediaType: "audio" })
      ];
      const layers = snapshotLayers({ tracks, clips }, 500);
      expect(layers.map((l) => l.clipId)).toEqual(["c1"]);
    });

    it("drops clips with no usable asset id", () => {
      const tracks = [makeTrack("v1", 0)];
      const clips = [
        makeClip("c-draft", "v1", 0, 1000, {
          status: "draft",
          currentAssetId: undefined
        }),
        makeClip("c-ok", "v1", 0, 1000)
      ];
      const layers = snapshotLayers({ tracks, clips }, 500);
      expect(layers.map((l) => l.clipId)).toEqual(["c-ok"]);
    });

    it("orders overlapping clips by startMs so the incoming layer blends on top", () => {
      // Two crossfading clips on one track. Outgoing starts first; incoming
      // starts 500 ms later. At t=1200 both are active and the incoming is
      // 200 ms into its 500 ms crossfade.
      const tracks = [makeTrack("v1", 0)];
      const outgoing = makeClip("out", "v1", 0, 1500);
      const incoming = makeClip("in", "v1", 1000, 1500, {
        transitionIn: { type: "crossfade", durationMs: 500 }
      });
      const layers = snapshotLayers(
        { tracks, clips: [incoming, outgoing] },
        1200
      );
      expect(layers.map((l) => l.clipId)).toEqual(["out", "in"]);
      expect(layers[1].opacity).toBeCloseTo(0.4);
    });

    it("applies clip.opacity multiplicatively with the transition ramp", () => {
      const tracks = [makeTrack("v1", 0)];
      const clip = makeClip("c1", "v1", 0, 2000, {
        opacity: 0.5,
        transitionIn: { type: "crossfade", durationMs: 1000 }
      });
      const layers = snapshotLayers({ tracks, clips: [clip] }, 500);
      expect(layers[0].opacity).toBeCloseTo(0.25);
    });

    it("drops layers whose effective opacity has ramped to zero", () => {
      const tracks = [makeTrack("v1", 0)];
      const clip = makeClip("c1", "v1", 1000, 1000, {
        transitionIn: { type: "crossfade", durationMs: 500 }
      });
      // At t=1000 (clip start), the crossfade is at 0 -> dropped.
      const layers = snapshotLayers({ tracks, clips: [clip] }, 1000);
      expect(layers).toEqual([]);
    });

    it("carries trackIndex through unmodified for compositor z-inversion", () => {
      const tracks = [makeTrack("top", 0), makeTrack("bottom", 1)];
      const clips = [
        makeClip("c-top", "top", 0, 1000),
        makeClip("c-bottom", "bottom", 0, 1000)
      ];
      const layers = snapshotLayers({ tracks, clips }, 500);
      const byId = new Map(layers.map((l) => [l.clipId, l.trackIndex]));
      expect(byId.get("c-top")).toBe(0);
      expect(byId.get("c-bottom")).toBe(1);
    });

    it("derives intoClipTimelineMs from the playhead minus clip.startMs", () => {
      const tracks = [makeTrack("v1", 0)];
      const clips = [makeClip("c1", "v1", 500, 2000)];
      const layers = snapshotLayers({ tracks, clips }, 1700);
      expect(layers[0].intoClipTimelineMs).toBe(1200);
    });
  });
});
