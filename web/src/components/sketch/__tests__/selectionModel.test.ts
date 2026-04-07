/**
 * Phase 1.5 – Harden selection model
 *
 * Tests for hit-testing, mask combination, hasAnyPixels,
 * originX/originY consistency, validation, and basic mask shapes.
 */
import {
  selectionHitTest,
  combineMasks,
  selectionHasAnyPixels,
  createEmptyMask,
  rectSelectionMask,
  ellipseSelectionMask,
  validateSelectionMask,
  sampleMask,
  getSelectionBounds,
  cloneSelectionMask,
  fillRectMask,
  invertMaskInPlace
} from "../selection/selectionMask";
import type { Selection } from "../types";

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

/** Create a small mask with specific pixels set to 255 */
function makeMask(
  w: number,
  h: number,
  filled: [number, number][],
  originX = 0,
  originY = 0
): Selection {
  const sel = createEmptyMask(w, h);
  for (const [x, y] of filled) {
    sel.data[y * w + x] = 255;
  }
  sel.originX = originX;
  sel.originY = originY;
  return sel;
}

/** Create a fully-filled mask */
function makeFullMask(w: number, h: number): Selection {
  const sel = createEmptyMask(w, h);
  sel.data.fill(255);
  return sel;
}

/* ================================================================== */
/*  selectionHitTest                                                  */
/* ================================================================== */
describe("selectionHitTest", () => {
  const sel = makeMask(4, 4, [
    [0, 0],
    [3, 0],
    [0, 3],
    [3, 3]
  ]);

  it("hits at boundary pixel (0, 0)", () => {
    expect(selectionHitTest(sel, 0, 0)).toBe(true);
  });

  it("misses outside selection (negative coords)", () => {
    expect(selectionHitTest(sel, -1, -1)).toBe(false);
  });

  it("hits at right edge (3, 0)", () => {
    expect(selectionHitTest(sel, 3, 0)).toBe(true);
  });

  it("hits at bottom edge (0, 3)", () => {
    expect(selectionHitTest(sel, 0, 3)).toBe(true);
  });

  it("misses just past right/bottom edge", () => {
    expect(selectionHitTest(sel, 4, 0)).toBe(false);
    expect(selectionHitTest(sel, 0, 4)).toBe(false);
  });

  it("misses on unselected interior pixel", () => {
    expect(selectionHitTest(sel, 1, 1)).toBe(false);
  });

  it("accounts for non-zero originX/originY", () => {
    const offset = makeMask(4, 4, [[0, 0]], 10, 20);
    // doc (10, 20) → buffer (0, 0)
    expect(selectionHitTest(offset, 10, 20)).toBe(true);
    // doc (0, 0) → buffer (-10, -20) → out of bounds
    expect(selectionHitTest(offset, 0, 0)).toBe(false);
  });

  it("floors sub-pixel coordinates", () => {
    // 0.9 floors to 0 → should hit pixel (0,0)
    expect(selectionHitTest(sel, 0.9, 0.9)).toBe(true);
    // 1.1 floors to 1 → pixel (1,1) is not selected
    expect(selectionHitTest(sel, 1.1, 1.1)).toBe(false);
    // 3.99 floors to 3 → should hit pixel (3,3)
    expect(selectionHitTest(sel, 3.99, 3.99)).toBe(true);
  });
});

