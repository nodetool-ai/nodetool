/**
 * @jest-environment node
 */

import type { Selection } from "../../types";
import type { Point } from "../../types";
import {
  createEmptyMask,
  cloneSelectionMask,
  validateSelectionMask,
  selectionHasAnyPixels,
  selectionHasSoftEdges,
  sampleMask,
  getSelectionBounds,
  fillRectMask,
  marqueeRectFromDocPoints,
  invertMaskInPlace,
  translateMask,
  trimSelectionMask,
  MAX_SELECTION_FEATHER_RADIUS
} from "../selectionMask";

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Build a small Selection for testing. */
function makeSel(
  w: number,
  h: number,
  fill: number | number[] = 0,
  originX?: number,
  originY?: number
): Selection {
  const data = new Uint8ClampedArray(w * h);
  if (typeof fill === "number") {
    data.fill(fill);
  } else {
    for (let i = 0; i < fill.length && i < data.length; i++) {
      data[i] = fill[i];
    }
  }
  const sel: Selection = { width: w, height: h, data };
  if (originX != null) sel.originX = originX;
  if (originY != null) sel.originY = originY;
  return sel;
}

// ─── createEmptyMask ─────────────────────────────────────────────────────────

describe("createEmptyMask", () => {
  it("creates a mask with the correct dimensions", () => {
    const mask = createEmptyMask(10, 20);
    expect(mask.width).toBe(10);
    expect(mask.height).toBe(20);
  });

  it("creates data of length width * height", () => {
    const mask = createEmptyMask(5, 7);
    expect(mask.data.length).toBe(35);
  });

  it("initializes all data bytes to zero", () => {
    const mask = createEmptyMask(4, 4);
    for (let i = 0; i < mask.data.length; i++) {
      expect(mask.data[i]).toBe(0);
    }
  });

  it("creates a Uint8ClampedArray", () => {
    const mask = createEmptyMask(2, 2);
    expect(mask.data).toBeInstanceOf(Uint8ClampedArray);
  });

  it("handles 1x1 mask", () => {
    const mask = createEmptyMask(1, 1);
    expect(mask.data.length).toBe(1);
    expect(mask.data[0]).toBe(0);
  });
});

// ─── cloneSelectionMask ──────────────────────────────────────────────────────

describe("cloneSelectionMask", () => {
  it("returns a mask with the same dimensions", () => {
    const src = makeSel(8, 6, 128);
    const clone = cloneSelectionMask(src);
    expect(clone.width).toBe(8);
    expect(clone.height).toBe(6);
  });

  it("copies data values", () => {
    const src = makeSel(3, 3, [10, 20, 30, 40, 50, 60, 70, 80, 90]);
    const clone = cloneSelectionMask(src);
    for (let i = 0; i < src.data.length; i++) {
      expect(clone.data[i]).toBe(src.data[i]);
    }
  });

  it("deep-copies data so modifying clone does not affect original", () => {
    const src = makeSel(2, 2, 100);
    const clone = cloneSelectionMask(src);
    clone.data[0] = 200;
    expect(src.data[0]).toBe(100);
  });

  it("deep-copies data so modifying original does not affect clone", () => {
    const src = makeSel(2, 2, 50);
    const clone = cloneSelectionMask(src);
    src.data[1] = 255;
    expect(clone.data[1]).toBe(50);
  });

  it("preserves originX and originY when present", () => {
    const src = makeSel(4, 4, 0, 10, 20);
    const clone = cloneSelectionMask(src);
    expect(clone.originX).toBe(10);
    expect(clone.originY).toBe(20);
  });

  it("omits originX/originY when not on source", () => {
    const src = makeSel(4, 4, 0);
    const clone = cloneSelectionMask(src);
    expect(clone.originX).toBeUndefined();
    expect(clone.originY).toBeUndefined();
  });
});

// ─── validateSelectionMask ───────────────────────────────────────────────────

