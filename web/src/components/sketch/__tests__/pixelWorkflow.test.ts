/**
 * Tests for pixel-workflow affordances:
 * - Pixel grid overlay (drawPixelGrid)
 * - Pencil snap-to-pixel
 * - PIXEL_GRID_MIN_ZOOM threshold
 */

import { drawPixelGrid, PIXEL_GRID_MIN_ZOOM } from "../drawingUtils";
import { PencilEngine } from "../painting/PencilEngine";

// ─── drawPixelGrid tests ────────────────────────────────────────────────────

describe("drawPixelGrid", () => {
  function createMockCtx(): CanvasRenderingContext2D {
    const calls: { method: string; args: unknown[] }[] = [];
    return {
      save: jest.fn(() => calls.push({ method: "save", args: [] })),
      restore: jest.fn(() => calls.push({ method: "restore", args: [] })),
      beginPath: jest.fn(() => calls.push({ method: "beginPath", args: [] })),
      moveTo: jest.fn((...a: number[]) =>
        calls.push({ method: "moveTo", args: a })
      ),
      lineTo: jest.fn((...a: number[]) =>
        calls.push({ method: "lineTo", args: a })
      ),
      stroke: jest.fn(() => calls.push({ method: "stroke", args: [] })),
      set strokeStyle(_v: string) {},
      set lineWidth(_v: number) {},
      _calls: calls
    } as unknown as CanvasRenderingContext2D;
  }

  it("does nothing below the minimum zoom threshold", () => {
    const ctx = createMockCtx();
    drawPixelGrid(ctx, 10, 10, PIXEL_GRID_MIN_ZOOM - 1);
    expect(ctx.save).not.toHaveBeenCalled();
    expect(ctx.stroke).not.toHaveBeenCalled();
  });

  it("draws grid lines at the minimum zoom threshold", () => {
    const ctx = createMockCtx();
    drawPixelGrid(ctx, 4, 4, PIXEL_GRID_MIN_ZOOM);
    expect(ctx.save).toHaveBeenCalled();
    expect(ctx.stroke).toHaveBeenCalled();
    expect(ctx.restore).toHaveBeenCalled();
    // For a 4×4 canvas: 5 vertical + 5 horizontal = 10 moveTo calls
    expect(ctx.moveTo).toHaveBeenCalledTimes(10);
  });

  it("draws correct number of grid lines for given dimensions", () => {
    const ctx = createMockCtx();
    drawPixelGrid(ctx, 8, 6, PIXEL_GRID_MIN_ZOOM * 2);
    // 9 vertical lines (x=0..8) + 7 horizontal lines (y=0..6) = 16 moveTo calls
    expect(ctx.moveTo).toHaveBeenCalledTimes(16);
    expect(ctx.lineTo).toHaveBeenCalledTimes(16);
  });

  it("PIXEL_GRID_MIN_ZOOM is 4", () => {
    expect(PIXEL_GRID_MIN_ZOOM).toBe(4);
  });
});

// ─── PencilEngine snap-to-pixel tests ───────────────────────────────────────

describe("PencilEngine snap-to-pixel", () => {
  it("stabilize() snaps to nearest integer", () => {
    const engine = new PencilEngine({ size: 1, opacity: 1, color: "#000000" });
    expect(engine.stabilize({ x: 3.7, y: 4.2 })).toEqual({ x: 4, y: 4 });
    expect(engine.stabilize({ x: 0.5, y: 0.5 })).toEqual({ x: 1, y: 1 });
    expect(engine.stabilize({ x: 0.3, y: 2.9 })).toEqual({ x: 0, y: 3 });
    expect(engine.stabilize({ x: 10.1, y: 7.8 })).toEqual({ x: 10, y: 8 });
  });

  it("evaluate() snaps coordinates to integers", () => {
    const engine = new PencilEngine({ size: 1, opacity: 1, color: "#000000" });
    engine.beginStroke();

    // Create a mock context to verify snapped coordinates
    const fillCalls: { x: number; y: number }[] = [];
    const ctx = {
      save: jest.fn(),
      restore: jest.fn(),
      beginPath: jest.fn(),
      arc: jest.fn(
        (x: number, y: number) => fillCalls.push({ x, y })
      ),
      fill: jest.fn(),
      moveTo: jest.fn(),
      lineTo: jest.fn(),
      stroke: jest.fn(),
      globalAlpha: 1,
      globalCompositeOperation: "source-over",
      fillStyle: "",
      imageSmoothingEnabled: true
    } as unknown as CanvasRenderingContext2D;

    // Draw a line with fractional coordinates
    engine.evaluate(
      { x: 1.3, y: 2.7 },
      { x: 3.8, y: 4.1 },
      ctx,
      0.5,
      0
    );

    // The arc calls should be at integer coordinates (snapped from 1.3→1, 2.7→3, etc.)
    for (const call of fillCalls) {
      expect(Number.isInteger(call.x)).toBe(true);
      expect(Number.isInteger(call.y)).toBe(true);
    }
  });
});