/* ================================================================== */
/*  combineMasks                                                      */
/* ================================================================== */
describe("combineMasks", () => {
  describe("replace", () => {
    it("returns clone of overlay, ignoring base", () => {
      const base = makeFullMask(4, 4);
      const overlay = makeMask(4, 4, [[1, 1]]);
      const result = combineMasks(base, overlay, "replace");

      expect(result.width).toBe(4);
      expect(result.height).toBe(4);
      expect(result.data[1 * 4 + 1]).toBe(255);
      expect(result.data[0]).toBe(0); // base pixel ignored
    });

    it("works with null base", () => {
      const overlay = makeMask(4, 4, [[2, 2]]);
      const result = combineMasks(null, overlay, "replace");
      expect(result.data[2 * 4 + 2]).toBe(255);
      expect(result.data[0]).toBe(0);
    });
  });

  describe("add (union)", () => {
    it("merges overlapping selections", () => {
      const base = makeMask(4, 4, [[0, 0]]);
      const overlay = makeMask(4, 4, [[0, 0], [1, 1]]);
      const result = combineMasks(base, overlay, "add");

      // Both pixels present
      expect(result.data[0]).toBeGreaterThanOrEqual(128);
      expect(result.data[1 * 4 + 1]).toBeGreaterThanOrEqual(128);
    });

    it("adds non-overlapping selections", () => {
      const base = makeMask(4, 4, [[0, 0]]);
      const overlay = makeMask(4, 4, [[3, 3]]);
      const result = combineMasks(base, overlay, "add");

      expect(result.data[0]).toBeGreaterThanOrEqual(128);
      expect(result.data[3 * 4 + 3]).toBeGreaterThanOrEqual(128);
    });

    it("with null base returns clone of overlay", () => {
      const overlay = makeMask(4, 4, [[1, 0]]);
      const result = combineMasks(null, overlay, "add");
      expect(result.data[0 * 4 + 1]).toBe(255);
    });
  });

  describe("subtract", () => {
    it("removes overlay from base", () => {
      const base = makeFullMask(4, 4);
      const overlay = makeMask(4, 4, [[1, 1]]);
      const result = combineMasks(base, overlay, "subtract");

      // Subtracted pixel should be 0
      expect(result.data[1 * 4 + 1]).toBe(0);
      // Other pixels remain
      expect(result.data[0]).toBe(255);
    });

    it("subtract with no overlap leaves base unchanged", () => {
      const base = makeMask(4, 4, [[0, 0]]);
      const overlay = makeMask(4, 4, [[3, 3]]);
      const result = combineMasks(base, overlay, "subtract");

      expect(result.data[0]).toBe(255);
      expect(result.data[3 * 4 + 3]).toBe(0);
    });

    it("with null base returns clone of overlay", () => {
      const overlay = makeMask(4, 4, [[2, 2]]);
      const result = combineMasks(null, overlay, "subtract");
      // null base → treat as clone of overlay per code
      expect(result.data[2 * 4 + 2]).toBe(255);
    });
  });

  describe("intersect", () => {
    it("keeps only overlapping pixels", () => {
      const base = makeMask(4, 4, [[0, 0], [1, 1]]);
      const overlay = makeMask(4, 4, [[1, 1], [2, 2]]);
      const result = combineMasks(base, overlay, "intersect");

      expect(result.data[1 * 4 + 1]).toBeGreaterThanOrEqual(128);
      expect(result.data[0]).toBe(0);
      expect(result.data[2 * 4 + 2]).toBe(0);
    });

    it("with null base returns clone of overlay", () => {
      const overlay = makeMask(4, 4, [[1, 1]]);
      const result = combineMasks(null, overlay, "intersect");
      expect(result.data[1 * 4 + 1]).toBe(255);
    });
  });

  describe("different origin offsets", () => {
    it("aligns base to overlay document space", () => {
      const base = makeMask(4, 4, [[0, 0]], 10, 10);
      const overlay = makeMask(4, 4, [[0, 0]], 10, 10);
      const result = combineMasks(base, overlay, "add");

      // Both at same doc position → should combine
      expect(result.data[0]).toBeGreaterThanOrEqual(128);
    });
  });
});

/* ================================================================== */
/*  selectionHasAnyPixels                                             */
/* ================================================================== */
describe("selectionHasAnyPixels", () => {
  it("returns false for empty mask (all zeros)", () => {
    const sel = createEmptyMask(10, 10);
    expect(selectionHasAnyPixels(sel)).toBe(false);
  });

  it("returns true for mask with single selected pixel", () => {
    const sel = makeMask(10, 10, [[5, 5]]);
    expect(selectionHasAnyPixels(sel)).toBe(true);
  });

  it("returns true for fully selected mask", () => {
    const sel = makeFullMask(4, 4);
    expect(selectionHasAnyPixels(sel)).toBe(true);
  });

  it("returns false for null selection", () => {
    expect(selectionHasAnyPixels(null)).toBe(false);
  });

  it("returns false when all values are just below threshold (127)", () => {
    const sel = createEmptyMask(4, 4);
    sel.data.fill(127);
    expect(selectionHasAnyPixels(sel)).toBe(false);
  });

  it("returns true when any value is exactly at threshold (128)", () => {
    const sel = createEmptyMask(4, 4);
    sel.data[0] = 128;
    expect(selectionHasAnyPixels(sel)).toBe(true);
  });
});

