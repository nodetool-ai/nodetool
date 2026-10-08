/**
 * Raster windows: the part of the frame a text or shape clip's ink can reach.
 *
 * The browser preview allocates only this window and composites it in place,
 * so a window that is too small clips the drawing. Each case draws the style
 * into the full frame and asserts that every inked pixel lies inside the
 * window, and that drawing into the window alone reproduces those pixels.
 */
import { createCanvas } from "@napi-rs/canvas";
import { describe, expect, it } from "vitest";
import type { ClipEffect, ClipShapeStyle, ClipTextStyle } from "../src/index.js";
import {
  drawShape,
  drawText,
  rasterWindowMarginPx,
  shapeRasterWindow,
  textRasterWindow,
  type RasterContext2D,
  type RasterWindow
} from "../src/render/draw.js";
import { registerBundledFonts } from "../src/fonts/register-node.js";

registerBundledFonts();

const WIDTH = 640;
const HEIGHT = 360;

type Draw = (ctx: RasterContext2D) => void;

function inkBounds(rgba: Uint8ClampedArray, width: number, height: number): RasterWindow | null {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (rgba[(y * width + x) * 4 + 3] === 0) continue;
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x);
      y1 = Math.max(y1, y);
    }
  }
  return x1 < 0 ? null : { x: x0, y: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 };
}

/** Draws into the full frame and into `win` alone; returns both buffers over `win`. */
function drawBoth(draw: Draw, win: RasterWindow): { full: Uint8ClampedArray; ink: RasterWindow | null; windowed: Uint8ClampedArray; cut: Uint8ClampedArray } {
  const fullCanvas = createCanvas(WIDTH, HEIGHT);
  const fullCtx = fullCanvas.getContext("2d");
  draw(fullCtx as unknown as RasterContext2D);
  const full = fullCtx.getImageData(0, 0, WIDTH, HEIGHT).data;
  const windowCanvas = createCanvas(win.width, win.height);
  const windowCtx = windowCanvas.getContext("2d");
  windowCtx.translate(-win.x, -win.y);
  draw(windowCtx as unknown as RasterContext2D);
  return {
    full,
    ink: inkBounds(full, WIDTH, HEIGHT),
    windowed: windowCtx.getImageData(0, 0, win.width, win.height).data,
    cut: fullCtx.getImageData(win.x, win.y, win.width, win.height).data
  };
}

function expectWindowHoldsInk(draw: Draw, win: RasterWindow | null): void {
  expect(win).not.toBeNull();
  const w = win!;
  const { ink, windowed, cut } = drawBoth(draw, w);
  expect(ink).not.toBeNull();
  expect(ink!.x).toBeGreaterThanOrEqual(w.x);
  expect(ink!.y).toBeGreaterThanOrEqual(w.y);
  expect(ink!.x + ink!.width).toBeLessThanOrEqual(w.x + w.width);
  expect(ink!.y + ink!.height).toBeLessThanOrEqual(w.y + w.height);
  // Smaller than the frame, or the window saved nothing.
  expect(w.width * w.height).toBeLessThan(WIDTH * HEIGHT);
  let maxDiff = 0;
  for (let i = 0; i < cut.length; i++) maxDiff = Math.max(maxDiff, Math.abs(cut[i]! - windowed[i]!));
  expect(maxDiff).toBeLessThanOrEqual(1);
}

const shapes: Array<[string, ClipShapeStyle]> = [
  ["a filled rect", { kind: "rect", x: 0.4, y: 0.4, width: 0.2, height: 0.1, fill: "#ff0000" }],
  [
    "a stroked rounded rect",
    { kind: "rect", x: 0.1, y: 0.2, width: 0.3, height: 0.2, cornerRadius: 0.02, fill: "#112233", stroke: "#ffffff", strokeWidthPx: 12 }
  ],
  ["an ellipse", { kind: "ellipse", x: 0.6, y: 0.5, width: 0.2, height: 0.3, fill: "#00ff00", stroke: "#000000", strokeWidthPx: 4 }],
  ["a mitred star", { kind: "star", x: 0.3, y: 0.3, width: 0.2, height: 0.3, sides: 5, innerRadius: 0.2, stroke: "#ffff00", strokeWidthPx: 10, lineJoin: "miter" }],
  ["a square-capped line", { kind: "line", x: 0.2, y: 0.2, x2: 0.5, y2: 0.6, stroke: "#ffffff", strokeWidthPx: 14, lineCap: "square" }]
];

