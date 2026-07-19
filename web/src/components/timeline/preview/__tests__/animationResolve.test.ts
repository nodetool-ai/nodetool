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

  it("returns the wipe mask at the window midpoint with hand-computed progress", () => {
    const clip = animatedClip([
      {
        id: "a",
        role: "in",
        preset: "wipe",
        durationMs: 500,
        easing: "linear",
        params: { direction: "up", softness: 0.1 }
      }
    ]);
    // Window [0,500]; midpoint t=0.5 with linear easing → progress 0.5.
    const out = resolveAnimatedLayerProps(layerFor(clip), 250, CANVAS);
    expect(out.mask).toEqual({ direction: "up", progress: 0.5, softness: 0.1 });
    // A wipe leaves transform and opacity alone.
    expect(out.opacity).toBe(1);
  });

  it("returns no mask outside the wipe window", () => {
    const clip = animatedClip([
      { id: "a", role: "in", preset: "wipe", durationMs: 500 }
    ]);
    const layer = layerFor(clip);
    const after = resolveAnimatedLayerProps(layer, 1000, CANVAS);
    expect(after.mask).toBeUndefined();
    expect(after.transform).toBe(layer.transform);
    // Before the window (with a delay) the mask holds fully hidden.
    const delayed = animatedClip([
      { id: "a", role: "in", preset: "wipe", durationMs: 500, delayMs: 400 }
    ]);
    const held = resolveAnimatedLayerProps(layerFor(delayed), 100, CANVAS);
    expect(held.mask?.progress).toBe(0);
  });
});

describe("animated effect composition", () => {
  it("composes a blur-in into a synthesized blur effect at the window midpoint", () => {
    const clip = animatedClip([
      {
        id: "a",
        role: "in",
        preset: "blur",
        durationMs: 500,
        easing: "linear",
        params: { amount: 12 }
      }
    ]);
    // Window [0,500]; t=0.5 → blur 6px, opacity 0.5.
    const out = resolveAnimatedLayerProps(layerFor(clip), 250, CANVAS);
    expect(out.opacity).toBeCloseTo(0.5, 6);
    const blur = out.effects?.find((e) => e.type === "blur");
    expect(blur).toMatchObject({ type: "blur", enabled: true, radius: 6 });
  });

  it("composes a colorFade-in into a synthesized saturation effect", () => {
    const clip = animatedClip([
      { id: "a", role: "in", preset: "colorFade", durationMs: 600, easing: "linear" }
    ]);
    // t=0.5 → saturation 0.5 (grayscale → color).
    const out = resolveAnimatedLayerProps(layerFor(clip), 300, CANVAS);
    const color = out.effects?.find((e) => e.type === "color");
    expect(color).toMatchObject({ type: "color", enabled: true, saturation: 0.5, brightness: 0 });
  });

  it("appends the animated blur after a static clip blur effect", () => {
    const clip = animatedClip([
      { id: "a", role: "in", preset: "blur", durationMs: 500, easing: "linear", params: { amount: 12 } }
    ]);
    clip.effects = [{ id: "static", type: "blur", enabled: true, radius: 4 }];
    const layer = { ...layerFor(clip), effects: clip.effects };
    const out = resolveAnimatedLayerProps(layer, 250, CANVAS);
    const blurs = out.effects?.filter((e) => e.type === "blur") ?? [];
    // Static blur is preserved and the animated blur is appended; the effect
    // pre-pass sums the radii (4 + 6).
    expect(blurs).toHaveLength(2);
    expect(blurs[0]).toMatchObject({ id: "static", radius: 4 });
    expect(blurs[1]).toMatchObject({ radius: 6 });
  });

  it("returns the clip's own effects (no synthesized effect) outside the window", () => {
    const clip = animatedClip([
      { id: "a", role: "in", preset: "blur", durationMs: 500 }
    ]);
    clip.effects = [{ id: "static", type: "blur", enabled: true, radius: 4 }];
    const out = resolveAnimatedLayerProps(layerFor(clip), 1000, CANVAS);
    expect(out.effects).toBe(clip.effects);
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
