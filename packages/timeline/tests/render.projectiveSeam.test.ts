import { createCanvas, type Canvas } from "@napi-rs/canvas";
import { describe, expect, it } from "vitest";
import { drawTimelineFrame, type CompositeContext2D } from "../src/render/canvas2d.js";

const SIZE = { width: 640, height: 360 };

function context(canvas: Canvas): CompositeContext2D<Canvas> {
  return canvas.getContext("2d") as unknown as CompositeContext2D<Canvas>;
}

describe("projective Canvas placement", () => {
  for (const opacity of [1, 0.5]) it(`keeps a ${opacity} opacity wall surface seamless through a tilted group`, () => {
    const source = createCanvas(SIZE.width, SIZE.height);
    source.getContext("2d").fillStyle = "#d093e0";
    source.getContext("2d").fillRect(250, 159, 140, 42);
    const output = createCanvas(SIZE.width, SIZE.height);
    const report = drawTimelineFrame(context(output), [{
      source,
      sourceWidth: SIZE.width,
      sourceHeight: SIZE.height,
      opacity,
      blendMode: "normal",
      zIndex: 0,
      transform: {
        position: { x: 0, y: 0 },
        scale: { x: 1, y: 1 }, rotation: -12 * Math.PI / 180,
        rotationX: 28, perspective: 1800,
        anchor: { x: 0.5, y: 0.5 }
      }
    }], { canvasWidth: SIZE.width, canvasHeight: SIZE.height }, {
      projectiveSurface: (width, height) => {
        const canvas = createCanvas(width, height);
        return { surface: canvas, ctx: context(canvas) };
      }
    });
    expect(report.degraded).toEqual([]);
    const pixels = output.getContext("2d").getImageData(0, 0, SIZE.width, SIZE.height).data;
    let gaps = 0;
    let doubled = 0;
    for (let y = 172; y < 188; y++) {
      for (let x = 280; x < 360; x++) {
        const offset = (y * SIZE.width + x) * 4;
        if (pixels[offset] < 190) gaps++;
        if (opacity < 1 && pixels[offset] > 115) doubled++;
      }
    }
    if (opacity === 1) expect(gaps).toBe(0);
    expect(doubled).toBe(0);
  });

  it("does not brighten translucent source pixels at tile seams", () => {
    const source = createCanvas(SIZE.width, SIZE.height);
    source.getContext("2d").fillStyle = "rgba(208, 147, 224, 0.4)";
    source.getContext("2d").fillRect(250, 159, 140, 42);
    const output = createCanvas(SIZE.width, SIZE.height);
    drawTimelineFrame(context(output), [{
      source, sourceWidth: SIZE.width, sourceHeight: SIZE.height,
      opacity: 1, blendMode: "normal", zIndex: 0,
      transform: {
        position: { x: 0, y: 0 }, scale: { x: 1, y: 1 },
        rotation: -12 * Math.PI / 180, rotationX: 28, perspective: 1800,
        anchor: { x: 0.5, y: 0.5 }
      }
    }], { canvasWidth: SIZE.width, canvasHeight: SIZE.height }, {
      alpha: true,
      projectiveSurface: (width, height) => {
        const canvas = createCanvas(width, height);
        return { surface: canvas, ctx: context(canvas) };
      }
    });
    const pixels = output.getContext("2d").getImageData(0, 0, SIZE.width, SIZE.height).data;
    let over = 0;
    let under = 0;
    for (let y = 172; y < 188; y++) {
      for (let x = 280; x < 360; x++) {
        const alpha = pixels[(y * SIZE.width + x) * 4 + 3];
        if (alpha > 105) over++;
        if (alpha < 99) under++;
      }
    }
    expect(over).toBe(0);
    expect(under).toBe(0);
  });

  it("preserves the soft alpha edge of a blurred projected card", () => {
    const source = createCanvas(SIZE.width, SIZE.height);
    const sourceCtx = source.getContext("2d");
    sourceCtx.filter = "blur(8px)";
    sourceCtx.fillStyle = "rgba(208, 147, 224, 0.5)";
    sourceCtx.fillRect(250, 159, 140, 42);
    sourceCtx.filter = "none";
    const sourcePixels = sourceCtx.getImageData(0, 0, SIZE.width, SIZE.height).data;
    expect(sourcePixels[(180 * SIZE.width + 247) * 4 + 3]).toBeGreaterThan(0);
    expect(sourcePixels[(180 * SIZE.width + 247) * 4 + 3]).toBeLessThan(100);

    const output = createCanvas(SIZE.width, SIZE.height);
    drawTimelineFrame(context(output), [{
      source, sourceWidth: SIZE.width, sourceHeight: SIZE.height,
      opacity: 1, blendMode: "normal", zIndex: 0,
      transform: {
        position: { x: 0, y: 0 }, scale: { x: 1, y: 1 },
        rotation: -12 * Math.PI / 180, rotationX: 28, perspective: 1800,
        anchor: { x: 0.5, y: 0.5 }
      }
    }], { canvasWidth: SIZE.width, canvasHeight: SIZE.height }, {
      alpha: true,
      projectiveSurface: (width, height) => {
        const canvas = createCanvas(width, height);
        return { surface: canvas, ctx: context(canvas) };
      }
    });
    const pixels = output.getContext("2d").getImageData(0, 0, SIZE.width, SIZE.height).data;
    let edgePixels = 0;
    let over = 0;
    for (let y = 150; y < 210; y++) {
      for (let x = 240; x < 400; x++) {
        const alpha = pixels[(y * SIZE.width + x) * 4 + 3];
        if (alpha > 8 && alpha < 100) edgePixels++;
        if (alpha > 130) over++;
      }
    }
    expect(edgePixels).toBeGreaterThan(100);
    expect(over).toBe(0);
  });

  it("reuses a bounded pair of projective scratch surfaces across cards", () => {
    const source = createCanvas(SIZE.width, SIZE.height);
    source.getContext("2d").fillRect(250, 159, 140, 42);
    const output = createCanvas(SIZE.width, SIZE.height);
    let allocations = 0;
    const layers = Array.from({ length: 12 }, (_, index) => ({
      source, sourceWidth: SIZE.width, sourceHeight: SIZE.height,
      opacity: 1, blendMode: "normal" as const, zIndex: index,
      transform: {
        position: { x: index * 3, y: 0 }, scale: { x: 1, y: 1 },
        rotation: -12 * Math.PI / 180, rotationX: 28, perspective: 1800,
        anchor: { x: 0.5, y: 0.5 }
      }
    }));
    drawTimelineFrame(context(output), layers,
      { canvasWidth: SIZE.width, canvasHeight: SIZE.height }, {
        projectiveSurface: (width, height) => {
          allocations++;
          const canvas = createCanvas(width, height);
          return { surface: canvas, ctx: context(canvas) };
        }
      });
    expect(allocations).toBeLessThanOrEqual(2);
  });

  it("keeps the center visible when a tilted source crosses the perspective plane", () => {
    const source = createCanvas(SIZE.width, SIZE.height);
    source.getContext("2d").fillStyle = "#ff0000";
    source.getContext("2d").fillRect(0, 0, SIZE.width, SIZE.height);
    const output = createCanvas(SIZE.width, SIZE.height);
    const report = drawTimelineFrame(context(output), [{
      clipId: "near-plane",
      source, sourceWidth: SIZE.width, sourceHeight: SIZE.height,
      opacity: 1, blendMode: "normal", zIndex: 0,
      transform: {
        position: { x: 0, y: 0 }, scale: { x: 1, y: 1 },
        rotation: 0, rotationX: 60, perspective: 100,
        anchor: { x: 0.5, y: 0.5 }
      }
    }], { canvasWidth: SIZE.width, canvasHeight: SIZE.height }, {
      alpha: true,
      projectiveSurface: (width, height) => {
        const canvas = createCanvas(width, height);
        return { surface: canvas, ctx: context(canvas) };
      }
    });
    const center = output.getContext("2d").getImageData(320, 180, 1, 1).data;
    expect(center[0]).toBeGreaterThan(200);
    expect(center[3]).toBeGreaterThan(200);
    expect(report.degraded).toContainEqual({
      clipId: "near-plane", reason: "perspective_near_plane_fallback"
    });
  });

  it("does not fall back when only transparent source margins cross the plane", () => {
    const source = createCanvas(SIZE.width, SIZE.height);
    source.getContext("2d").fillStyle = "#ff0000";
    source.getContext("2d").fillRect(250, 160, 140, 40);
    const output = createCanvas(SIZE.width, SIZE.height);
    const report = drawTimelineFrame(context(output), [{
      source, sourceWidth: SIZE.width, sourceHeight: SIZE.height,
      opacity: 1, blendMode: "normal", zIndex: 0,
      transform: {
        position: { x: 0, y: 0 }, scale: { x: 1, y: 1 },
        rotation: 0, rotationX: 60, perspective: 100,
        anchor: { x: 0.5, y: 0.5 }
      }
    }], { canvasWidth: SIZE.width, canvasHeight: SIZE.height }, {
      alpha: true,
      projectiveSurface: (width, height) => {
        const canvas = createCanvas(width, height);
        return { surface: canvas, ctx: context(canvas) };
      }
    });
    expect(output.getContext("2d").getImageData(320, 180, 1, 1).data[0]).toBeGreaterThan(200);
    expect(report.degraded).toEqual([]);
  });
});
