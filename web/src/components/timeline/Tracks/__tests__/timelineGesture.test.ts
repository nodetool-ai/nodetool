/**
 * macOS trackpad pinch, WebKit route.
 *
 * Pins the pinch scale math and the feature detection that keeps the gesture
 * listeners off browsers that report a pinch as a ctrlKey wheel instead.
 */

import { pinchMsPerPx, supportsWebKitGestures } from "../timelineGesture";

const MIN = 0.5;
const MAX = 500;

describe("pinchMsPerPx", () => {
  it("zooms in when the fingers move apart (scale > 1)", () => {
    expect(pinchMsPerPx(10, 2, MIN, MAX)).toBe(5);
  });

  it("zooms out when the fingers move together (scale < 1)", () => {
    expect(pinchMsPerPx(10, 0.5, MIN, MAX)).toBe(20);
  });

  it("holds the scale at a gesture that has not moved yet", () => {
    expect(pinchMsPerPx(10, 1, MIN, MAX)).toBe(10);
  });

  it("clamps to the zoom bounds", () => {
    expect(pinchMsPerPx(10, 1000, MIN, MAX)).toBe(MIN);
    expect(pinchMsPerPx(10, 0.001, MIN, MAX)).toBe(MAX);
  });

  it("falls back to the start scale for a zero or non-finite scale", () => {
    expect(pinchMsPerPx(10, 0, MIN, MAX)).toBe(10);
    expect(pinchMsPerPx(10, -1, MIN, MAX)).toBe(10);
    expect(pinchMsPerPx(10, Number.NaN, MIN, MAX)).toBe(10);
  });

  it("is cumulative, not incremental — the same scale gives the same result", () => {
    expect(pinchMsPerPx(10, 1.5, MIN, MAX)).toBe(pinchMsPerPx(10, 1.5, MIN, MAX));
  });
});

describe("supportsWebKitGestures", () => {
  it("detects a browser that dispatches gesture events", () => {
    expect(
      supportsWebKitGestures({ ongesturechange: null } as unknown as Window)
    ).toBe(true);
  });

  it("reports false where a pinch arrives as a ctrlKey wheel instead", () => {
    expect(supportsWebKitGestures({} as unknown as Window)).toBe(false);
  });
});
