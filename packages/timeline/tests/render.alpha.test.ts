/**
 * The alpha ground the Canvas 2D compositor seeds from (F13, T27).
 * GPU straight-alpha readback is covered in `render.alpha.gpu.test.ts`.
 */
import { describe, expect, it } from "vitest";
import {
  drawTimelineFrame,
  type Canvas2DLayer,
  type CompositeContext2D
} from "../src/render/canvas2d.js";

const GEOMETRY = { canvasWidth: 100, canvasHeight: 100 };

/** Records only what the frame seed does: fill a ground, or clear it. */
class SeedRecordingContext implements CompositeContext2D<string> {
  globalAlpha = 1;
  globalCompositeOperation = "source-over";
  filter = "none";
  shadowColor = "rgba(0, 0, 0, 0)";
  shadowBlur = 0;
  shadowOffsetX = 0;
  shadowOffsetY = 0;
  fillStyle: string | object = "";
  readonly fills: string[] = [];
  cleared = 0;

  save(): void {}
  restore(): void {}
  setTransform(): void {}
  clearRect(): void {
    this.cleared += 1;
  }
  fillRect(): void {
    this.fills.push(String(this.fillStyle));
  }
  beginPath(): void {}
  closePath(): void {}
  rect(): void {}
  moveTo(): void {}
  arcTo(): void {}
  clip(): void {}
  drawImage(): void {}
  createLinearGradient(): { addColorStop(offset: number, color: string): void } {
    return { addColorStop: () => {} };
  }
  lineTo(): void {}
  bezierCurveTo(): void {}
  quadraticCurveTo(): void {}
  ellipse(): void {}
  fill(): void {}
  translate(): void {}
  scale(): void {}
  createRadialGradient(): { addColorStop(offset: number, color: string): void } {
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

const layer = (): Canvas2DLayer<string> => ({
  source: "a",
  sourceWidth: 100,
  sourceHeight: 100,
  opacity: 1,
  blendMode: "normal",
  zIndex: 0
});

describe("drawTimelineFrame — frame seed", () => {
  it("paints an opaque black ground by default", () => {
    const ctx = new SeedRecordingContext();
    drawTimelineFrame(ctx, [layer()], GEOMETRY);
    expect(ctx.fills).toEqual(["#000"]);
    expect(ctx.cleared).toBe(0);
  });

  it("clears to transparent with alpha", () => {
    const ctx = new SeedRecordingContext();
    drawTimelineFrame(ctx, [layer()], GEOMETRY, { alpha: true });
    expect(ctx.fills).toEqual([]);
    expect(ctx.cleared).toBe(1);
  });
});