describe("validateSelectionMask", () => {
  it("returns false for null", () => {
    expect(validateSelectionMask(null)).toBe(false);
  });

  it("returns true for a valid mask", () => {
    const sel = makeSel(5, 5);
    expect(validateSelectionMask(sel)).toBe(true);
  });

  it("returns false when width is 0", () => {
    const sel: Selection = { width: 0, height: 5, data: new Uint8ClampedArray(0) };
    expect(validateSelectionMask(sel)).toBe(false);
  });

  it("returns false when height is 0", () => {
    const sel: Selection = { width: 5, height: 0, data: new Uint8ClampedArray(0) };
    expect(validateSelectionMask(sel)).toBe(false);
  });

  it("returns false when data length does not match width * height", () => {
    const sel: Selection = { width: 3, height: 3, data: new Uint8ClampedArray(10) };
    expect(validateSelectionMask(sel)).toBe(false);
  });

  it("returns true when data length exactly matches width * height", () => {
    const sel: Selection = { width: 3, height: 4, data: new Uint8ClampedArray(12) };
    expect(validateSelectionMask(sel)).toBe(true);
  });
});

// ─── selectionHasAnyPixels ───────────────────────────────────────────────────

describe("selectionHasAnyPixels", () => {
  it("returns false for null", () => {
    expect(selectionHasAnyPixels(null)).toBe(false);
  });

  it("returns false when all data bytes are zero", () => {
    const sel = makeSel(4, 4, 0);
    expect(selectionHasAnyPixels(sel)).toBe(false);
  });

  it("returns true when any byte is greater than zero", () => {
    const sel = makeSel(4, 4, 0);
    sel.data[7] = 1;
    expect(selectionHasAnyPixels(sel)).toBe(true);
  });

  it("returns true when all bytes are 255", () => {
    const sel = makeSel(2, 2, 255);
    expect(selectionHasAnyPixels(sel)).toBe(true);
  });

  it("returns true for a single non-zero pixel in a large mask", () => {
    const sel = makeSel(100, 100, 0);
    sel.data[9999] = 128;
    expect(selectionHasAnyPixels(sel)).toBe(true);
  });
});

// ─── selectionHasSoftEdges ───────────────────────────────────────────────────

describe("selectionHasSoftEdges", () => {
  it("returns false for null", () => {
    expect(selectionHasSoftEdges(null)).toBe(false);
  });

  it("returns false for an all-zero mask", () => {
    const sel = makeSel(3, 3, 0);
    expect(selectionHasSoftEdges(sel)).toBe(false);
  });

  it("returns false for a binary mask (only 0 and 255)", () => {
    const sel = makeSel(2, 2, [0, 255, 255, 0]);
    expect(selectionHasSoftEdges(sel)).toBe(false);
  });

  it("returns true when any byte is between 1 and 254", () => {
    const sel = makeSel(2, 2, [0, 128, 255, 0]);
    expect(selectionHasSoftEdges(sel)).toBe(true);
  });

  it("returns true for value 1", () => {
    const sel = makeSel(1, 1, [1]);
    expect(selectionHasSoftEdges(sel)).toBe(true);
  });

  it("returns true for value 254", () => {
    const sel = makeSel(1, 1, [254]);
    expect(selectionHasSoftEdges(sel)).toBe(true);
  });

  it("returns false for all-255 mask", () => {
    const sel = makeSel(3, 3, 255);
    expect(selectionHasSoftEdges(sel)).toBe(false);
  });
});

// ─── sampleMask ──────────────────────────────────────────────────────────────

