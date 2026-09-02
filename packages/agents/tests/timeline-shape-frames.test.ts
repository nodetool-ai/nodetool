/**
 * Shape clips on the Canvas 2D path (F8, T16): paths, polygons, stars,
 * gradients, dashes and trim.
 *
 * `packages/timeline/tests/render.shapeGeometry.test.ts` pins what the geometry
 * functions decide. This reads the pixels `@napi-rs/canvas` actually produced,
 * because a shape that resolves to the right segments and then draws nothing —
 * a gradient assigned to the wrong property, a dash list a context ignores — is
 * exactly the failure a pure test cannot see.
 *
 * It also stands as the runtime half of I6: every member of `RasterContext2D`
 * is asserted present on a real skia context, so a member added for the browser
 * cannot silently be missing on the server.
 */

import { describe, expect, it } from "vitest";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import type {
  ClipAnimation,
  ClipShapeStyle,
  TimelineClip,
  TimelineSequence,
  TimelineTrack
} from "@nodetool-ai/timeline";
import {
  drawShape,
  resolveShapeFill,
  type RasterContext2D
} from "@nodetool-ai/timeline/scene";

import { renderTimelineFrames } from "../src/timeline-preview/frames.js";

const W = 240;
const H = 240;

/** Draw one style on a fresh surface and hand back its pixels. */
function raster(style: ClipShapeStyle, width = W, height = H) {
  const canvas = createCanvas(width, height);
  // SAFETY: `RasterContext2D` is the subset of the 2D canvas API `drawShape`
  // uses; the presence test below asserts a skia context provides all of it.
  const ctx = canvas.getContext("2d") as unknown as RasterContext2D;
  drawShape(ctx, style, width, height);
  const data = canvas.getContext("2d").getImageData(0, 0, width, height).data;
  return {
    /** RGBA at a pixel. */
    at(x: number, y: number): [number, number, number, number] {
      const i = (Math.round(y) * width + Math.round(x)) * 4;
      return [data[i]!, data[i + 1]!, data[i + 2]!, data[i + 3]!];
    },
    /** True where anything was drawn. */
    on(x: number, y: number): boolean {
      return this.at(x, y)[3] > 24;
    }
  };
}

describe("drawShape — polygons and stars", () => {
  it("puts a star's points where a sample around a circle finds them", () => {
    // A five-pointed star filling the surface. Sampling a circle just inside
    // the outer radius crosses the shape once per point and nowhere else, so
    // the run count is the point count.
    const pixels = raster({
      kind: "star",
      x: 0,
      y: 0,
      width: 1,
      height: 1,
      sides: 5,
      innerRadius: 0.45,
      fill: "#ffffff"
    });
    expect(countRuns(pixels, 0.9)).toBe(5);
  });

  it("counts a seven-sided polygon's sides the same way", () => {
    // A convex polygon's own vertices are the only places its outline reaches
    // the circumscribed circle, so the same sample counts sides.
    const pixels = raster({
      kind: "polygon",
      x: 0,
      y: 0,
      width: 1,
      height: 1,
      sides: 7,
      fill: "#ffffff"
    });
    expect(countRuns(pixels, 0.985)).toBe(7);
  });

  it("cuts a rect's corners off when a corner radius is set", () => {
    const square = { kind: "rect", x: 0, y: 0, width: 1, height: 1 } as const;
    expect(raster({ ...square, fill: "#ffffff" }).on(1, 1)).toBe(true);
    expect(
      raster({ ...square, fill: "#ffffff", cornerRadius: 0.25 }).on(1, 1)
    ).toBe(false);
  });
});

describe("drawShape — paths", () => {
  it("fills authored path data in the clip's normalized space", () => {
    // The lower-left triangle of the surface.
    const pixels = raster({
      kind: "path",
      d: "M 0 0 L 0 1 L 1 1 Z",
      fill: "#ffffff"
    });
    expect(pixels.on(W * 0.2, H * 0.8)).toBe(true);
    expect(pixels.on(W * 0.8, H * 0.2)).toBe(false);
  });

  it("draws nothing at all when the path data does not parse", () => {
    const pixels = raster({ kind: "path", d: "A 4 4 0", fill: "#ffffff" });
    expect(pixels.on(W / 2, H / 2)).toBe(false);
  });
});

