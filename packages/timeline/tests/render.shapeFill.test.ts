import { createCanvas } from "@napi-rs/canvas";
import { describe, expect, it } from "vitest";
import { drawShape } from "../src/render/draw.js";

describe("shape gradient fill", () => {
  it("draws a soft radial glow from a gradient in fill", () => {
    const canvas = createCanvas(100, 100);
    drawShape(
      canvas.getContext("2d"),
      {
        kind: "ellipse",
        x: 0.1,
        y: 0.1,
        width: 0.8,
        height: 0.8,
        fill: {
          type: "radial",
          stops: [
            { offset: 0, color: "#ffffffcc" },
            { offset: 1, color: "#ffffff00" }
          ]
        }
      },
      100,
      100
    );
    const ctx = canvas.getContext("2d");
    const center = ctx.getImageData(50, 50, 1, 1).data[3]!;
    const edge = ctx.getImageData(12, 50, 1, 1).data[3]!;
    expect(center).toBeGreaterThan(150);
    expect(edge).toBeLessThan(center / 2);
  });
});