describe("sampleMask", () => {
  it("returns the correct byte value at a given position", () => {
    // 3x3 mask, fill row-by-row: [10,20,30, 40,50,60, 70,80,90]
    const sel = makeSel(3, 3, [10, 20, 30, 40, 50, 60, 70, 80, 90]);
    expect(sampleMask(sel, 0, 0)).toBe(10);
    expect(sampleMask(sel, 1, 0)).toBe(20);
    expect(sampleMask(sel, 2, 0)).toBe(30);
    expect(sampleMask(sel, 0, 1)).toBe(40);
    expect(sampleMask(sel, 1, 1)).toBe(50);
    expect(sampleMask(sel, 2, 2)).toBe(90);
  });

  it("returns 0 for coordinates out of bounds (negative)", () => {
    const sel = makeSel(3, 3, 255);
    expect(sampleMask(sel, -1, 0)).toBe(0);
    expect(sampleMask(sel, 0, -1)).toBe(0);
  });

  it("returns 0 for coordinates out of bounds (beyond width/height)", () => {
    const sel = makeSel(3, 3, 255);
    expect(sampleMask(sel, 3, 0)).toBe(0);
    expect(sampleMask(sel, 0, 3)).toBe(0);
  });

  it("accounts for originX and originY", () => {
    const sel = makeSel(2, 2, [10, 20, 30, 40], 5, 10);
    // Buffer position (0,0) is at doc (5, 10)
    expect(sampleMask(sel, 5, 10)).toBe(10);
    expect(sampleMask(sel, 6, 10)).toBe(20);
    expect(sampleMask(sel, 5, 11)).toBe(30);
    expect(sampleMask(sel, 6, 11)).toBe(40);
    // Out of bounds relative to origin
    expect(sampleMask(sel, 4, 10)).toBe(0);
    expect(sampleMask(sel, 7, 10)).toBe(0);
  });
});

// ─── getSelectionBounds ──────────────────────────────────────────────────────

describe("getSelectionBounds", () => {
  it("returns null for an all-zero mask", () => {
    const sel = makeSel(5, 5, 0);
    expect(getSelectionBounds(sel)).toBeNull();
  });

  it("returns null for null input", () => {
    // validateSelectionMask returns false for null, so getSelectionBounds returns null
    expect(getSelectionBounds(null as unknown as Selection)).toBeNull();
  });

  it("returns correct bounds for a single non-zero pixel", () => {
    const sel = makeSel(5, 5, 0);
    sel.data[2 * 5 + 3] = 200; // pixel at (3, 2)
    expect(getSelectionBounds(sel)).toEqual({ x: 3, y: 2, width: 1, height: 1 });
  });

  it("returns correct bounds for filled rectangle region", () => {
    const sel = makeSel(10, 10, 0);
    // Fill a 3x2 region at (2,3)
    for (let y = 3; y < 5; y++) {
      for (let x = 2; x < 5; x++) {
        sel.data[y * 10 + x] = 255;
      }
    }
    expect(getSelectionBounds(sel)).toEqual({ x: 2, y: 3, width: 3, height: 2 });
  });

  it("returns full mask dimensions when entirely filled", () => {
    const sel = makeSel(4, 6, 255);
    expect(getSelectionBounds(sel)).toEqual({ x: 0, y: 0, width: 4, height: 6 });
  });

  it("includes originX and originY in the returned bounds", () => {
    const sel = makeSel(5, 5, 0, 10, 20);
    sel.data[1 * 5 + 2] = 128; // buffer (2, 1) -> doc (12, 21)
    expect(getSelectionBounds(sel)).toEqual({ x: 12, y: 21, width: 1, height: 1 });
  });

  it("handles non-zero pixels only at corners", () => {
    const sel = makeSel(5, 5, 0);
    sel.data[0] = 1;           // top-left (0,0)
    sel.data[4 * 5 + 4] = 1;  // bottom-right (4,4)
    expect(getSelectionBounds(sel)).toEqual({ x: 0, y: 0, width: 5, height: 5 });
  });
});

// ─── fillRectMask ────────────────────────────────────────────────────────────

