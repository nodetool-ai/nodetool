import { describe, expect, it } from "vitest";

import {
  computeModel3DBakeHash,
  DEFAULT_MODEL3D_STYLE,
  makeClip,
  makeTrack
} from "../src/index.js";
import type {
  ClipModel3DStyle,
  TimelineClip,
  TimelineTrack
} from "../src/index.js";
import {
  computeActiveLayersWithHorizon,
  MAX_MODEL3D_LAYERS
} from "../src/render/sceneModel.js";

const style = (overrides: Partial<ClipModel3DStyle> = {}): ClipModel3DStyle => ({
  ...DEFAULT_MODEL3D_STYLE,
  ...overrides
});

const model3dClip = (overrides: Partial<TimelineClip> = {}): TimelineClip =>
  makeClip({
    mediaType: "model3d",
    status: "generated",
    currentAssetId: "glb-1",
    durationMs: 4000,
    model3dStyle: style(),
    ...overrides
  });

const track = (overrides: Partial<TimelineTrack> = {}): TimelineTrack =>
  makeTrack({ type: "video", visible: true, ...overrides });

/** The hash resolver a host with a matching bake would supply. */
const hashIs =
  (hash: string) =>
  (): string =>
    hash;

describe("computeActiveLayersWithHorizon — model3d clips", () => {
  it("emits a model3d layer carrying the clip's style and asset", () => {
    const t = track({ id: "t1", index: 0 });
    const clip = model3dClip({ trackId: "t1", startMs: 0 });
    const { layers } = computeActiveLayersWithHorizon([t], [clip], 1000);

    expect(layers).toHaveLength(1);
    expect(layers[0].kind).toBe("model3d");
    expect(layers[0].assetId).toBe("glb-1");
    expect(layers[0].model3dStyle).toBe(clip.model3dStyle);
  });

  it("times the glTF animation by the clip's source time and animation speed", () => {
    const t = track({ id: "t1", index: 0 });
    // Trimmed to start 5 s into the model and played at 2x, so one second of
    // timeline is two seconds of source starting from 5.
    const trimmed = model3dClip({
      trackId: "t1",
      startMs: 1000,
      inPointMs: 5000,
      speedMultiplier: 2
    });
    const { layers } = computeActiveLayersWithHorizon([t], [trimmed], 2000);
    expect(layers[0].sourceTimeSec).toBeCloseTo(7);

    // `animation.speed` multiplies on top of that (D3).
    const faster = model3dClip({
      trackId: "t1",
      startMs: 1000,
      inPointMs: 5000,
      speedMultiplier: 2,
      model3dStyle: style({
        animation: { ...DEFAULT_MODEL3D_STYLE.animation, speed: 1.5 }
      })
    });
    const fast = computeActiveLayersWithHorizon([t], [faster], 2000);
    expect(fast.layers[0].sourceTimeSec).toBeCloseTo(10.5);
  });

  it("draws a fresh bake as a video layer seeked from the clip's start", () => {
    const t = track({ id: "t1", index: 0 });
    // Trimmed and sped up: the bake still starts at its own zero, because it
    // is the clip's already-evaluated picture (D6, time origin).
    const clip = model3dClip({
      trackId: "t1",
      startMs: 1000,
      inPointMs: 5000,
      speedMultiplier: 2,
      model3dStyle: style({ bake: { assetId: "mp4-1", dependencyHash: "h1" } })
    });
    const options = { model3dBakeHash: hashIs("h1") };

    const first = computeActiveLayersWithHorizon([t], [clip], 1000, options);
    expect(first.layers[0].kind).toBe("video");
    expect(first.layers[0].assetId).toBe("mp4-1");
    expect(first.layers[0].bakeSourceTimeSec).toBe(0);

    const later = computeActiveLayersWithHorizon([t], [clip], 2500, options);
    expect(later.layers[0].bakeSourceTimeSec).toBeCloseTo(1.5);
  });

  it("falls back to the live 3D layer for a stale bake", () => {
    const t = track({ id: "t1", index: 0 });
    const clip = model3dClip({
      trackId: "t1",
      startMs: 0,
      model3dStyle: style({ bake: { assetId: "mp4-1", dependencyHash: "old" } })
    });
    const { layers } = computeActiveLayersWithHorizon([t], [clip], 1000, {
      model3dBakeHash: hashIs("new")
    });

    expect(layers[0].kind).toBe("model3d");
    expect(layers[0].assetId).toBe("glb-1");
    expect(layers[0].bakeSourceTimeSec).toBeUndefined();
  });

  it("falls back to the live 3D layer when no host supplied a hash", () => {
    const t = track({ id: "t1", index: 0 });
    const clip = model3dClip({
      trackId: "t1",
      startMs: 0,
      model3dStyle: style({ bake: { assetId: "mp4-1", dependencyHash: "h1" } })
    });
    const { layers } = computeActiveLayersWithHorizon([t], [clip], 1000);
    expect(layers[0].kind).toBe("model3d");
  });

  /**
   * The freshness rule end to end, against the real hash rather than a stub:
   * an edit that changes the picture puts the live layer back, and an edit
   * that applies to the baked video the way it applies to any video does not
   * (D6, dependency hash).
   */
  describe("bake freshness under the real hash", () => {
    const SEQUENCE = { fps: 30, width: 1920, height: 1080 };
    const t = track({ id: "t1", index: 0 });

    /** A clip whose bake was taken at the picture it currently has. */
    const freshlyBaked = (overrides: Partial<TimelineClip> = {}): TimelineClip => {
      const clip = model3dClip({ trackId: "t1", startMs: 1000, ...overrides });
      clip.model3dStyle = style({
        ...clip.model3dStyle,
        bake: {
          assetId: "mp4-1",
          dependencyHash: computeModel3DBakeHash(clip, SEQUENCE)
        }
      });
      return clip;
    };

    const kindOf = (
      clip: TimelineClip,
      sequence = SEQUENCE
    ): string =>
      computeActiveLayersWithHorizon([t], [clip], 1500, {
        model3dBakeHash: (c) => computeModel3DBakeHash(c, sequence)
      }).layers[0].kind;

    /** Re-read a baked clip after an edit, keeping the bake it already had. */
    const edited = (
      clip: TimelineClip,
      patch: Partial<TimelineClip>
    ): TimelineClip => ({ ...clip, ...patch });

    it("plays the bake while nothing about the picture has changed", () => {
      expect(kindOf(freshlyBaked())).toBe("video");
    });

    it("goes live again on a trim, a speed change, a remap, a duration or the fps", () => {
      const clip = freshlyBaked();
      expect(kindOf(edited(clip, { inPointMs: 500 }))).toBe("model3d");
      expect(kindOf(edited(clip, { speedMultiplier: 2 }))).toBe("model3d");
      expect(
        kindOf(
          edited(clip, {
            timeRemap: {
              keyframes: [
                { t: 0, sourceMs: 0 },
                { t: 1, sourceMs: 2000 }
              ]
            }
          })
        )
      ).toBe("model3d");
      expect(kindOf(edited(clip, { durationMs: 8000 }))).toBe("model3d");
      expect(kindOf(clip, { ...SEQUENCE, fps: 24 })).toBe("model3d");
    });

    it("keeps playing the bake when only the layer's placement changed", () => {
      const clip = freshlyBaked();
      // Still under the playhead at 1500 ms, just parked elsewhere.
      expect(kindOf(edited(clip, { startMs: 1200 }))).toBe("video");
      expect(kindOf(edited(clip, { opacity: 0.3 }))).toBe("video");
    });
  });

  it("drops the 3D clips past the layer cap and names why", () => {
    const t = track({ id: "t1", index: 0 });
    const clips = ["a", "b", "c"].map((id) =>
      model3dClip({ id, trackId: "t1", startMs: 0 })
    );
    const { layers, droppedLayers } = computeActiveLayersWithHorizon(
      [t],
      clips,
      1000
    );

    expect(layers).toHaveLength(MAX_MODEL3D_LAYERS);
    expect(droppedLayers).toEqual([{ clipId: "c", reason: "model3d_layer_cap" }]);
  });

  it("leaves the change horizon exactly where the same document without 3D put it", () => {
    const picture = track({ id: "t1", index: 1 });
    const overlay = track({ id: "t2", index: 0 });
    const video = makeClip({
      id: "v",
      trackId: "t1",
      mediaType: "video",
      status: "generated",
      currentAssetId: "mp4-0",
      startMs: 0,
      durationMs: 4000
    });
    const three = model3dClip({
      id: "m",
      trackId: "t2",
      startMs: 0,
      durationMs: 4000
    });

    const without = computeActiveLayersWithHorizon(
      [picture, overlay],
      [video],
      1000
    );
    const with3d = computeActiveLayersWithHorizon(
      [picture, overlay],
      [video, three],
      1000
    );

    expect(with3d.layers).toHaveLength(2);
    expect(with3d.nextChangeMs).toBe(without.nextChangeMs);
    expect(with3d.nextChangeMs).toBe(4000);
  });
});
