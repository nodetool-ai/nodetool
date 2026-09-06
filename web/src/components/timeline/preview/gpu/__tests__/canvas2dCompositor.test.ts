/**
 * The Canvas 2D backend and a canvas source.
 *
 * A 3D layer's pixels arrive as an `OffscreenCanvas` rather than a decoded
 * element or an `ImageBitmap`. Nothing in the drawing rules cares — `drawImage`
 * takes one — but the host's own readiness and measurement checks stand between
 * the layer and the draw, and a source they cannot measure is silently dropped
 * from the frame. This pins that a canvas survives them.
 */

import { describe, expect, it } from "@jest/globals";
import type {
  CompositeContext2D,
  ImagePixels
} from "@nodetool-ai/timeline/render";

import { stub } from "../../../../../test-utils/doubles";
import { Canvas2DCompositor } from "../canvas2dCompositor";
import type { CompositeSource } from "../types";

/** The members the shared draw rules touch, recording what each draw drew. */
class RecordingContext implements CompositeContext2D<CompositeSource> {
  globalAlpha = 1;
  globalCompositeOperation = "source-over";
  filter = "none";
  shadowColor = "rgba(0, 0, 0, 0)";
  shadowBlur = 0;
  shadowOffsetX = 0;
  shadowOffsetY = 0;
  fillStyle: string | object = "#000";
  readonly draws: CompositeSource[] = [];

  save(): void {}
  restore(): void {}
  setTransform(): void {}
  clearRect(): void {}
  fillRect(): void {}
  beginPath(): void {}
  closePath(): void {}
  rect(): void {}
  moveTo(): void {}
  lineTo(): void {}
  arcTo(): void {}
  bezierCurveTo(): void {}
  quadraticCurveTo(): void {}
  ellipse(): void {}
  fill(): void {}
  clip(): void {}
  translate(): void {}
  scale(): void {}
  drawImage(source: CompositeSource): void {
    this.draws.push(source);
  }
  createLinearGradient(): { addColorStop(offset: number, color: string): void } {
    return { addColorStop: () => {} };
  }
  createRadialGradient(): { addColorStop(offset: number, color: string): void } {
    return { addColorStop: () => {} };
  }
  getImageData(_x: number, _y: number, w: number, h: number): ImagePixels {
    return { data: new Uint8ClampedArray(w * h * 4), width: w, height: h };
  }
  putImageData(): void {}
}

describe("Canvas2DCompositor", () => {
  it("composites an OffscreenCanvas source", async () => {
    const ctx = new RecordingContext();
    const canvas = stub<HTMLCanvasElement>({
      width: 200,
      height: 100,
      // SAFETY: the compositor asks this canvas for "2d" and nothing else.
      getContext: (() => ctx) as unknown as HTMLCanvasElement["getContext"]
    });
    const source = stub<OffscreenCanvas>({
      width: 64,
      height: 32,
      getContext: (() => null) as OffscreenCanvas["getContext"]
    });

    const compositor = new Canvas2DCompositor();
    expect((await compositor.init(canvas)).ok).toBe(true);
    compositor.setReferenceSize(200, 100);
    compositor.setLayers([
      {
        id: "m:clip-1",
        source,
        opacity: 1,
        blendMode: "normal",
        zIndex: 0
      }
    ]);
    compositor.render();

    expect(ctx.draws).toContain(source);
    compositor.dispose();
  });
});