describe("drawShape — gradients", () => {
  it("runs a linear fill from its first stop to its last across the box", () => {
    const pixels = raster({
      kind: "rect",
      x: 0,
      y: 0,
      width: 1,
      height: 1,
      fillStyle: {
        type: "linear",
        angle: 0,
        stops: [
          { offset: 0, color: "#ff0000" },
          { offset: 1, color: "#0000ff" }
        ]
      }
    });
    const [lr, , lb] = pixels.at(2, H / 2);
    const [rr, , rb] = pixels.at(W - 3, H / 2);
    expect(lr).toBeGreaterThan(240);
    expect(lb).toBeLessThan(16);
    expect(rb).toBeGreaterThan(240);
    expect(rr).toBeLessThan(16);
  });

  it("turns the axis with the angle", () => {
    const vertical = raster({
      kind: "rect",
      x: 0,
      y: 0,
      width: 1,
      height: 1,
      fillStyle: {
        type: "linear",
        angle: 90,
        stops: [
          { offset: 0, color: "#ff0000" },
          { offset: 1, color: "#0000ff" }
        ]
      }
    });
    expect(vertical.at(W / 2, 2)[0]).toBeGreaterThan(240);
    expect(vertical.at(W / 2, H - 3)[2]).toBeGreaterThan(240);
  });

  it("runs a radial fill from the centre out to the corners", () => {
    const pixels = raster({
      kind: "rect",
      x: 0,
      y: 0,
      width: 1,
      height: 1,
      fillStyle: {
        type: "radial",
        stops: [
          { offset: 0, color: "#ffffff" },
          { offset: 1, color: "#000000" }
        ]
      }
    });
    expect(pixels.at(W / 2, H / 2)[0]).toBeGreaterThan(240);
    expect(pixels.at(1, 1)[0]).toBeLessThan(24);
  });

  it("beats the plain colour when both are set", () => {
    const pixels = raster({
      kind: "rect",
      x: 0,
      y: 0,
      width: 1,
      height: 1,
      fill: "#00ff00",
      fillStyle: { type: "solid", color: "#ff0000" }
    });
    expect(pixels.at(W / 2, H / 2)).toEqual([255, 0, 0, 255]);
  });

  it("places a gradient against the box it is handed, not the surface", () => {
    // The seam T14 uses for gradient text: the box is the text block, not the
    // raster, so the same fill spans whatever it is measured against.
    const canvas = createCanvas(W, H);
    const ctx = canvas.getContext("2d") as unknown as RasterContext2D;
    const paint = resolveShapeFill(
      ctx,
      {
        type: "linear",
        angle: 0,
        stops: [
          { offset: 0, color: "#ff0000" },
          { offset: 1, color: "#0000ff" }
        ]
      },
      { x: 100, y: 0, width: 40, height: 10 }
    );
    ctx.fillStyle = paint;
    ctx.fillRect(0, 0, W, H);
    const pixels = canvas.getContext("2d").getImageData(0, 0, W, H).data;
    const red = (x: number): number => pixels[(120 * W + x) * 4]!;
    // Outside the box the gradient clamps to its end stops, so the transition
    // happens across the box and nowhere else.
    expect(red(90)).toBeGreaterThan(240);
    expect(red(150)).toBeLessThan(16);
  });
});

