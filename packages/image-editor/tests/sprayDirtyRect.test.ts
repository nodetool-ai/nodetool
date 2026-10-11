import { afterEach, describe, expect, it, vi } from "vitest";
import { drawBrushStroke } from "../src/painting/strokeRendering.js";
import type {
  BrushSettings,
  DirtyRectTracker,
  PaintContext2D
} from "../src/painting/types.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("spray brush dirty rect", () => {
  it("covers dots that spill past the spray radius", () => {
    // Every dot lands on the spray radius at its largest size.
    vi.spyOn(Math, "random").mockReturnValue(0.9999);
    const dots: Array<{ x: number; y: number; r: number }> = [];
    const ctx = {
      save: () => {},
      restore: () => {},
      beginPath: () => {},
      fill: () => {},
      arc: (x: number, y: number, r: number) => dots.push({ x, y, r })
    } as unknown as PaintContext2D;
    const settings = {
      size: 200,
      opacity: 1,
      hardness: 1,
      color: "#000000",
      brushType: "spray"
    } as BrushSettings;
    const tracker: DirtyRectTracker = { current: null };

    drawBrushStroke({ x: 500, y: 500 }, { x: 500, y: 500 }, settings, ctx, undefined, tracker, new Map());

    expect(dots.length).toBeGreaterThan(0);
    const box = tracker.current!;
    for (const dot of dots) {
      expect(dot.x - dot.r).toBeGreaterThanOrEqual(box.minX);
      expect(dot.x + dot.r).toBeLessThanOrEqual(box.maxX);
      expect(dot.y - dot.r).toBeGreaterThanOrEqual(box.minY);
      expect(dot.y + dot.r).toBeLessThanOrEqual(box.maxY);
    }
  });
});