/* ================================================================== */
/*  sampleMask & originX/originY consistency                          */
/* ================================================================== */
describe("sampleMask – origin handling", () => {
  it("samples buffer(0,0) when doc coords match origin", () => {
    const sel = makeMask(4, 4, [[0, 0]], 50, 50);
    // doc (50, 50) → buffer (0, 0) → 255
    expect(sampleMask(sel, 50, 50)).toBe(255);
  });

  it("returns 0 for doc coords before origin", () => {
    const sel = makeMask(4, 4, [[0, 0]], 50, 50);
    expect(sampleMask(sel, 49, 49)).toBe(0);
  });

  it("returns 0 for doc coords past buffer end", () => {
    const sel = makeMask(4, 4, [[0, 0]], 50, 50);
    // buffer extends from doc (50,50) to (53,53)
    expect(sampleMask(sel, 54, 54)).toBe(0);
  });

  it("default origin (0, 0) maps doc directly to buffer", () => {
    const sel = makeMask(4, 4, [[2, 3]]);
    expect(sampleMask(sel, 2, 3)).toBe(255);
    expect(sampleMask(sel, 0, 0)).toBe(0);
  });
});

describe("selectionHitTest – origin consistency", () => {
  it("hit test accounts for origin on ellipse-like selection", () => {
    // Simulate selection at doc offset 50,50
    const sel = makeMask(10, 10, [[5, 5]], 50, 50);
    // doc (55, 55) → buffer (5, 5) → selected
    expect(selectionHitTest(sel, 55, 55)).toBe(true);
    // doc (50, 50) → buffer (0, 0) → not selected
    expect(selectionHitTest(sel, 50, 50)).toBe(false);
    // doc (0, 0) → out of bounds → miss
    expect(selectionHitTest(sel, 0, 0)).toBe(false);
  });
});

/* ================================================================== */
/*  getSelectionBounds – origin-adjusted bounds                       */
/* ================================================================== */
describe("getSelectionBounds", () => {
  it("returns null for empty mask", () => {
    const sel = createEmptyMask(4, 4);
    expect(getSelectionBounds(sel)).toBeNull();
  });

  it("returns correct bounds for single pixel", () => {
    const sel = makeMask(10, 10, [[3, 7]]);
    const bounds = getSelectionBounds(sel);
    expect(bounds).toEqual({ x: 3, y: 7, width: 1, height: 1 });
  });

  it("returns bounds adjusted by originX/originY", () => {
    const sel = makeMask(10, 10, [[0, 0], [4, 4]], 20, 30);
    const bounds = getSelectionBounds(sel);
    expect(bounds).not.toBeNull();
    expect(bounds!.x).toBe(20); // 0 + originX
    expect(bounds!.y).toBe(30); // 0 + originY
    expect(bounds!.width).toBe(5); // 0..4 inclusive
    expect(bounds!.height).toBe(5);
  });

  it("bounds span full mask when fully selected", () => {
    const sel = makeFullMask(8, 6);
    const bounds = getSelectionBounds(sel);
    expect(bounds).toEqual({ x: 0, y: 0, width: 8, height: 6 });
  });
});

/* ================================================================== */
/*  validateSelectionMask                                             */
/* ================================================================== */
describe("validateSelectionMask", () => {
  it("returns false for null", () => {
    expect(validateSelectionMask(null)).toBe(false);
  });

  it("returns true for valid mask", () => {
    const sel = createEmptyMask(4, 4);
    expect(validateSelectionMask(sel)).toBe(true);
  });

  it("returns false for zero-width mask", () => {
    const sel: Selection = {
      width: 0,
      height: 4,
      data: new Uint8ClampedArray(0)
    };
    expect(validateSelectionMask(sel)).toBe(false);
  });

  it("returns false for zero-height mask", () => {
    const sel: Selection = {
      width: 4,
      height: 0,
      data: new Uint8ClampedArray(0)
    };
    expect(validateSelectionMask(sel)).toBe(false);
  });

  it("returns false when data length mismatches dimensions", () => {
    const sel: Selection = {
      width: 4,
      height: 4,
      data: new Uint8ClampedArray(10) // should be 16
    };
    expect(validateSelectionMask(sel)).toBe(false);
  });
});

