/**
 * Package C — applySelectionConstraint parity tests.
 *
 * Tests the shared production helper in `selection/applySelectionConstraint.ts`
 * that FillTool and GradientTool both delegate to.  This ensures:
 *   1. Pixels outside the selection are reverted to their pre-draw values.
 *   2. Pixels inside the selection keep their new (post-draw) values.
 *   3. The offset parameters correctly translate canvas-local coordinates
 *      into document space before querying the selection mask.
 *   4. Edge cases (empty selection, fully-selected canvas, mask with origin
 *      offset, partially overlapping mask) are handled correctly.
 */

import type { Selection } from "../types";
import { applySelectionConstraintToBuffers } from "../selection/applySelectionConstraint";

// ─── helpers ────────────────────────────────────────────────────────────────

/** Create a Selection mask with a filled rectangular region in buffer space. */
function makeFilledSelection(
  width: number,
  height: number,
  fillX: number,
  fillY: number,
  fillW: number,
  fillH: number,
  originX = 0,
  originY = 0
): Selection {
  const data = new Uint8ClampedArray(width * height);
  const x0 = Math.max(0, fillX);
  const y0 = Math.max(0, fillY);
  const x1 = Math.min(width, fillX + fillW);
  const y1 = Math.min(height, fillY + fillH);
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      data[y * width + x] = 255;
    }
  }
  return { width, height, data, originX, originY };
}

/** Build a solid-color RGBA buffer. */
function solidBuffer(
  w: number,
  h: number,
  r: number,
  g: number,
  b: number,
  a: number
): Uint8ClampedArray {
  const buf = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < buf.length; i += 4) {
    buf[i] = r;
    buf[i + 1] = g;
    buf[i + 2] = b;
    buf[i + 3] = a;
  }
  return buf;
}

/** Read RGBA at (x, y). */
function readPixel(
  buf: Uint8ClampedArray,
  w: number,
  x: number,
  y: number
): [number, number, number, number] {
  const i = (y * w + x) * 4;
  return [buf[i], buf[i + 1], buf[i + 2], buf[i + 3]];
}

// ─── tests ──────────────────────────────────────────────────────────────────

