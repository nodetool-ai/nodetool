import { describe, expect, it } from "vitest";
import { createCanvas, type Canvas } from "@napi-rs/canvas";
import { aggregateBlurRadius } from "../src/render/effects.js";
import { drawTimelineFrame, filterForEffects, type CompositeContext2D } from "../src/render/canvas2d.js";

describe("export blur radius", () => {
  it("passes the requested wide blur to the GPU path", () => {
    expect(
      aggregateBlurRadius(
        [{ id: "wide", type: "blur", enabled: true, radius: 80 }],
        []
      )
    ).toBe(80);
  });

  it("keeps the full Gaussian support in the Canvas 2D fallback", () => {
    for (const radius of [80, 160, 240]) {
      expect(filterForEffects([
        { id: `blur-${radius}`, type: "blur", enabled: true, radius }
      ], [])).toContain(`blur(${(radius / 3).toFixed(2)}px)`);
    }
  });

  it("exports soft edges at radius 80, 160 and 240 in the Canvas 2D fallback", () => {
    const source = createCanvas(800, 800);
    const sourceCtx = source.getContext("2d");
    sourceCtx.fillStyle = "#ffffff";
    sourceCtx.beginPath();
    sourceCtx.ellipse(400, 400, 80, 80, 0, 0, Math.PI * 2);
    sourceCtx.fill();

    const alphaAt = (radius: number, distance: number): number => {
      const output = createCanvas(800, 800);
      const report = drawTimelineFrame(
        output.getContext("2d") as unknown as CompositeContext2D<Canvas>,
        [{ source, sourceWidth: 800, sourceHeight: 800, opacity: 1,
          blendMode: "normal", zIndex: 0,
          effects: [{ id: "blur", type: "blur", enabled: true, radius }] }],
        { canvasWidth: 800, canvasHeight: 800 }, { alpha: true }
      );
      expect(report.degraded).toEqual([]);
      return output.getContext("2d").getImageData(400 + distance, 400, 1, 1).data[3] ?? 0;
    };

    expect(alphaAt(80, 120)).toBeGreaterThan(0);
    expect(alphaAt(160, 160)).toBeGreaterThan(0);
    expect(alphaAt(240, 240)).toBeGreaterThan(0);
    expect(alphaAt(240, 160)).toBeGreaterThan(alphaAt(160, 160));
  });
});
