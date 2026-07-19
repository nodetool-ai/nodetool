import { makeClip, makeTrack } from "@nodetool-ai/timeline";
import type {
  ClipAnimation,
  TimelineClip,
  TimelineTrack
} from "@nodetool-ai/timeline";

import {
  computeActiveLayers,
  computeActiveLayersWithHorizon,
  createAnimationCompileCache,
  hasActiveAnimation,
  resolveAnimatedLayerProps
} from "../sceneModel";
import type { ActiveLayer } from "../sceneModel";

const CANVAS = { width: 1000, height: 1000 };

const animatedClip = (animations: ClipAnimation[]): TimelineClip =>
  makeClip({
    id: "clip-1",
    status: "generated",
    currentAssetId: "asset-1",
    mediaType: "image",
    startMs: 0,
    durationMs: 2000,
    animations
  });

const layerFor = (clip: TimelineClip): ActiveLayer => ({
  kind: "image",
  clip,
  clipId: clip.id,
  trackIndex: 0,
  blendMode: "normal",
  opacity: clip.opacity ?? 1,
  assetId: clip.currentAssetId,
  transform: clip.transform
});

describe("resolveAnimatedLayerProps", () => {
  it("returns the layer's own values when there are no animations", () => {
    const clip = makeClip({ mediaType: "image", opacity: 0.5 });
    const layer = layerFor(clip);
    const out = resolveAnimatedLayerProps(layer, 100, CANVAS);
    expect(out.opacity).toBe(0.5);
    expect(out.transform).toBe(layer.transform);
  });

  it("composes a static transform with a slide-in at the window midpoint", () => {
    const clip = animatedClip([
      {
        id: "a",
        role: "in",
        preset: "slide",
        durationMs: 500,
        easing: "linear",
        params: { direction: "left", distance: 0.3 }
      }
    ]);
    clip.transform = {
      position: { x: 100, y: 0 },
      scale: { x: 1, y: 1 },
      rotation: 0,
      anchor: { x: 0.5, y: 0.5 }
    };
    const layer = layerFor(clip);
    // Window [0,500]; midpoint t=0.5 with linear easing.
    const out = resolveAnimatedLayerProps(layer, 250, CANVAS);
    // slide left starts at -0.3*1000 = -300, linear to 0 → -150 at t=0.5.
    expect(out.transform?.position.x).toBeCloseTo(100 - 150, 3);
    expect(out.opacity).toBeCloseTo(0.5, 6); // opacity 0→1 linear at t=0.5
  });

  it("holds opacity 0 before a delayed fade-in", () => {
    const clip = animatedClip([
      { id: "a", role: "in", preset: "fade", durationMs: 500, delayMs: 400 }
    ]);
    const out = resolveAnimatedLayerProps(layerFor(clip), 100, CANVAS);
    expect(out.opacity).toBe(0);
  });
});

describe("preview / export parity", () => {
  it("resolves identically at window start, mid, end, and past-end", () => {
    const clip = animatedClip([
      { id: "a", role: "in", preset: "pop", durationMs: 600 },
      { id: "b", role: "loop", preset: "float", durationMs: 1000 }
    ]);
    const previewCache = createAnimationCompileCache();
    const exportCache = createAnimationCompileCache();
    const layer = layerFor(clip);
    for (const t of [0, 300, 600, 1200]) {
      const preview = resolveAnimatedLayerProps(layer, t, CANVAS, previewCache);
      const exported = resolveAnimatedLayerProps(layer, t, CANVAS, exportCache);
      expect(exported).toEqual(preview);
      // And cache vs no-cache agree too.
      expect(resolveAnimatedLayerProps(layer, t, CANVAS)).toEqual(preview);
    }
  });
});

describe("change horizon is unaffected by animations", () => {
  const track: TimelineTrack = makeTrack({ type: "video", visible: true });
  const base = (animations?: ClipAnimation[]): TimelineClip =>
    makeClip({
      trackId: track.id,
      status: "generated",
      currentAssetId: "asset-1",
      mediaType: "image",
      startMs: 0,
      durationMs: 1000,
      animations
    });

  it("nextChangeMs matches with and without animations", () => {
    const without = computeActiveLayersWithHorizon([track], [base()], 200);
    const withAnim = computeActiveLayersWithHorizon(
      [track],
      [base([{ id: "a", role: "loop", preset: "float", durationMs: 300 }])],
      200
    );
    expect(withAnim.nextChangeMs).toBe(without.nextChangeMs);
  });
});

describe("hasActiveAnimation", () => {
  const clip = animatedClip([
    { id: "a", role: "in", preset: "fade", durationMs: 400, delayMs: 200 }
  ]);
  const layers = computeActiveLayers(
    [makeTrack({ id: clip.trackId, type: "video", visible: true })],
    [clip],
    300
  );

  it("is true inside the animating window", () => {
    expect(hasActiveAnimation(layers, 300, CANVAS)).toBe(true);
  });

  it("is false during the pre-window hold", () => {
    expect(hasActiveAnimation(layers, 100, CANVAS)).toBe(false);
  });

  it("is false after the window ends", () => {
    expect(hasActiveAnimation(layers, 900, CANVAS)).toBe(false);
  });
});
