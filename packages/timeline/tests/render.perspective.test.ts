import { createCanvas, type Canvas } from "@napi-rs/canvas";
import { describe, expect, it } from "vitest";
import { drawTimelineFrame, projectSourcePoint, type CompositeContext2D } from "../src/render/canvas2d.js";
import { buildTransformMatrix, containBaseScale } from "../src/render/transform.js";

describe("Canvas 2D perspective", () => {
  it("places a tilted clip at the projected corners", () => {
    const source = createCanvas(156, 88);
    const sourceCtx = source.getContext("2d");
    sourceCtx.fillStyle = "#ffffff";
    sourceCtx.fillRect(0, 0, 156, 88);
    const output = createCanvas(384, 216);
    const transform = {
      position: { x: 0, y: 0 }, scale: { x: 0.81, y: 0.81 }, rotation: 0,
      rotationX: 6, rotationY: 7, perspective: 480,
      anchor: { x: 0.5, y: 0.5 }
    };
    const asContext = (canvas: Canvas): CompositeContext2D<Canvas> =>
      canvas.getContext("2d") as unknown as CompositeContext2D<Canvas>;
    const report = drawTimelineFrame(asContext(output), [{
      clipId: "tilt", source, sourceWidth: 156, sourceHeight: 88,
      opacity: 1, blendMode: "normal", zIndex: 0, transform
    }], { canvasWidth: 384, canvasHeight: 216 }, {
      alpha: true,
      projectiveSurface: (width, height) => {
        const canvas = createCanvas(width, height);
        return { ctx: asContext(canvas), surface: canvas };
      }
    });
    expect(report.degraded).toEqual([]);
    const pixels = output.getContext("2d").getImageData(0, 0, 384, 216).data;
    let minX = 384, maxX = 0, minY = 216, maxY = 0;
    for (let y = 0; y < 216; y += 1) {
      for (let x = 0; x < 384; x += 1) {
        if ((pixels[(y * 384 + x) * 4 + 3] ?? 0) > 127) {
          minX = Math.min(minX, x); maxX = Math.max(maxX, x);
          minY = Math.min(minY, y); maxY = Math.max(maxY, y);
        }
      }
    }
    const matrix = buildTransformMatrix(transform,
      containBaseScale(156, 88, 384, 216), 384, 216);
    const corners = [[0, 0], [156, 0], [156, 88], [0, 88]].map(([x, y]) =>
      projectSourcePoint(matrix, x, y, 156, 88, 384, 216));
    expect(Math.abs(minX - Math.min(...corners.map((p) => p.x)))).toBeLessThan(2);
    expect(Math.abs(maxX - Math.max(...corners.map((p) => p.x)))).toBeLessThan(2);
    expect(Math.abs(minY - Math.min(...corners.map((p) => p.y)))).toBeLessThan(2);
    expect(Math.abs(maxY - Math.max(...corners.map((p) => p.y)))).toBeLessThan(2);
  });

  it("casts one shadow from the projected window silhouette", () => {
    const source = createCanvas(156, 88);
    const sourceCtx = source.getContext("2d");
    sourceCtx.fillStyle = "#ffffff";
    sourceCtx.fillRect(0, 0, 156, 88);
    const output = createCanvas(384, 216);
    const asContext = (canvas: Canvas): CompositeContext2D<Canvas> =>
      canvas.getContext("2d") as unknown as CompositeContext2D<Canvas>;
    const report = drawTimelineFrame(asContext(output), [{
      clipId: "tilt", source, sourceWidth: 156, sourceHeight: 88,
      opacity: 1, blendMode: "normal", zIndex: 0,
      transform: { position: { x: 0, y: 0 }, scale: { x: 0.8, y: 0.8 },
        rotation: 0, rotationX: 6, rotationY: 7, perspective: 480,
        anchor: { x: 0.5, y: 0.5 } },
      effects: [{ id: "shadow", type: "dropShadow", enabled: true,
        offsetX: 0, offsetY: 24, blur: 36, color: "#000000" }]
    }], { canvasWidth: 384, canvasHeight: 216 }, {
      alpha: true,
      projectiveSurface: (width, height) => {
        const canvas = createCanvas(width, height);
        return { ctx: asContext(canvas), surface: canvas };
      }
    });
    expect(report.degraded).toEqual([]);
    expect(output.getContext("2d").getImageData(192, 171, 1, 1).data[3]).toBeGreaterThan(0);
  });
});