describe("fillRectMask", () => {
  it("fills a rectangle within the mask", () => {
    const sel = makeSel(5, 5, 0);
    fillRectMask(sel, 1, 1, 3, 2, 200);
    // Check filled region
    for (let y = 1; y < 3; y++) {
      for (let x = 1; x < 4; x++) {
        expect(sel.data[y * 5 + x]).toBe(200);
      }
    }
    // Check outside is still zero
    expect(sel.data[0]).toBe(0);
    expect(sel.data[4]).toBe(0);
  });

  it("clips to mask bounds when rectangle extends beyond", () => {
    const sel = makeSel(4, 4, 0);
    fillRectMask(sel, 2, 2, 10, 10, 128);
    // Only (2,2), (3,2), (2,3), (3,3) should be filled
    expect(sel.data[2 * 4 + 2]).toBe(128);
    expect(sel.data[2 * 4 + 3]).toBe(128);
    expect(sel.data[3 * 4 + 2]).toBe(128);
    expect(sel.data[3 * 4 + 3]).toBe(128);
    // Others zero
    expect(sel.data[0]).toBe(0);
    expect(sel.data[1 * 4 + 1]).toBe(0);
  });

  it("clips to mask bounds when rectangle starts at negative coords", () => {
    const sel = makeSel(4, 4, 0);
    fillRectMask(sel, -2, -2, 4, 4, 100);
    // Only (0,0) and (1,0), (0,1), (1,1) should be filled
    expect(sel.data[0]).toBe(100);
    expect(sel.data[1]).toBe(100);
    expect(sel.data[1 * 4 + 0]).toBe(100);
    expect(sel.data[1 * 4 + 1]).toBe(100);
    expect(sel.data[2 * 4 + 0]).toBe(0);
  });

  it("clamps value to 0-255 range", () => {
    const sel = makeSel(2, 2, 0);
    fillRectMask(sel, 0, 0, 2, 2, 300);
    expect(sel.data[0]).toBe(255);

    fillRectMask(sel, 0, 0, 2, 2, -10);
    expect(sel.data[0]).toBe(0);
  });

  it("handles zero-size rectangle (no change)", () => {
    const sel = makeSel(3, 3, 0);
    fillRectMask(sel, 1, 1, 0, 0, 255);
    for (let i = 0; i < sel.data.length; i++) {
      expect(sel.data[i]).toBe(0);
    }
  });
});

// ─── marqueeRectFromDocPoints ────────────────────────────────────────────────

describe("marqueeRectFromDocPoints", () => {
  it("normalizes coordinates when start is top-left of end", () => {
    const start: Point = { x: 10, y: 20 };
    const end: Point = { x: 50, y: 60 };
    const rect = marqueeRectFromDocPoints(start, end);
    expect(rect.x).toBe(10);
    expect(rect.y).toBe(20);
    expect(rect.w).toBe(40);
    expect(rect.h).toBe(40);
  });

  it("normalizes when end is before start (drag right-to-left)", () => {
    const start: Point = { x: 50, y: 60 };
    const end: Point = { x: 10, y: 20 };
    const rect = marqueeRectFromDocPoints(start, end);
    expect(rect.x).toBe(10);
    expect(rect.y).toBe(20);
    expect(rect.w).toBe(40);
    expect(rect.h).toBe(40);
  });

  it("handles fractional coordinates with floor/ceil", () => {
    const start: Point = { x: 1.3, y: 2.7 };
    const end: Point = { x: 5.8, y: 9.1 };
    const rect = marqueeRectFromDocPoints(start, end);
    expect(rect.x).toBe(Math.floor(1.3));  // 1
    expect(rect.y).toBe(Math.floor(2.7));  // 2
    expect(rect.w).toBe(Math.ceil(5.8) - Math.floor(1.3));  // 6 - 1 = 5
    expect(rect.h).toBe(Math.ceil(9.1) - Math.floor(2.7));  // 10 - 2 = 8
  });

  it("returns zero-size rect when start equals end (integer)", () => {
    const start: Point = { x: 5, y: 5 };
    const end: Point = { x: 5, y: 5 };
    const rect = marqueeRectFromDocPoints(start, end);
    expect(rect.w).toBe(0);
    expect(rect.h).toBe(0);
  });

  it("handles negative coordinates", () => {
    const start: Point = { x: -10, y: -20 };
    const end: Point = { x: -5, y: -8 };
    const rect = marqueeRectFromDocPoints(start, end);
    expect(rect.x).toBe(-10);
    expect(rect.y).toBe(-20);
    expect(rect.w).toBe(5);
    expect(rect.h).toBe(12);
  });
});

