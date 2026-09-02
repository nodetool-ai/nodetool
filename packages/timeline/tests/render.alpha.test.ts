/**
 * The alpha ground both compositors seed from, and the straight-alpha the
 * readback hands back (F13, T27).
 *
 * Two decisions are checked here because both are pure. `drawTimelineFrame`
 * either paints an opaque black ground or clears one; `unpremultiplyInPlace`
 * turns the compositor's premultiplied accumulation back into the straight
 * alpha every alpha-capable encoder — VP9's `yuva420p`, ProRes 4444, PNG —
 * expects. The pixels that come out of a real device are asserted where one
 * exists (`packages/video-nodes/tests/timeline-alpha-render.test.ts`).
 */
import { describe, expect, it } from "vitest";
import {
  drawTimelineFrame,
  type Canvas2DLayer,
  type CompositeContext2D
} from "../src/render/canvas2d.js";
import { unpremultiplyInPlace } from "../src/render/frameCompositor.js";

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

describe("unpremultiplyInPlace", () => {
  it("divides the alpha back out of a partly transparent pixel", () => {
    // Pure red at half alpha, premultiplied: 128/255 of 255 is 128.
    const rgba = new Uint8Array([128, 0, 0, 128]);
    unpremultiplyInPlace(rgba);
    expect([...rgba]).toEqual([255, 0, 0, 128]);
  });

  it("leaves opaque and fully transparent pixels alone", () => {
    const rgba = new Uint8Array([10, 20, 30, 255, 0, 0, 0, 0]);
    unpremultiplyInPlace(rgba);
    expect([...rgba]).toEqual([10, 20, 30, 255, 0, 0, 0, 0]);
  });

  it("never lifts a channel past opaque", () => {
    // A channel above its own alpha cannot come from a valid premultiply, and
    // dividing it out would wrap past 255 into whatever the byte truncates to.
    const rgba = new Uint8Array([200, 0, 0, 100]);
    unpremultiplyInPlace(rgba);
    expect(rgba[0]).toBe(255);
  });
});