const texts: Array<[string, ClipTextStyle]> = [
  ["a centred title", { text: "Serein", fontSizePx: 64, color: "#ffffff", align: "center" }],
  [
    "a wrapped, stroked and shadowed line",
    {
      text: "The quiet hour before the light comes in",
      fontSizePx: 40,
      color: "#ffffff",
      align: "left",
      maxWidthFrac: 0.4,
      stroke: { color: "#000000", widthPx: 6 },
      shadow: { color: "#000000", blurPx: 12, offsetX: 8, offsetY: 10 }
    }
  ],
  [
    "a right-aligned caption on a plate",
    {
      text: "Chapter one",
      fontSizePx: 28,
      color: "#000000",
      align: "right",
      letterSpacingPx: 6,
      background: { color: "#ffffff", paddingPx: 18, radiusPx: 6 }
    }
  ]
];

describe("raster windows", () => {
  it.each(shapes)("holds every pixel of %s", (_name, style) => {
    expectWindowHoldsInk((ctx) => drawShape(ctx, style, WIDTH, HEIGHT), shapeRasterWindow(style, WIDTH, HEIGHT));
  });

  it.each(texts)("holds every pixel of %s", (_name, style) => {
    const measure = createCanvas(1, 1).getContext("2d") as unknown as RasterContext2D;
    expectWindowHoldsInk((ctx) => drawText(ctx, style, WIDTH, HEIGHT), textRasterWindow(measure, style, WIDTH, HEIGHT));
  });

  it("grows by the margin the effects ask for and stays inside the frame", () => {
    const style = shapes[0]![1];
    const bare = shapeRasterWindow(style, WIDTH, HEIGHT)!;
    const padded = shapeRasterWindow(style, WIDTH, HEIGHT, 40)!;
    // Both edges snap outward to a 16 px grid, so the growth is at least the
    // margin less one grid step.
    expect(padded.x).toBeLessThanOrEqual(bare.x - 24);
    expect(padded.x + padded.width).toBeGreaterThanOrEqual(bare.x + bare.width + 24);
    const huge = shapeRasterWindow(style, WIDTH, HEIGHT, 10_000)!;
    expect(huge).toEqual({ x: 0, y: 0, width: WIDTH, height: HEIGHT });
  });

  it("answers null for text with nothing to draw and the frame for path text", () => {
    const measure = createCanvas(1, 1).getContext("2d") as unknown as RasterContext2D;
    expect(textRasterWindow(measure, { text: "", fontSizePx: 20, color: "#fff" }, WIDTH, HEIGHT)).toBeNull();
    expect(
      textRasterWindow(measure, { text: "around", path: "M 0 0.5 L 1 0.5", fontSizePx: 20, color: "#fff" }, WIDTH, HEIGHT)
    ).toEqual({ x: 0, y: 0, width: WIDTH, height: HEIGHT });
  });
});

describe("rasterWindowMarginPx", () => {
  const effect = (e: ClipEffect): ClipEffect[] => [e];

  it("reserves three radii for a blur and a glow, offset plus blur for a shadow", () => {
    expect(rasterWindowMarginPx(effect({ id: "b", type: "blur", enabled: true, radius: 10 }))).toBe(30);
    expect(rasterWindowMarginPx(effect({ id: "g", type: "glow", enabled: true, radius: 4, intensity: 1 }))).toBe(12);
    expect(
      rasterWindowMarginPx(effect({ id: "d", type: "dropShadow", enabled: true, offsetX: -6, offsetY: 2, blur: 5, color: "#000" }))
    ).toBe(21);
  });

  it("adds nothing for a colour grade or a disabled effect", () => {
    expect(rasterWindowMarginPx(effect({ id: "c", type: "color", enabled: true, brightness: 0.4 }))).toBe(0);
    expect(rasterWindowMarginPx(effect({ id: "v", type: "vignette", enabled: false } as ClipEffect))).toBe(0);
    expect(rasterWindowMarginPx(undefined)).toBe(0);
  });

  it("refuses a window when an effect reads the whole frame", () => {
    expect(rasterWindowMarginPx(effect({ id: "v", type: "vignette", enabled: true } as ClipEffect))).toBeNull();
    expect(rasterWindowMarginPx(effect({ id: "n", type: "grain", enabled: true } as ClipEffect))).toBeNull();
  });
});