// ─── invertMaskInPlace ───────────────────────────────────────────────────────

describe("invertMaskInPlace", () => {
  it("inverts every byte: 0 becomes 255", () => {
    const sel = makeSel(2, 2, 0);
    invertMaskInPlace(sel);
    for (let i = 0; i < sel.data.length; i++) {
      expect(sel.data[i]).toBe(255);
    }
  });

  it("inverts every byte: 255 becomes 0", () => {
    const sel = makeSel(2, 2, 255);
    invertMaskInPlace(sel);
    for (let i = 0; i < sel.data.length; i++) {
      expect(sel.data[i]).toBe(0);
    }
  });

  it("inverts intermediate values correctly", () => {
    const sel = makeSel(1, 4, [0, 100, 200, 255]);
    invertMaskInPlace(sel);
    expect(sel.data[0]).toBe(255);
    expect(sel.data[1]).toBe(155);
    expect(sel.data[2]).toBe(55);
    expect(sel.data[3]).toBe(0);
  });

  it("double inversion restores original", () => {
    const sel = makeSel(3, 3, [10, 20, 30, 40, 50, 60, 70, 80, 90]);
    const originalData = new Uint8ClampedArray(sel.data);
    invertMaskInPlace(sel);
    invertMaskInPlace(sel);
    for (let i = 0; i < sel.data.length; i++) {
      expect(sel.data[i]).toBe(originalData[i]);
    }
  });

  it("mutates in place (same data reference)", () => {
    const sel = makeSel(2, 2, 100);
    const dataRef = sel.data;
    invertMaskInPlace(sel);
    expect(sel.data).toBe(dataRef);
  });
});

// ─── translateMask ───────────────────────────────────────────────────────────

describe("translateMask", () => {
  it("returns a mask with the same dimensions", () => {
    const sel = makeSel(4, 4, 128);
    const result = translateMask(sel, 1, 1);
    expect(result.width).toBe(4);
    expect(result.height).toBe(4);
  });

  it("shifts pixel data by (dx, dy) within the fixed buffer", () => {
    // 4x4 mask with a single pixel at (0, 0)
    const sel = makeSel(4, 4, 0);
    sel.data[0] = 200;
    const result = translateMask(sel, 2, 1);
    // Pixel should now be at (2, 1)
    expect(result.data[1 * 4 + 2]).toBe(200);
    // Original position should be empty
    expect(result.data[0]).toBe(0);
  });

  it("clips pixels that move out of bounds", () => {
    const sel = makeSel(3, 3, 255);
    const result = translateMask(sel, 2, 0);
    // Only column 2 should have values (shifted from column 0)
    expect(result.data[0]).toBe(0);
    expect(result.data[1]).toBe(0);
    expect(result.data[2]).toBe(255);
  });

  it("handles negative translation", () => {
    // 3x3 with pixel at (2, 2) = 100
    const sel = makeSel(3, 3, 0);
    sel.data[2 * 3 + 2] = 100;
    const result = translateMask(sel, -1, -1);
    // Should appear at (1, 1)
    expect(result.data[1 * 3 + 1]).toBe(100);
    expect(result.data[2 * 3 + 2]).toBe(0);
  });

  it("returns all zeros when shifted entirely out of bounds", () => {
    const sel = makeSel(3, 3, 255);
    const result = translateMask(sel, 10, 0);
    for (let i = 0; i < result.data.length; i++) {
      expect(result.data[i]).toBe(0);
    }
  });

  it("does not modify the source mask", () => {
    const sel = makeSel(3, 3, 128);
    const originalData = new Uint8ClampedArray(sel.data);
    translateMask(sel, 1, 1);
    for (let i = 0; i < sel.data.length; i++) {
      expect(sel.data[i]).toBe(originalData[i]);
    }
  });
});