describe("drawShape — dashes, caps and trim", () => {
  const line = (over: Partial<ClipShapeStyle> = {}): ClipShapeStyle => ({
    kind: "line",
    x: 0,
    y: 0.5,
    x2: 1,
    y2: 0.5,
    stroke: "#ffffff",
    strokeWidthPx: 6,
    ...over
  });

  it("leaves a gap between dashes", () => {
    // 0.1 of the width on, 0.1 off: 24px each on a 240px surface.
    const pixels = raster(line({ dash: [0.1, 0.1] }));
    expect(pixels.on(12, H / 2)).toBe(true);
    expect(pixels.on(36, H / 2)).toBe(false);
    expect(pixels.on(60, H / 2)).toBe(true);
    expect(pixels.on(84, H / 2)).toBe(false);
  });

  it("draws one unbroken run without a dash pattern", () => {
    const pixels = raster(line());
    expect(pixels.on(36, H / 2)).toBe(true);
    expect(pixels.on(84, H / 2)).toBe(true);
  });

  it("strokes half the path's length at trimEnd 0.5", () => {
    const pixels = raster(line({ trimEnd: 0.5 }));
    // Measured as arc length: the lit run ends at half the line's length, and
    // a bounding-box reading could not tell that from a half-height stroke.
    expect(litRunLength(pixels, H / 2)).toBeCloseTo(W / 2, -1);
    expect(pixels.on(W * 0.45, H / 2)).toBe(true);
    expect(pixels.on(W * 0.55, H / 2)).toBe(false);
  });

  it("strokes the middle when both trim ends move in", () => {
    const pixels = raster(line({ trimStart: 0.25, trimEnd: 0.75 }));
    expect(pixels.on(W * 0.15, H / 2)).toBe(false);
    expect(pixels.on(W * 0.5, H / 2)).toBe(true);
    expect(pixels.on(W * 0.85, H / 2)).toBe(false);
    expect(litRunLength(pixels, H / 2)).toBeCloseTo(W / 2, -1);
  });

  it("trims a curve by its arc length, not by its box", () => {
    // A quarter circle of radius W centred on the surface's bottom-right
    // corner, drawn from due west round to due north.
    const arc = (fraction: number): [number, number] => {
      const angle = Math.PI * (1 + fraction / 2);
      return [W + W * Math.cos(angle), H + H * Math.sin(angle)];
    };
    const curve: ClipShapeStyle = {
      kind: "path",
      d: "M 0 1 C 0 0.4477 0.4477 0 1 0",
      stroke: "#ffffff",
      strokeWidthPx: 6
    };
    const half = raster({ ...curve, trimEnd: 0.5 });
    expect(half.on(...arc(0.4))).toBe(true);
    expect(half.on(...arc(0.6))).toBe(false);
    // Two thirds along the arc sits at 60% of the box's width, so a
    // box-based trim would have kept it. The whole path proves the probe
    // itself lands on the curve.
    expect(raster(curve).on(...arc(0.6))).toBe(true);
  });

  it("leaves the fill whole while the stroke is trimmed", () => {
    const pixels = raster({
      kind: "rect",
      x: 0.1,
      y: 0.1,
      width: 0.8,
      height: 0.8,
      fill: "#ffffff",
      stroke: "#ff0000",
      strokeWidthPx: 6,
      trimEnd: 0.1
    });
    expect(pixels.on(W / 2, H / 2)).toBe(true);
  });

  it("rounds a stroke's ends when lineCap says to", () => {
    // A round cap extends the stroke by half its width past the end point; a
    // butt cap stops on it.
    const end = Math.round(W * 0.5) + 2;
    expect(
      raster(line({ trimEnd: 0.5, lineCap: "round" })).on(end, H / 2)
    ).toBe(true);
    expect(raster(line({ trimEnd: 0.5, lineCap: "butt" })).on(end, H / 2)).toBe(
      false
    );
  });

  it("draws no stroke at all when the trim range is empty", () => {
    const pixels = raster(line({ trimStart: 0.5, trimEnd: 0.5 }));
    expect(pixels.on(W / 2, H / 2)).toBe(false);
  });
});

describe("RasterContext2D on @napi-rs/canvas (I6)", () => {
  it("provides every member the drawing rules call", () => {
    const ctx = createCanvas(4, 4).getContext("2d") as unknown as Record<
      string,
      unknown
    >;
    const methods = [
      "save",
      "restore",
      "translate",
      "scale",
      "rotate",
      "beginPath",
      "closePath",
      "moveTo",
      "lineTo",
      "bezierCurveTo",
      "quadraticCurveTo",
      "rect",
      "ellipse",
      "fill",
      "stroke",
      "clip",
      "clearRect",
      "fillRect",
      "setLineDash",
      "measureText",
      "fillText",
      "strokeText",
      "createLinearGradient",
      "createRadialGradient"
    ];
    for (const name of methods) {
      expect(typeof ctx[name], name).toBe("function");
    }
    for (const name of [
      "font",
      "fillStyle",
      "strokeStyle",
      "filter",
      "globalCompositeOperation",
      "globalAlpha",
      "lineWidth",
      "lineJoin",
      "lineCap",
      "textAlign",
      "textBaseline"
    ]) {
      expect(ctx[name], name).toBeDefined();
    }
  });
});

