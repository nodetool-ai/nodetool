/**
 * Phase 1 — Alpha-lock shared utility tests.
 *
 * Verifies that captureAlphaSnapshot and restoreAlphaFromSnapshot work
 * correctly and match the behavior previously inlined in CloneStampTool
 * and BlurTool.
 *
 * Covers SKETCH_FEATURES.md Phase 1.1 item:
 * - Route flood fill, clone stamp, blur, and adjustments through shared
 *   session boundaries even when their internal implementation stays CPU-backed.
 */

import {
  captureAlphaSnapshot,
  restoreAlphaFromSnapshot
} from "../painting/alphaLock";

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeCanvas(
  width: number,
  height: number,
  fillFn?: (ctx: CanvasRenderingContext2D) => void
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  if (fillFn) {
    const ctx = canvas.getContext("2d");
    if (ctx) {
      fillFn(ctx);
    }
  }
  return canvas;
}

function getAlphaAt(canvas: HTMLCanvasElement, x: number, y: number): number {
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return -1;
  }
  return ctx.getImageData(x, y, 1, 1).data[3];
}

// ─── captureAlphaSnapshot ───────────────────────────────────────────────────

describe("captureAlphaSnapshot", () => {
  it("returns an ImageData with the full canvas contents", () => {
    const canvas = makeCanvas(4, 4, (ctx) => {
      ctx.fillStyle = "rgba(255, 0, 0, 0.5)";
      ctx.fillRect(0, 0, 4, 4);
    });
    const snapshot = captureAlphaSnapshot(canvas);
    expect(snapshot).not.toBeNull();
    expect(snapshot!.width).toBe(4);
    expect(snapshot!.height).toBe(4);
    // Alpha should be ~128 (0.5 * 255)
    expect(snapshot!.data[3]).toBeGreaterThan(100);
    expect(snapshot!.data[3]).toBeLessThan(160);
  });

  it("returns null when canvas context is unavailable", () => {
    const canvas = makeCanvas(4, 4);
    jest.spyOn(canvas, "getContext").mockReturnValue(null);
    expect(captureAlphaSnapshot(canvas)).toBeNull();
  });
});

// ─── restoreAlphaFromSnapshot ───────────────────────────────────────────────

describe("restoreAlphaFromSnapshot", () => {
  it("clamps alpha to pre-stroke values in the dirty region", () => {
    // Start with a half-transparent canvas
    const canvas = makeCanvas(8, 8, (ctx) => {
      ctx.fillStyle = "rgba(255, 0, 0, 0.5)";
      ctx.fillRect(0, 0, 8, 8);
    });
    const snapshot = captureAlphaSnapshot(canvas)!;

    // Simulate a stroke that increases alpha to full opacity
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "rgba(0, 255, 0, 1.0)";
    ctx.fillRect(2, 2, 4, 4);

    // Before restore: stroke area should be fully opaque
    expect(getAlphaAt(canvas, 3, 3)).toBe(255);

    // Restore alpha in the dirty region
    restoreAlphaFromSnapshot(canvas, snapshot, {
      minX: 2,
      minY: 2,
      maxX: 6,
      maxY: 6
    });

    // After restore: alpha clamped back to ~128
    const restoredAlpha = getAlphaAt(canvas, 3, 3);
    expect(restoredAlpha).toBeGreaterThan(100);
    expect(restoredAlpha).toBeLessThan(160);

    // Color should still be green (only alpha is clamped, not RGB)
    const pixel = ctx.getImageData(3, 3, 1, 1).data;
    expect(pixel[1]).toBeGreaterThan(pixel[0]); // more green than red
  });

  it("processes entire canvas when no dirty rect is provided", () => {
    const canvas = makeCanvas(4, 4, (ctx) => {
      ctx.fillStyle = "rgba(255, 0, 0, 0.5)";
      ctx.fillRect(0, 0, 4, 4);
    });
    const snapshot = captureAlphaSnapshot(canvas)!;

    // Overwrite with full opacity
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "rgba(0, 0, 255, 1.0)";
    ctx.fillRect(0, 0, 4, 4);

    restoreAlphaFromSnapshot(canvas, snapshot);

    // Every pixel should have clamped alpha
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < 4; x++) {
        const a = getAlphaAt(canvas, x, y);
        expect(a).toBeGreaterThan(100);
        expect(a).toBeLessThan(160);
      }
    }
  });

  it("does not increase alpha beyond pre-stroke value", () => {
    // Canvas starts fully transparent
    const canvas = makeCanvas(4, 4);
    const snapshot = captureAlphaSnapshot(canvas)!;

    // Draw something opaque
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "rgba(255, 0, 0, 1.0)";
    ctx.fillRect(0, 0, 4, 4);

    restoreAlphaFromSnapshot(canvas, snapshot);

    // Alpha should be restored to 0 (transparent)
    expect(getAlphaAt(canvas, 0, 0)).toBe(0);
  });

  it("handles dirty rect that extends outside canvas bounds", () => {
    const canvas = makeCanvas(4, 4, (ctx) => {
      ctx.fillStyle = "rgba(255, 0, 0, 0.5)";
      ctx.fillRect(0, 0, 4, 4);
    });
    const snapshot = captureAlphaSnapshot(canvas)!;

    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "rgba(0, 0, 0, 1.0)";
    ctx.fillRect(0, 0, 4, 4);

    // Dirty rect extends past canvas bounds — should not crash
    restoreAlphaFromSnapshot(canvas, snapshot, {
      minX: -2,
      minY: -2,
      maxX: 10,
      maxY: 10
    });

    const a = getAlphaAt(canvas, 0, 0);
    expect(a).toBeGreaterThan(100);
    expect(a).toBeLessThan(160);
  });

  it("handles zero-size dirty rect gracefully", () => {
    const canvas = makeCanvas(4, 4, (ctx) => {
      ctx.fillStyle = "rgba(255, 0, 0, 1.0)";
      ctx.fillRect(0, 0, 4, 4);
    });
    const snapshot = captureAlphaSnapshot(canvas)!;

    // Zero-width dirty rect should be a no-op
    restoreAlphaFromSnapshot(canvas, snapshot, {
      minX: 2,
      minY: 2,
      maxX: 2, // zero width
      maxY: 2
    });

    // Canvas should be unchanged
    expect(getAlphaAt(canvas, 2, 2)).toBe(255);
  });

  it("does nothing when canvas context is unavailable", () => {
    const canvas = makeCanvas(4, 4);
    const snapshot = captureAlphaSnapshot(canvas)!;
    jest.spyOn(canvas, "getContext").mockReturnValue(null);

    // Should not throw
    expect(() =>
      restoreAlphaFromSnapshot(canvas, snapshot)
    ).not.toThrow();
  });
});
