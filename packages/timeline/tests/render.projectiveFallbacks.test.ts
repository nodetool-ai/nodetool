import { createCanvas, type Canvas } from "@napi-rs/canvas";
import { describe, expect, it } from "vitest";
import {
  drawTimelineFrame,
  type Canvas2DLayer,
  type CompositeContext2D
} from "../src/render/canvas2d.js";

const WIDTH = 384;
const HEIGHT = 216;

function context(canvas: Canvas): CompositeContext2D<Canvas> {
  return canvas.getContext("2d") as unknown as CompositeContext2D<Canvas>;
}

function tiltedLayer(
  overrides: Partial<Canvas2DLayer<Canvas>> = {}
): Canvas2DLayer<Canvas> {
  const source = createCanvas(156, 88);
  const sourceCtx = source.getContext("2d");
  sourceCtx.fillStyle = "#ffffff";
  sourceCtx.fillRect(0, 0, 156, 88);
  return {
    clipId: "tilt",
    source,
    sourceWidth: 156,
    sourceHeight: 88,
    opacity: 1,
    blendMode: "normal",
    zIndex: 0,
    transform: {
      position: { x: 0, y: 0 },
      scale: { x: 0.8, y: 0.8 },
      rotation: 0,
      rotationX: 6,
      rotationY: 7,
      perspective: 480,
      anchor: { x: 0.5, y: 0.5 }
    },
    ...overrides
  };
}

function shadow(id: string) {
  return {
    id,
    type: "dropShadow" as const,
    enabled: true,
    offsetX: 0,
    offsetY: 24,
    blur: 36,
    color: "#000000"
  };
}

/** Vends `limit` projective surfaces, then none. */
function limitedSurfaces(limit: number) {
  let vended = 0;
  return {
    alpha: true,
    projectiveSurface: (width: number, height: number) => {
      if (vended >= limit) return null;
      vended += 1;
      const canvas = createCanvas(width, height);
      return { ctx: context(canvas), surface: canvas };
    }
  };
}

function draw(layer: Canvas2DLayer<Canvas>, limit: number) {
  const output = createCanvas(WIDTH, HEIGHT);
  const report = drawTimelineFrame(
    context(output),
    [layer],
    { canvasWidth: WIDTH, canvasHeight: HEIGHT },
    limitedSurfaces(limit)
  );
  const alphaAt = (x: number, y: number) =>
    output.getContext("2d").getImageData(x, y, 1, 1).data[3] ?? 0;
  return { report, alphaAt };
}

describe("projective layer fallbacks", () => {
  it("reports perspective_skipped and still draws flat without a surface", () => {
    const { report, alphaAt } = draw(tiltedLayer(), 0);
    expect(report.degraded).toEqual([
      { clipId: "tilt", reason: "perspective_skipped" }
    ]);
    expect(alphaAt(192, 108)).toBeGreaterThan(0);
  });

  it("reports drop_shadow_skipped when only the layer surface is vended", () => {
    const { report, alphaAt } = draw(
      tiltedLayer({ effects: [shadow("a")] }),
      1
    );
    expect(report.degraded).toEqual([
      { clipId: "tilt", reason: "drop_shadow_skipped" }
    ]);
    expect(alphaAt(192, 108)).toBeGreaterThan(0);
  });

  it("draws the projected layer directly when no frame surface follows", () => {
    const { report, alphaAt } = draw(tiltedLayer(), 1);
    expect(report.degraded).toEqual([]);
    expect(alphaAt(192, 108)).toBeGreaterThan(0);
  });

  it("reports drop_shadow_extra_ignored for a second shadow with no effect surface", () => {
    const { report, alphaAt } = draw(
      tiltedLayer({ effects: [shadow("a"), shadow("b")] }),
      2
    );
    expect(report.degraded).toEqual([
      { clipId: "tilt", reason: "effect_surface_missing" },
      { clipId: "tilt", reason: "drop_shadow_extra_ignored" }
    ]);
    expect(alphaAt(192, 108)).toBeGreaterThan(0);
  });
});