// ─── trimSelectionMask ───────────────────────────────────────────────────────

describe("trimSelectionMask", () => {
  it("returns null for null input", () => {
    expect(trimSelectionMask(null)).toBeNull();
  });

  it("returns null for an all-zero mask", () => {
    const sel = makeSel(5, 5, 0);
    expect(trimSelectionMask(sel)).toBeNull();
  });

  it("trims to the bounding box of non-zero pixels", () => {
    // 5x5 mask with a 2x2 block at (1,2)
    const sel = makeSel(5, 5, 0);
    sel.data[2 * 5 + 1] = 255;
    sel.data[2 * 5 + 2] = 255;
    sel.data[3 * 5 + 1] = 255;
    sel.data[3 * 5 + 2] = 255;

    const trimmed = trimSelectionMask(sel);
    expect(trimmed).not.toBeNull();
    expect(trimmed!.width).toBe(2);
    expect(trimmed!.height).toBe(2);
    expect(trimmed!.originX).toBe(1);
    expect(trimmed!.originY).toBe(2);
    // All trimmed data should be 255
    for (let i = 0; i < trimmed!.data.length; i++) {
      expect(trimmed!.data[i]).toBe(255);
    }
  });

  it("preserves existing origin offsets", () => {
    // 4x4 mask with origin at (10, 20), single pixel at buffer (2, 1)
    const sel = makeSel(4, 4, 0, 10, 20);
    sel.data[1 * 4 + 2] = 128;

    const trimmed = trimSelectionMask(sel);
    expect(trimmed).not.toBeNull();
    expect(trimmed!.width).toBe(1);
    expect(trimmed!.height).toBe(1);
    expect(trimmed!.originX).toBe(12); // 10 + 2
    expect(trimmed!.originY).toBe(21); // 20 + 1
    expect(trimmed!.data[0]).toBe(128);
  });

  it("returns full mask when entirely filled (no trim needed)", () => {
    const sel = makeSel(3, 3, 255);
    const trimmed = trimSelectionMask(sel);
    expect(trimmed).not.toBeNull();
    expect(trimmed!.width).toBe(3);
    expect(trimmed!.height).toBe(3);
  });

  it("trims single-pixel mask at a corner", () => {
    const sel = makeSel(5, 5, 0);
    sel.data[4 * 5 + 4] = 1; // bottom-right corner
    const trimmed = trimSelectionMask(sel);
    expect(trimmed).not.toBeNull();
    expect(trimmed!.width).toBe(1);
    expect(trimmed!.height).toBe(1);
    expect(trimmed!.originX).toBe(4);
    expect(trimmed!.originY).toBe(4);
    expect(trimmed!.data[0]).toBe(1);
  });

  it("returns a deep copy of trimmed data", () => {
    const sel = makeSel(3, 3, 0);
    sel.data[1 * 3 + 1] = 200;
    const trimmed = trimSelectionMask(sel);
    expect(trimmed).not.toBeNull();
    trimmed!.data[0] = 0;
    expect(sel.data[1 * 3 + 1]).toBe(200);
  });
});

// ─── MAX_SELECTION_FEATHER_RADIUS ────────────────────────────────────────────

describe("MAX_SELECTION_FEATHER_RADIUS", () => {
  it("is exported as 32", () => {
    expect(MAX_SELECTION_FEATHER_RADIUS).toBe(32);
  });
});