describe("an animated trim on a shape clip", () => {
  const tracks: TimelineTrack[] = [
    {
      id: "track-0",
      name: "V1",
      type: "video",
      index: 0,
      visible: true,
      locked: false
    }
  ];

  /** `trimEnd` sweeping 0 → 1 across the clip. */
  const sweep: ClipAnimation = {
    id: "draw-on",
    role: "in",
    preset: "custom",
    durationMs: 1000,
    custom: {
      curves: [
        {
          property: "trimEnd",
          keyframes: [
            { t: 0, value: 0 },
            { t: 1, value: 1 }
          ]
        }
      ]
    }
  };

  const clip = (animations?: ClipAnimation[]): TimelineClip => ({
    id: "stroke",
    trackId: "track-0",
    name: "Stroke",
    startMs: 0,
    durationMs: 1000,
    mediaType: "shape",
    sourceType: "generated",
    status: "generated",
    shapeStyle: {
      kind: "line",
      x: 0,
      y: 0.5,
      x2: 1,
      y2: 0.5,
      stroke: "#ffffff",
      strokeWidthPx: 8
    },
    animations
  });

  async function framesAt(
    timesMs: number[],
    animations?: ClipAnimation[]
  ): Promise<((x: number, y: number) => boolean)[]> {
    const sequence: TimelineSequence = {
      id: "seq-1",
      projectId: "proj-1",
      name: "Trim sequence",
      fps: 30,
      width: 320,
      height: 180,
      durationMs: 1000,
      tracks,
      clips: [clip(animations)],
      markers: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    const { frames } = await renderTimelineFrames({
      sequence,
      timesMs,
      width: 320,
      loadAsset: async () => null
    });
    return Promise.all(frames.map((frame) => litProbe(frame.png)));
  }

  it("draws a different length at two timecodes", async () => {
    const [early, late] = await framesAt([100, 900], [sweep]);
    // A tenth of the way in, the stroke has not reached the middle; nine
    // tenths in, it has passed it. Without the animated style reaching the
    // rasterizer both frames would be the clip's static (whole) outline.
    expect(early!(160, 90)).toBe(false);
    expect(late!(160, 90)).toBe(true);
  });

  it("holds the whole outline when nothing drives the trim", async () => {
    const [early, late] = await framesAt([100, 900]);
    expect(early!(160, 90)).toBe(true);
    expect(late!(160, 90)).toBe(true);
  });
});

/**
 * How many separate lit runs a circle of `radius` (as a fraction of the
 * inscribed radius) crosses — the point count of a star, the side count of a
 * polygon.
 */
function countRuns(
  pixels: { on(x: number, y: number): boolean },
  radius: number
): number {
  const samples = 720;
  const rx = (W / 2) * radius;
  const ry = (H / 2) * radius;
  const lit: boolean[] = [];
  for (let i = 0; i < samples; i++) {
    const angle = (i * 2 * Math.PI) / samples;
    lit.push(
      pixels.on(W / 2 + rx * Math.cos(angle), H / 2 + ry * Math.sin(angle))
    );
  }
  let runs = 0;
  for (let i = 0; i < samples; i++) {
    if (lit[i] && !lit[(i - 1 + samples) % samples]) runs++;
  }
  return runs;
}

/** The total lit width along one row, in pixels. */
function litRunLength(
  pixels: { on(x: number, y: number): boolean },
  y: number
): number {
  let count = 0;
  for (let x = 0; x < W; x++) {
    if (pixels.on(x, y)) count++;
  }
  return count;
}

/** A lit-pixel probe over a rendered PNG frame. */
async function litProbe(
  png: Uint8Array
): Promise<(x: number, y: number) => boolean> {
  const image = await loadImage(Buffer.from(png));
  const canvas = createCanvas(image.width, image.height);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(image, 0, 0);
  const data = ctx.getImageData(0, 0, image.width, image.height).data;
  return (x, y) => {
    const i = (Math.round(y) * image.width + Math.round(x)) * 4;
    // The frame is composited on black, so a lit pixel is a bright one.
    return data[i]! > 128;
  };
}
