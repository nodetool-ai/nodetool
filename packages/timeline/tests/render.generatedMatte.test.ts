/**
 * Generated mattes as the scene model resolves them and the Canvas 2D rules
 * draw them (T17, D2).
 *
 * Two halves, the split `render.adjustment.test.ts` uses. The scene model
 * decides *that* the clip is matted, by what, and how it is read — asserted
 * against the layer plan. The drawing rules decide what lands on the pixels,
 * and that half runs against a real `@napi-rs/canvas` context, because "is the
 * layer keyed by the mask" is a question only pixels answer.
 */
import { describe, expect, it } from "vitest";
import { createCanvas, type Canvas } from "@napi-rs/canvas";

import { makeClip, makeTrack } from "../src/index.js";
import type { ClipGeneratedMatte, TimelineClip } from "../src/index.js";
import { computeActiveLayersWithHorizon } from "../src/render/sceneModel.js";
import {
  drawTimelineFrame,
  type Canvas2DFrameGeometry,
  type Canvas2DLayer,
  type CompositeContext2D,
  type CompositeSurface
} from "../src/render/canvas2d.js";

// ── Scene model ──────────────────────────────────────────────────────────────

const track = makeTrack({ id: "video", type: "video", index: 0, visible: true });

const READY: ClipGeneratedMatte = {
  assetId: "mask-1",
  sourceAssetId: "asset-1",
  sourceRange: { fromMs: 0, toMs: 10_000 },
  settings: { model: "fal-ai/birefnet/v2/video" },
  status: "ready"
};

const clip = (over: Partial<TimelineClip> = {}): TimelineClip =>
  makeClip({
    trackId: track.id,
    mediaType: "video",
    startMs: 0,
    durationMs: 1000,
    status: "generated",
    currentAssetId: "asset-1",
    ...over
  });

const layersAt = (clips: TimelineClip[], timeMs = 500) =>
  computeActiveLayersWithHorizon([track], clips, timeMs, {
    canvas: { width: 100, height: 100 }
  });

describe("computeActiveLayers — generated mattes", () => {
  it("mattes the clip with its own mask asset, read as luma", () => {
    const result = layersAt([
      clip({ id: "shot", generatedMatte: { ...READY } })
    ]);

    expect(result.layers.map((l) => l.clipId)).toEqual(["shot"]);
    const matte = result.layers[0]?.matte;
    expect(matte?.mode).toBe("luma");
    expect(matte?.invert).toBe(false);
    // Same clip, mask asset: the keyhole is seeked to the clip's own source
    // time, which is what keeps it aligned through a trim or a speed change.
    expect(matte?.layer.assetId).toBe("mask-1");
    expect(matte?.layer.clip).toBe(result.layers[0]?.clip);
    expect(matte?.layer.kind).toBe("video");
    expect(matte?.layer.opacity).toBe(1);
    expect(matte?.layer.effects).toBeUndefined();
  });

  it("places the keyhole exactly where the picture is placed", () => {
    const transform = {
      position: { x: 20, y: -8 },
      scale: { x: 1.5, y: 1.5 },
      rotation: 0.3,
      anchor: { x: 0.5, y: 0.5 }
    };
    const result = layersAt([
      clip({ id: "shot", transform, generatedMatte: { ...READY } })
    ]);
    expect(result.layers[0]?.matte?.layer.transform).toEqual(transform);
  });

  it("carries invert, strength and feather onto the resolution", () => {
    const result = layersAt([
      clip({
        id: "shot",
        generatedMatte: {
          ...READY,
          invert: true,
          strength: 0.5,
          featherPx: 4
        }
      })
    ]);
    expect(result.layers[0]?.matte).toMatchObject({
      invert: true,
      strength: 0.5,
      featherPx: 4
    });
  });

  it("clamps a strength outside 0..1 and drops a zero feather", () => {
    const result = layersAt([
      clip({
        id: "shot",
        generatedMatte: { ...READY, strength: 4, featherPx: 0 }
      })
    ]);
    expect(result.layers[0]?.matte?.strength).toBe(1);
    expect(result.layers[0]?.matte?.featherPx).toBeUndefined();
  });

  it("draws unmatted while a generation is in flight or has failed", () => {
    for (const status of ["generating", "failed"] as const) {
      const result = layersAt([
        clip({ id: "shot", generatedMatte: { ...READY, status } })
      ]);
      expect(result.layers.map((l) => l.clipId)).toEqual(["shot"]);
      expect(result.layers[0]?.matte).toBeUndefined();
    }
  });

  it("treats a matte with no status as ready", () => {
    const noStatus: ClipGeneratedMatte = { ...READY };
    delete noStatus.status;
    const result = layersAt([clip({ id: "shot", generatedMatte: noStatus })]);
    expect(result.layers[0]?.matte?.layer.assetId).toBe("mask-1");
  });

  it("wins over a two-clip matte on the same clip", () => {
    const result = layersAt([
      clip({
        id: "shot",
        matte: { sourceClipId: "key", mode: "alpha" },
        generatedMatte: { ...READY }
      }),
      clip({ id: "key", currentAssetId: "asset-key" })
    ]);

    const matte = result.layers[0]?.matte;
    expect(matte?.mode).toBe("luma");
    expect(matte?.layer.assetId).toBe("mask-1");
    // The authored matte's source is still held out of the frame: a matte
    // source never draws itself, whether or not its keyhole was used.
    expect(result.layers.map((l) => l.clipId)).toEqual(["shot"]);
  });

  it("leaves a clip with no generated matte on the two-clip path", () => {
    const result = layersAt([
      clip({ id: "shot", matte: { sourceClipId: "key", mode: "alpha" } }),
      clip({ id: "key", currentAssetId: "asset-key" })
    ]);
    expect(result.layers[0]?.matte?.mode).toBe("alpha");
    expect(result.layers[0]?.matte?.layer.clipId).toBe("key");
  });
});

