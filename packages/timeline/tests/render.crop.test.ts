/**
 * Clip crop on the Canvas 2D path.
 *
 * Pixels are the GPU suite's subject (`render.crop.gpu.test.ts`); what is
 * asserted here is the geometry and the host contract — the two things that
 * path decides on its own:
 *
 * - the crop is blitted onto its own surface at the crop's size, by drawing the
 *   whole source at a negative offset (the 5-argument `drawImage` spelling of a
 *   sub-rectangle, which is all `CompositeContext2D` vends);
 * - a cropped layer is then placed exactly like an uncropped layer of the crop's
 *   size, which is what makes the two compositors agree;
 * - a host with no `cropSurface` draws uncropped and *says so* (I7), rather than
 *   silently showing a different framing.
 */
import { describe, expect, it } from "vitest";
import {
  drawTimelineFrame,
  layerCanvasAffine,
  type Canvas2DLayer,
  type CompositeContext2D,
  type CompositeSurface
} from "../src/render/canvas2d.js";
import type { ClipCrop } from "../src/index.js";

const GEOMETRY = { canvasWidth: 100, canvasHeight: 100 };

interface RecordedDraw {
  source: string;
  x: number;
  y: number;
  w: number;
  h: number;
  transform: [number, number, number, number, number, number];
}

class RecordingContext implements CompositeContext2D<string> {
  globalAlpha = 1;
  globalCompositeOperation = "source-over";
  filter = "none";
  shadowColor = "rgba(0, 0, 0, 0)";
  shadowBlur = 0;
  shadowOffsetX = 0;
  shadowOffsetY = 0;
  fillStyle: string | object = "#000";
  readonly draws: RecordedDraw[] = [];
  private current: [number, number, number, number, number, number] = [
    1, 0, 0, 1, 0, 0
  ];

  save(): void {}
  restore(): void {}
  setTransform(
    a = 1,
    b = 0,
    c = 0,
    d = 1,
    e = 0,
    f = 0
  ): void {
    this.current = [a, b, c, d, e, f];
  }
  clearRect(): void {}
  fillRect(): void {}
  beginPath(): void {}
  closePath(): void {}
  rect(): void {}
  arcTo(): void {}
  clip(): void {}
  drawImage(source: string, x: number, y: number, w: number, h: number): void {
    this.draws.push({ source, x, y, w, h, transform: [...this.current] });
  }
  createLinearGradient(): { addColorStop(o: number, c: string): void } {
    return { addColorStop: () => {} };
  }
  lineTo(): void {}
  moveTo(): void {}
  bezierCurveTo(): void {}
  quadraticCurveTo(): void {}
  ellipse(): void {}
  fill(): void {}
  translate(): void {}
  scale(): void {}
  createRadialGradient(): { addColorStop(o: number, c: string): void } {
    return { addColorStop: () => {} };
  }
  getImageData(
    _x: number,
    _y: number,
    w: number,
    h: number
  ): { data: Uint8ClampedArray; width: number; height: number } {
    return { data: new Uint8ClampedArray(w * h * 4), width: w, height: h };
  }
  putImageData(): void {}
}

const layer = (over: Partial<Canvas2DLayer<string>>): Canvas2DLayer<string> => ({
  source: "src",
  sourceWidth: 200,
  sourceHeight: 100,
  opacity: 1,
  blendMode: "normal",
  zIndex: 0,
  ...over
});

/** Vends a distinct named surface per call, the way a real host pool does. */
function surfacePool() {
  const contexts: RecordingContext[] = [];
  return {
    contexts,
    take: (w: number, h: number): CompositeSurface<string> => {
      const ctx = new RecordingContext();
      contexts.push(ctx);
      return { surface: `crop-${w}x${h}`, ctx };
    }
  };
}

