/**
 * Browser image-runtime unit tests.
 *
 * Per the spike plan, we cover the pure geometry helpers directly. End-to-end
 * encode/decode is left for browser integration (the canvas APIs aren't worth
 * polyfilling in jsdom for a spike).
 */
import { describe, expect, it } from "vitest";

import {
  computeFitScale,
  computeResizeDims,
  computeRotatedDims,
  createBrowserImageRuntime,
  browserImageRuntime
} from "../browser.js";
import { EMPTY_IMAGE } from "../index.js";

describe("computeFitScale", () => {
  it("scales down a landscape image to fit a square box", () => {
    const { width, height, scale } = computeFitScale(2000, 1000, 500, 500);
    expect(width).toBe(500);
    expect(height).toBe(250);
    expect(scale).toBeCloseTo(0.25);
  });

  it("scales down a portrait image to fit a square box", () => {
    const { width, height } = computeFitScale(1000, 2000, 500, 500);
    expect(width).toBe(250);
    expect(height).toBe(500);
  });

  it("scales up when the target is larger than the source", () => {
    const { width, height, scale } = computeFitScale(100, 50, 400, 400);
    expect(width).toBe(400);
    expect(height).toBe(200);
    expect(scale).toBeCloseTo(4);
  });

  it("uses only the defined dimension when one is missing", () => {
    const { width, height } = computeFitScale(800, 400, 200, undefined);
    expect(width).toBe(200);
    expect(height).toBe(100);
  });

  it("returns source dims when both target dims are missing", () => {
    const { width, height, scale } = computeFitScale(400, 200, undefined, undefined);
    expect(width).toBe(400);
    expect(height).toBe(200);
    expect(scale).toBe(1);
  });

  it("handles zero source dims defensively", () => {
    const { width, height, scale } = computeFitScale(0, 0, 100, 100);
    expect(width).toBe(0);
    expect(height).toBe(0);
    expect(scale).toBe(1);
  });

  it("clamps tiny scales to at least 1 pixel", () => {
    const { width, height } = computeFitScale(10000, 10000, 1, 1);
    expect(width).toBe(1);
    expect(height).toBe(1);
  });
});

describe("computeResizeDims", () => {
  it("uses both dims when both given (no aspect lock)", () => {
    const dims = computeResizeDims(800, 600, 100, 50);
    expect(dims).toEqual({ width: 100, height: 50 });
  });

  it("derives height from width to preserve aspect", () => {
    const dims = computeResizeDims(800, 400, 200, undefined);
    expect(dims).toEqual({ width: 200, height: 100 });
  });

  it("derives width from height to preserve aspect", () => {
    const dims = computeResizeDims(800, 400, undefined, 100);
    expect(dims).toEqual({ width: 200, height: 100 });
  });

  it("falls back to source dims when nothing is requested", () => {
    const dims = computeResizeDims(800, 400, undefined, undefined);
    expect(dims).toEqual({ width: 800, height: 400 });
  });

  it("rounds fractional dims", () => {
    const dims = computeResizeDims(800, 400, 333.7, undefined);
    expect(dims.width).toBe(334);
    expect(dims.height).toBe(167);
  });
});

describe("computeRotatedDims", () => {
  it("preserves dims for 0°", () => {
    expect(computeRotatedDims(800, 400, 0)).toEqual({ width: 800, height: 400 });
  });

  it("swaps dims for 90°", () => {
    expect(computeRotatedDims(800, 400, 90)).toEqual({ width: 400, height: 800 });
  });

  it("preserves dims for 180°", () => {
    expect(computeRotatedDims(800, 400, 180)).toEqual({ width: 800, height: 400 });
  });

  it("swaps dims for 270°", () => {
    expect(computeRotatedDims(800, 400, 270)).toEqual({ width: 400, height: 800 });
  });

  it("normalizes negative angles", () => {
    expect(computeRotatedDims(800, 400, -90)).toEqual({ width: 400, height: 800 });
  });

  it("normalizes angles above 360°", () => {
    expect(computeRotatedDims(800, 400, 450)).toEqual({ width: 400, height: 800 });
  });

  it("preserves dims for non-90 multiples (canvas isn't expanded in spike)", () => {
    expect(computeRotatedDims(800, 400, 45)).toEqual({ width: 800, height: 400 });
  });
});

describe("browserImageRuntime no-op behavior", () => {
  // These run in any environment because empty images short-circuit before
  // touching canvas APIs (per the contract in index.ts).
  const rt = createBrowserImageRuntime();

  it("resize returns the input unchanged when bytes are empty", async () => {
    const out = await rt.resize(EMPTY_IMAGE, { width: 100, height: 100 });
    expect(out).toBe(EMPTY_IMAGE);
  });

  it("crop returns the input unchanged when bytes are empty", async () => {
    const out = await rt.crop(EMPTY_IMAGE, { x: 0, y: 0, width: 10, height: 10 });
    expect(out).toBe(EMPTY_IMAGE);
  });

  it("rotate returns the input unchanged when bytes are empty", async () => {
    const out = await rt.rotate(EMPTY_IMAGE, { angle: 90 });
    expect(out).toBe(EMPTY_IMAGE);
  });

  it("flip returns the input unchanged when bytes are empty", async () => {
    const out = await rt.flip(EMPTY_IMAGE, { horizontal: true });
    expect(out).toBe(EMPTY_IMAGE);
  });

  it("blur returns the input unchanged when bytes are empty", async () => {
    const out = await rt.blur(EMPTY_IMAGE, { radius: 5 });
    expect(out).toBe(EMPTY_IMAGE);
  });

  it("exports a shared singleton", () => {
    expect(browserImageRuntime).toBeDefined();
    expect(typeof browserImageRuntime.resize).toBe("function");
  });
});