// ── Drawing rules ────────────────────────────────────────────────────────────

const W = 24;
const H = 8;
const GEOMETRY: Canvas2DFrameGeometry = { canvasWidth: W, canvasHeight: H };
const LEFT = 4;
const RIGHT = 20;

// SAFETY: `CompositeContext2D` is the subset of the 2D canvas API the
// compositing rules use, and `@napi-rs/canvas` implements all of it.
const contextOf = (canvas: Canvas): CompositeContext2D<Canvas> =>
  canvas.getContext("2d") as unknown as CompositeContext2D<Canvas>;

const surfaceOf = (canvas: Canvas): CompositeSurface<Canvas> => ({
  ctx: contextOf(canvas),
  surface: canvas
});

/** A frame-sized canvas with one band painted and the rest transparent. */
function band(color: string, x: number, width: number): Canvas {
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = color;
  ctx.fillRect(x, 0, width, H);
  return canvas;
}

const layerOf = (
  source: Canvas,
  over: Partial<Canvas2DLayer<Canvas>> = {}
): Canvas2DLayer<Canvas> => ({
  clipId: "shot",
  source,
  sourceWidth: W,
  sourceHeight: H,
  opacity: 1,
  blendMode: "normal",
  zIndex: 0,
  ...over
});

/** Draw one frame with a fresh surface handed out per request. */
function render(layers: Canvas2DLayer<Canvas>[]): {
  frame: Canvas;
  degraded: { clipId?: string; reason: string }[];
} {
  const frame = createCanvas(W, H);
  const pool: Canvas[] = [];
  let taken = 0;
  const take = (): CompositeSurface<Canvas> => {
    const index = taken++;
    let surface = pool[index];
    if (!surface) {
      surface = createCanvas(W, H);
      pool[index] = surface;
    }
    return surfaceOf(surface);
  };
  const { degraded } = drawTimelineFrame(contextOf(frame), layers, GEOMETRY, {
    // Transparent ground, so what the matte keys out reads as alpha 0 rather
    // than as the compositor's opaque black.
    alpha: true,
    matteSurface: take,
    maskSurface: take,
    maskScratch: take,
    precompositeSurface: take,
    adjustmentSurface: take
  });
  return { frame, degraded };
}

/** RGBA at one pixel of a finished frame. */
function pixel(
  canvas: Canvas,
  x: number
): [number, number, number, number] {
  const d = canvas.getContext("2d").getImageData(x, H / 2, 1, 1).data;
  return [d[0]!, d[1]!, d[2]!, d[3]!];
}

/** The luma keyhole a generated matte hands over: white left, empty right. */
const keyhole = (): Canvas2DLayer<Canvas> =>
  layerOf(band("rgb(255, 255, 255)", 0, 12), { clipId: "shot-matte" });

describe("drawTimelineFrame — a generated matte on the pixels", () => {
  it("keys the picture by the mask's luminance", () => {
    const { frame } = render([
      layerOf(band("rgb(200, 40, 40)", 0, W), {
        matte: { mode: "luma", invert: false, layer: keyhole() }
      })
    ]);

    expect(pixel(frame, LEFT)).toEqual([200, 40, 40, 255]);
    expect(pixel(frame, RIGHT)[3]).toBe(0);
  });

  it("invert flips which side survives", () => {
    const { frame } = render([
      layerOf(band("rgb(200, 40, 40)", 0, W), {
        matte: { mode: "luma", invert: true, layer: keyhole() }
      })
    ]);

    expect(pixel(frame, LEFT)[3]).toBe(0);
    expect(pixel(frame, RIGHT)).toEqual([200, 40, 40, 255]);
  });

  it("strength 0.5 halves the alpha the matte lets through", () => {
    const { frame } = render([
      layerOf(band("rgb(200, 40, 40)", 0, W), {
        matte: {
          mode: "luma",
          invert: false,
          strength: 0.5,
          layer: keyhole()
        }
      })
    ]);

    const [, , , alpha] = pixel(frame, LEFT);
    expect(alpha).toBeGreaterThanOrEqual(126);
    expect(alpha).toBeLessThanOrEqual(130);
    expect(pixel(frame, RIGHT)[3]).toBe(0);
  });

  it("draws a feathered matte hard and reports the hard edge", () => {
    const { frame, degraded } = render([
      layerOf(band("rgb(200, 40, 40)", 0, W), {
        matte: {
          mode: "luma",
          invert: false,
          featherPx: 6,
          layer: keyhole()
        }
      })
    ]);

    expect(degraded).toEqual([
      { clipId: "shot", reason: "generated_matte_feather_ignored" }
    ]);
    // Hard: the pixel one step inside the mask's edge is still fully opaque.
    expect(pixel(frame, 11)[3]).toBe(255);
    expect(pixel(frame, 12)[3]).toBe(0);
  });

  it("draws the whole picture when nothing mattes it", () => {
    const { frame } = render([layerOf(band("rgb(200, 40, 40)", 0, W))]);
    expect(pixel(frame, LEFT)[3]).toBe(255);
    expect(pixel(frame, RIGHT)[3]).toBe(255);
  });
});