const HALF_WIDTH: ClipCrop = { left: 0.25, right: 0.25, top: 0, bottom: 0 };
/** Insets on both axes, so neither blit offset is zero. */
const INSET: ClipCrop = { left: 0.25, right: 0.25, top: 0.2, bottom: 0.3 };

describe("Canvas 2D — clip crop", () => {
  it("blits the crop onto a crop-sized surface at a negative offset", () => {
    const ctx = new RecordingContext();
    const pool = surfacePool();
    drawTimelineFrame(ctx, [layer({ crop: INSET })], GEOMETRY, {
      cropSurface: pool.take
    });

    // 200 wide, a quarter off each side → 100 wide from x = 50.
    // 100 high, 0.2 off the top and 0.3 off the bottom → 50 high from y = 20.
    expect(pool.contexts).toHaveLength(1);
    expect(pool.contexts[0]!.draws).toEqual([
      {
        source: "src",
        x: -50,
        y: -20,
        w: 200,
        h: 100,
        transform: [1, 0, 0, 1, 0, 0]
      }
    ]);
    // The frame then draws the cropped surface, not the original source.
    expect(ctx.draws).toHaveLength(1);
    expect(ctx.draws[0]!.source).toBe("crop-100x50");
    expect(ctx.draws[0]!.w).toBe(100);
    expect(ctx.draws[0]!.h).toBe(50);
  });

  it("places a cropped layer exactly like an uncropped one of the crop's size", () => {
    // The equivalence the GPU suite asserts in pixels, as geometry: a 200×100
    // source cropped to its middle 100×100 must land where a 100×100 source
    // would. Anything reading the *original* size here fails.
    const cropped = new RecordingContext();
    drawTimelineFrame(cropped, [layer({ crop: HALF_WIDTH })], GEOMETRY, {
      cropSurface: surfacePool().take
    });

    const expected = layerCanvasAffine(undefined, 100, 100, GEOMETRY);
    const [a, b, c, d, e, f] = cropped.draws[0]!.transform;
    expect({ a, b, c, d, e, f }).toEqual(expected);

    // And it is genuinely different from the uncropped placement, so the
    // assertion above is not comparing a value to itself.
    const uncropped = layerCanvasAffine(undefined, 200, 100, GEOMETRY);
    expect(uncropped).not.toEqual(expected);
  });

  it("draws uncropped and reports `crop_skipped` when the host vends no surface", () => {
    const ctx = new RecordingContext();
    const { degraded } = drawTimelineFrame(
      ctx,
      [layer({ clipId: "c1", crop: HALF_WIDTH })],
      GEOMETRY,
      {}
    );

    expect(degraded).toEqual([{ clipId: "c1", reason: "crop_skipped" }]);
    // The picture is wrong in a way the caller was told about, not absent.
    expect(ctx.draws).toHaveLength(1);
    expect(ctx.draws[0]!.source).toBe("src");
    expect(ctx.draws[0]!.w).toBe(200);
  });

  it("asks for no surface, and reports nothing, when there is no crop", () => {
    const ctx = new RecordingContext();
    const pool = surfacePool();
    const { degraded } = drawTimelineFrame(ctx, [layer({})], GEOMETRY, {
      cropSurface: pool.take
    });

    expect(pool.contexts).toHaveLength(0);
    expect(degraded).toEqual([]);
    expect(ctx.draws[0]!.source).toBe("src");
  });

  it("treats insets that keep no picture as no crop at all", () => {
    const ctx = new RecordingContext();
    const pool = surfacePool();
    const { degraded } = drawTimelineFrame(
      ctx,
      [layer({ crop: { left: 0.7, right: 0.7, top: 0, bottom: 0 } })],
      GEOMETRY,
      { cropSurface: pool.take }
    );

    // No surface taken, nothing reported, whole source drawn — the validator's
    // `crop_degenerate` is where the user hears about it.
    expect(pool.contexts).toHaveLength(0);
    expect(degraded).toEqual([]);
    expect(ctx.draws[0]!.w).toBe(200);
  });
});