/* ================================================================== */
/*  rectSelectionMask – shape verification                            */
/* ================================================================== */
describe("rectSelectionMask", () => {
  it("produces correct dimensions", () => {
    const sel = rectSelectionMask(20, 20, 5, 5, 10, 8);
    expect(sel.width).toBe(20);
    expect(sel.height).toBe(20);
  });

  it("fills the specified rectangle region", () => {
    const sel = rectSelectionMask(10, 10, 2, 3, 4, 3);
    // Inside rect
    expect(sel.data[3 * 10 + 2]).toBe(255);
    expect(sel.data[5 * 10 + 5]).toBe(255);
    // Outside rect
    expect(sel.data[0]).toBe(0);
    expect(sel.data[6 * 10 + 2]).toBe(0);
  });

  it("data length matches width * height", () => {
    const sel = rectSelectionMask(15, 12, 0, 0, 5, 5);
    expect(sel.data.length).toBe(15 * 12);
  });
});

/* ================================================================== */
/*  ellipseSelectionMask – shape verification                         */
/* ================================================================== */

/** Read mask value at document coordinate (dx, dy). */
function readMaskAt(sel: Selection, dx: number, dy: number): number {
  const ox = sel.originX ?? 0;
  const oy = sel.originY ?? 0;
  const lx = dx - ox;
  const ly = dy - oy;
  if (lx < 0 || lx >= sel.width || ly < 0 || ly >= sel.height) {
    return 0;
  }
  return sel.data[ly * sel.width + lx];
}

describe("ellipseSelectionMask", () => {
  it("produces correct dimensions matching ellipse bounding box", () => {
    const sel = ellipseSelectionMask(20, 20, 2, 2, 10, 10);
    // Mask covers the ellipse bounding box, not the full canvas
    expect(sel.width).toBe(10);
    expect(sel.height).toBe(10);
    expect(sel.originX).toBe(2);
    expect(sel.originY).toBe(2);
  });

  it("center pixel of ellipse is selected", () => {
    const sel = ellipseSelectionMask(20, 20, 5, 5, 10, 10);
    // center at document coord ~(10, 10)
    expect(readMaskAt(sel, 10, 10)).toBe(255);
  });

  it("corners outside ellipse are not selected", () => {
    const sel = ellipseSelectionMask(20, 20, 5, 5, 10, 10);
    // top-left corner of canvas is outside the mask
    expect(readMaskAt(sel, 0, 0)).toBe(0);
  });

  it("data length matches width * height of ellipse bounding box", () => {
    const sel = ellipseSelectionMask(16, 16, 0, 0, 8, 8);
    expect(sel.data.length).toBe(8 * 8);
  });
});

/* ================================================================== */
/*  cloneSelectionMask                                                */
/* ================================================================== */
describe("cloneSelectionMask", () => {
  it("produces independent copy with same data", () => {
    const src = makeMask(4, 4, [[1, 1]], 5, 10);
    const clone = cloneSelectionMask(src);

    expect(clone.width).toBe(src.width);
    expect(clone.height).toBe(src.height);
    expect(clone.originX).toBe(5);
    expect(clone.originY).toBe(10);
    expect(clone.data[1 * 4 + 1]).toBe(255);

    // Mutating clone should not affect source
    clone.data[0] = 128;
    expect(src.data[0]).toBe(0);
  });
});

/* ================================================================== */
/*  invertMaskInPlace                                                 */
/* ================================================================== */
describe("invertMaskInPlace", () => {
  it("inverts all pixel values", () => {
    const sel = makeMask(4, 4, [[0, 0]]);
    invertMaskInPlace(sel);

    // Originally 255 → now 0
    expect(sel.data[0]).toBe(0);
    // Originally 0 → now 255
    expect(sel.data[1]).toBe(255);
  });

  it("double invert returns to original", () => {
    const sel = makeMask(4, 4, [[2, 2]]);
    const original = new Uint8ClampedArray(sel.data);
    invertMaskInPlace(sel);
    invertMaskInPlace(sel);
    expect(sel.data).toEqual(original);
  });
});

/* ================================================================== */
/*  fillRectMask                                                      */
/* ================================================================== */
describe("fillRectMask", () => {
  it("fills specified region with value", () => {
    const sel = createEmptyMask(10, 10);
    fillRectMask(sel, 2, 2, 3, 3, 200);

    expect(sel.data[2 * 10 + 2]).toBe(200);
    expect(sel.data[4 * 10 + 4]).toBe(200);
    expect(sel.data[0]).toBe(0);
  });

  it("clamps to mask boundaries", () => {
    const sel = createEmptyMask(4, 4);
    // rect extends past right/bottom
    fillRectMask(sel, 2, 2, 10, 10, 255);

    expect(sel.data[3 * 4 + 3]).toBe(255);
    // should not throw
    expect(sel.data.length).toBe(16);
  });
});