describe("Package C – applySelectionConstraint (shared production helper)", () => {
  const W = 10;
  const H = 10;

  describe("basic inside/outside behavior with zero offset", () => {
    it("pixels outside the selection are reverted to before values", () => {
      // Selection: center 4×4 (3,3)→(6,6) in buffer, origin (0,0)
      const sel = makeFilledSelection(W, H, 3, 3, 4, 4);

      const before = solidBuffer(W, H, 255, 0, 0, 255); // red
      const after = solidBuffer(W, H, 0, 0, 255, 255); // blue

      applySelectionConstraintToBuffers(before, after, W, H, sel, 0, 0);

      // Outside pixel (0,0) should be reverted to red
      expect(readPixel(after, W, 0, 0)).toEqual([255, 0, 0, 255]);
      // Inside pixel (4,4) should stay blue
      expect(readPixel(after, W, 4, 4)).toEqual([0, 0, 255, 255]);
    });

    it("boundary pixel just inside selection keeps new value", () => {
      const sel = makeFilledSelection(W, H, 3, 3, 4, 4);
      const before = solidBuffer(W, H, 255, 0, 0, 255);
      const after = solidBuffer(W, H, 0, 255, 0, 255); // green

      applySelectionConstraintToBuffers(before, after, W, H, sel, 0, 0);

      // (3,3) is the first selected pixel
      expect(readPixel(after, W, 3, 3)).toEqual([0, 255, 0, 255]);
      // (2,2) is just outside
      expect(readPixel(after, W, 2, 2)).toEqual([255, 0, 0, 255]);
    });

    it("boundary pixel just outside selection reverts to before", () => {
      const sel = makeFilledSelection(W, H, 3, 3, 4, 4);
      const before = solidBuffer(W, H, 100, 100, 100, 255);
      const after = solidBuffer(W, H, 200, 200, 200, 255);

      applySelectionConstraintToBuffers(before, after, W, H, sel, 0, 0);

      // (7,7) is one past the last selected pixel (fill ends at 6 inclusive)
      expect(readPixel(after, W, 7, 7)).toEqual([100, 100, 100, 255]);
      // (6,6) is last inside pixel
      expect(readPixel(after, W, 6, 6)).toEqual([200, 200, 200, 255]);
    });
  });

  describe("offset translates canvas coords to document space", () => {
    it("with positive offset, canvas pixel (0,0) queries doc (offsetX, offsetY)", () => {
      // Mask: 20×20 buffer, filled (5,5)→(14,14), origin (0,0)
      // Only doc coords 5..14 are selected.
      const sel = makeFilledSelection(20, 20, 5, 5, 10, 10);

      // Canvas is 10×10; offset = (5, 5) means canvas (0,0) → doc (5,5).
      // So the entire canvas maps to doc (5,5)..(14,14) — fully selected.
      const before = solidBuffer(W, H, 255, 0, 0, 255);
      const after = solidBuffer(W, H, 0, 255, 0, 255);

      applySelectionConstraintToBuffers(before, after, W, H, sel, 5, 5);

      // Every pixel should stay green (inside selection)
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          expect(readPixel(after, W, x, y)).toEqual([0, 255, 0, 255]);
        }
      }
    });

    it("with offset shifting canvas partially outside selection, mixed result", () => {
      // Mask: 20×20 buffer, filled (5,5)→(14,14), origin (0,0)
      const sel = makeFilledSelection(20, 20, 5, 5, 10, 10);

      // Canvas 10×10, offset = (3, 3)
      // Canvas (0,0) → doc (3,3) → NOT selected (mask < 5)
      // Canvas (2,2) → doc (5,5) → selected
      const before = solidBuffer(W, H, 255, 0, 0, 255);
      const after = solidBuffer(W, H, 0, 0, 255, 255);

      applySelectionConstraintToBuffers(before, after, W, H, sel, 3, 3);

      // (0,0) → doc (3,3) → outside → red
      expect(readPixel(after, W, 0, 0)).toEqual([255, 0, 0, 255]);
      // (1,1) → doc (4,4) → outside → red
      expect(readPixel(after, W, 1, 1)).toEqual([255, 0, 0, 255]);
      // (2,2) → doc (5,5) → inside → blue
      expect(readPixel(after, W, 2, 2)).toEqual([0, 0, 255, 255]);
      // (9,9) → doc (12,12) → inside → blue
      expect(readPixel(after, W, 9, 9)).toEqual([0, 0, 255, 255]);
    });
  });

  describe("selection mask with non-zero origin", () => {
    it("mask origin is accounted for via selectionHitTest", () => {
      // Mask: 10×10 buffer fully filled, placed at doc origin (50, 50)
      // selectionHitTest checks doc coord: hit only for doc (50..59, 50..59)
      const sel = makeFilledSelection(10, 10, 0, 0, 10, 10, 50, 50);

      // Canvas 10×10, offset = (50, 50) → maps canvas (0,0) to doc (50,50)
      const before = solidBuffer(W, H, 255, 0, 0, 255);
      const after = solidBuffer(W, H, 0, 255, 0, 255);

      applySelectionConstraintToBuffers(before, after, W, H, sel, 50, 50);

      // All pixels map into the selected region → keep green
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          expect(readPixel(after, W, x, y)).toEqual([0, 255, 0, 255]);
        }
      }
    });

    it("canvas outside mask origin region reverts to before", () => {
      // Mask at doc origin (50, 50), but canvas offset is (0, 0)
      // Canvas (0,0) → doc (0,0) → not in mask (50..59) → outside
      const sel = makeFilledSelection(10, 10, 0, 0, 10, 10, 50, 50);

      const before = solidBuffer(W, H, 255, 0, 0, 255);
      const after = solidBuffer(W, H, 0, 0, 255, 255);

      applySelectionConstraintToBuffers(before, after, W, H, sel, 0, 0);

      // Nothing maps into doc (50..59) → everything reverted
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          expect(readPixel(after, W, x, y)).toEqual([255, 0, 0, 255]);
        }
      }
    });
  });

  describe("edge cases", () => {
    it("empty selection (all zeros) reverts every pixel", () => {
      const sel: Selection = {
        width: W,
        height: H,
        data: new Uint8ClampedArray(W * H) // all zeros
      };

      const before = solidBuffer(W, H, 100, 100, 100, 255);
      const after = solidBuffer(W, H, 200, 200, 200, 255);

      applySelectionConstraintToBuffers(before, after, W, H, sel, 0, 0);

      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          expect(readPixel(after, W, x, y)).toEqual([100, 100, 100, 255]);
        }
      }
    });

    it("fully selected mask keeps every new pixel", () => {
      const sel = makeFilledSelection(W, H, 0, 0, W, H);

      const before = solidBuffer(W, H, 100, 100, 100, 255);
      const after = solidBuffer(W, H, 200, 200, 200, 255);

      applySelectionConstraintToBuffers(before, after, W, H, sel, 0, 0);

      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          expect(readPixel(after, W, x, y)).toEqual([200, 200, 200, 255]);
        }
      }
    });

    it("mask smaller than canvas treats out-of-mask pixels as outside", () => {
      // 5×5 mask fully filled, origin (0,0); canvas is 10×10
      const sel = makeFilledSelection(5, 5, 0, 0, 5, 5);

      const before = solidBuffer(W, H, 255, 0, 0, 255);
      const after = solidBuffer(W, H, 0, 255, 0, 255);

      applySelectionConstraintToBuffers(before, after, W, H, sel, 0, 0);

      // (2,2) → doc (2,2) → inside 5×5 mask → green
      expect(readPixel(after, W, 2, 2)).toEqual([0, 255, 0, 255]);
      // (7,7) → doc (7,7) → outside 5×5 mask → red
      expect(readPixel(after, W, 7, 7)).toEqual([255, 0, 0, 255]);
    });

    it("mask with soft-edge values below threshold are treated as outside", () => {
      // Mask where all values are 127 (below THRESH=128) → nothing selected
      const sel: Selection = {
        width: W,
        height: H,
        data: new Uint8ClampedArray(W * H).fill(127)
      };

      const before = solidBuffer(W, H, 255, 0, 0, 255);
      const after = solidBuffer(W, H, 0, 0, 255, 255);

      applySelectionConstraintToBuffers(before, after, W, H, sel, 0, 0);

      // Everything reverted
      expect(readPixel(after, W, 5, 5)).toEqual([255, 0, 0, 255]);
    });

    it("mask with soft-edge values at threshold are treated as inside", () => {
      // Mask where all values are 128 (at THRESH) → everything selected
      const sel: Selection = {
        width: W,
        height: H,
        data: new Uint8ClampedArray(W * H).fill(128)
      };

      const before = solidBuffer(W, H, 255, 0, 0, 255);
      const after = solidBuffer(W, H, 0, 0, 255, 255);

      applySelectionConstraintToBuffers(before, after, W, H, sel, 0, 0);

      // Everything kept
      expect(readPixel(after, W, 5, 5)).toEqual([0, 0, 255, 255]);
    });

    it("transparent before/after pixels are handled correctly", () => {
      const sel = makeFilledSelection(W, H, 3, 3, 4, 4);
      const before = solidBuffer(W, H, 0, 0, 0, 0); // transparent
      const after = solidBuffer(W, H, 255, 255, 255, 128); // semi-transparent

      applySelectionConstraintToBuffers(before, after, W, H, sel, 0, 0);

      // Outside → transparent
      expect(readPixel(after, W, 0, 0)).toEqual([0, 0, 0, 0]);
      // Inside → semi-transparent white
      expect(readPixel(after, W, 4, 4)).toEqual([255, 255, 255, 128]);
    });
  });

  describe("parity: fill and gradient flows use the same production code path", () => {
    it("applying constraint twice with same inputs produces identical results", () => {
      const sel = makeFilledSelection(W, H, 2, 2, 6, 6);
      const before = solidBuffer(W, H, 10, 20, 30, 255);
      const after1 = solidBuffer(W, H, 200, 100, 50, 255);
      const after2 = solidBuffer(W, H, 200, 100, 50, 255);

      applySelectionConstraintToBuffers(before, after1, W, H, sel, 0, 0);
      applySelectionConstraintToBuffers(before, after2, W, H, sel, 0, 0);

      // Byte-for-byte identical
      expect(after1).toEqual(after2);
    });

    it("offset + mask-origin combination works consistently", () => {
      // Mask: 20×20, filled (0,0)→(9,9), origin (10, 10)
      // Hit region in doc space: (10,10)→(19,19)
      const sel = makeFilledSelection(20, 20, 0, 0, 10, 10, 10, 10);

      // Canvas offset (10, 10) → canvas (0,0) maps to doc (10,10) → inside
      const before = solidBuffer(W, H, 0, 0, 0, 255);
      const after = solidBuffer(W, H, 255, 255, 255, 255);

      applySelectionConstraintToBuffers(before, after, W, H, sel, 10, 10);

      // All pixels map to doc (10..19, 10..19) which is inside the selection
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          expect(readPixel(after, W, x, y)).toEqual([255, 255, 255, 255]);
        }
      }
    });
  });
});
