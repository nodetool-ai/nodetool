/**
 * @jest-environment node
 */

import type { Selection } from "../../types";
import type { Point } from "../../types";
import {
  selectionHitTest,
  rectSelectionMask,
  marqueeAdjustedDocPoints,
  ellipseSelectionMask,
  selectionToDocumentAligned,
  combineMasks,
  offsetSelectionByDocumentDelta,
  writeBinaryIntoMask,
  createEmptyMask
} from "../selectionMask";

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

describe("selectionHitTest", () => {
  it("returns true when mask value at floored coords is > 0", () => {
    const sel = makeSel(4, 4, 0);
    sel.data[1 * 4 + 2] = 128;
    expect(selectionHitTest(sel, 2, 1)).toBe(true);
    expect(selectionHitTest(sel, 2.9, 1.9)).toBe(true);
  });

  it("returns false when mask value at floored coords is 0", () => {
    const sel = makeSel(4, 4, 0);
    sel.data[1 * 4 + 2] = 128;
    expect(selectionHitTest(sel, 0, 0)).toBe(false);
    expect(selectionHitTest(sel, 3, 3)).toBe(false);
  });

  it("returns false for out-of-bounds coordinates", () => {
    const sel = makeSel(4, 4, 255);
    expect(selectionHitTest(sel, -1, 0)).toBe(false);
    expect(selectionHitTest(sel, 0, -1)).toBe(false);
    expect(selectionHitTest(sel, 4, 0)).toBe(false);
    expect(selectionHitTest(sel, 0, 4)).toBe(false);
  });

  it("accounts for origin offset", () => {
    const sel = makeSel(2, 2, 255, 10, 20);
    expect(selectionHitTest(sel, 10, 20)).toBe(true);
    expect(selectionHitTest(sel, 11, 21)).toBe(true);
    expect(selectionHitTest(sel, 9, 20)).toBe(false);
    expect(selectionHitTest(sel, 12, 20)).toBe(false);
  });
});

describe("rectSelectionMask", () => {
  it("creates a fully filled mask for the rectangle region", () => {
    const sel = rectSelectionMask(100, 100, 10, 20, 30, 40);
    expect(sel.originX).toBe(10);
    expect(sel.originY).toBe(20);
    expect(sel.width).toBe(30);
    expect(sel.height).toBe(40);
    for (let i = 0; i < sel.data.length; i++) {
      expect(sel.data[i]).toBe(255);
    }
  });

  it("clips to canvas bounds", () => {
    const sel = rectSelectionMask(10, 10, 8, 8, 5, 5);
    expect(sel.originX).toBe(8);
    expect(sel.originY).toBe(8);
    expect(sel.width).toBe(2);
    expect(sel.height).toBe(2);
  });

  it("returns a 1x1 empty mask for zero-size rect", () => {
    const sel = rectSelectionMask(100, 100, 50, 50, 0, 0);
    expect(sel.width).toBe(1);
    expect(sel.height).toBe(1);
    expect(sel.data[0]).toBe(0);
  });

  it("returns a 1x1 empty mask for negative-size rect", () => {
    const sel = rectSelectionMask(100, 100, 50, 50, -10, -10);
    expect(sel.width).toBe(1);
    expect(sel.height).toBe(1);
  });

  it("handles fractional coordinates with floor/ceil", () => {
    const sel = rectSelectionMask(100, 100, 1.3, 2.7, 3.5, 4.1);
    expect(sel.originX).toBe(1);
    expect(sel.originY).toBe(2);
    expect(sel.width).toBe(Math.ceil(1.3 + 3.5) - 1);
    expect(sel.height).toBe(Math.ceil(2.7 + 4.1) - 2);
  });
});

describe("marqueeAdjustedDocPoints", () => {
  it("returns anchor and pointer when no modifiers", () => {
    const anchor: Point = { x: 10, y: 20 };
    const pointer: Point = { x: 50, y: 60 };
    const result = marqueeAdjustedDocPoints(anchor, pointer, {
      fromCenter: false,
      constrainSquare: false
    });
    expect(result.start).toBe(anchor);
    expect(result.end).toEqual({ x: 50, y: 60 });
  });

  it("constrains to square from corner", () => {
    const anchor: Point = { x: 0, y: 0 };
    const pointer: Point = { x: 30, y: 20 };
    const result = marqueeAdjustedDocPoints(anchor, pointer, {
      fromCenter: false,
      constrainSquare: true
    });
    expect(result.start).toBe(anchor);
    expect(result.end.x).toBe(30);
    expect(result.end.y).toBe(30);
  });

  it("constrains to square with negative direction", () => {
    const anchor: Point = { x: 50, y: 50 };
    const pointer: Point = { x: 20, y: 30 };
    const result = marqueeAdjustedDocPoints(anchor, pointer, {
      fromCenter: false,
      constrainSquare: true
    });
    expect(result.end.x).toBe(50 - 30);
    expect(result.end.y).toBe(50 - 30);
  });

  it("draws from center", () => {
    const anchor: Point = { x: 50, y: 50 };
    const pointer: Point = { x: 70, y: 60 };
    const result = marqueeAdjustedDocPoints(anchor, pointer, {
      fromCenter: true,
      constrainSquare: false
    });
    expect(result.start).toEqual({ x: 30, y: 40 });
    expect(result.end).toEqual({ x: 70, y: 60 });
  });

  it("draws from center with square constraint", () => {
    const anchor: Point = { x: 50, y: 50 };
    const pointer: Point = { x: 70, y: 60 };
    const result = marqueeAdjustedDocPoints(anchor, pointer, {
      fromCenter: true,
      constrainSquare: true
    });
    expect(result.start).toEqual({ x: 30, y: 30 });
    expect(result.end).toEqual({ x: 70, y: 70 });
  });

  it("handles zero-distance pointer", () => {
    const anchor: Point = { x: 10, y: 10 };
    const result = marqueeAdjustedDocPoints(anchor, anchor, {
      fromCenter: false,
      constrainSquare: false
    });
    expect(result.start).toBe(anchor);
    expect(result.end).toEqual({ x: 10, y: 10 });
  });
});

describe("ellipseSelectionMask", () => {
  it("creates an ellipse mask with correct bounding box", () => {
    const sel = ellipseSelectionMask(100, 100, 10, 20, 30, 40);
    expect(sel.originX).toBe(10);
    expect(sel.originY).toBe(20);
    expect(sel.width).toBe(30);
    expect(sel.height).toBe(40);
  });

  it("fills pixels inside the ellipse with 255", () => {
    const sel = ellipseSelectionMask(100, 100, 0, 0, 20, 20);
    const cx = 10;
    const cy = 10;
    const rx = 10;
    const ry = 10;
    const ox = sel.originX ?? 0;
    const oy = sel.originY ?? 0;
    const centerIdx = (cy - oy) * sel.width + (cx - ox);
    expect(sel.data[centerIdx]).toBe(255);
  });

  it("does not fill corners of the bounding box", () => {
    const sel = ellipseSelectionMask(100, 100, 0, 0, 20, 20);
    expect(sel.data[0]).toBe(0);
  });

  it("returns full-canvas empty mask for zero-width ellipse", () => {
    const sel = ellipseSelectionMask(50, 50, 10, 10, 0, 20);
    expect(sel.width).toBe(50);
    expect(sel.height).toBe(50);
    for (let i = 0; i < sel.data.length; i++) {
      expect(sel.data[i]).toBe(0);
    }
  });

  it("returns full-canvas empty mask for zero-height ellipse", () => {
    const sel = ellipseSelectionMask(50, 50, 10, 10, 20, 0);
    expect(sel.width).toBe(50);
    expect(sel.height).toBe(50);
  });
});

describe("selectionToDocumentAligned", () => {
  it("rasterizes a mask into document-sized buffer at origin 0,0", () => {
    const sel = makeSel(2, 2, 255, 5, 5);
    const doc = selectionToDocumentAligned(sel, 10, 10);
    expect(doc.width).toBe(10);
    expect(doc.height).toBe(10);
    expect(doc.data[5 * 10 + 5]).toBe(255);
    expect(doc.data[5 * 10 + 6]).toBe(255);
    expect(doc.data[6 * 10 + 5]).toBe(255);
    expect(doc.data[6 * 10 + 6]).toBe(255);
    expect(doc.data[0]).toBe(0);
  });

  it("clips pixels that extend beyond document bounds", () => {
    const sel = makeSel(4, 4, 255, 8, 8);
    const doc = selectionToDocumentAligned(sel, 10, 10);
    expect(doc.data[8 * 10 + 8]).toBe(255);
    expect(doc.data[8 * 10 + 9]).toBe(255);
    expect(doc.data[9 * 10 + 8]).toBe(255);
    expect(doc.data[9 * 10 + 9]).toBe(255);
  });

  it("handles mask with no origin (defaults to 0,0)", () => {
    const sel = makeSel(3, 3, 128);
    const doc = selectionToDocumentAligned(sel, 5, 5);
    expect(doc.data[0]).toBe(128);
    expect(doc.data[2 * 5 + 2]).toBe(128);
    expect(doc.data[3 * 5]).toBe(0);
  });

  it("handles mask entirely outside document bounds", () => {
    const sel = makeSel(2, 2, 255, 100, 100);
    const doc = selectionToDocumentAligned(sel, 10, 10);
    for (let i = 0; i < doc.data.length; i++) {
      expect(doc.data[i]).toBe(0);
    }
  });
});

describe("combineMasks", () => {
  it("replace returns a clone of overlay", () => {
    const base = makeSel(4, 4, 128);
    const overlay = makeSel(4, 4, 200);
    const result = combineMasks(base, overlay, "replace");
    for (let i = 0; i < result.data.length; i++) {
      expect(result.data[i]).toBe(200);
    }
  });

  it("replace is used when base is null", () => {
    const overlay = makeSel(4, 4, 100);
    const result = combineMasks(null, overlay, "add");
    for (let i = 0; i < result.data.length; i++) {
      expect(result.data[i]).toBe(100);
    }
  });

  it("add combines pixel values (clamped to 255)", () => {
    const base = makeSel(4, 4, 200);
    const overlay = makeSel(4, 4, 100);
    const result = combineMasks(base, overlay, "add");
    for (let i = 0; i < result.data.length; i++) {
      expect(result.data[i]).toBe(255);
    }
  });

  it("add does not exceed 255", () => {
    const base = makeSel(2, 2, 128);
    const overlay = makeSel(2, 2, 128);
    const result = combineMasks(base, overlay, "add");
    expect(result.data[0]).toBe(255);
  });

  it("subtract removes overlay from base (clamped to 0)", () => {
    const base = makeSel(4, 4, 200);
    const overlay = makeSel(4, 4, 100);
    const result = combineMasks(base, overlay, "subtract");
    for (let i = 0; i < result.data.length; i++) {
      expect(result.data[i]).toBe(100);
    }
  });

  it("subtract does not go below 0", () => {
    const base = makeSel(2, 2, 50);
    const overlay = makeSel(2, 2, 100);
    const result = combineMasks(base, overlay, "subtract");
    expect(result.data[0]).toBe(0);
  });

  it("intersect takes the minimum of both masks", () => {
    const base = makeSel(4, 4, 200);
    const overlay = makeSel(4, 4, 100);
    const result = combineMasks(base, overlay, "intersect");
    for (let i = 0; i < result.data.length; i++) {
      expect(result.data[i]).toBe(100);
    }
  });

  it("handles masks with different origins (general path)", () => {
    const base = makeSel(2, 2, 255, 0, 0);
    const overlay = makeSel(2, 2, 255, 1, 1);
    const result = combineMasks(base, overlay, "add");
    expect(result.width).toBe(3);
    expect(result.height).toBe(3);
    expect(result.originX).toBe(0);
    expect(result.originY).toBe(0);
    expect(result.data[0]).toBe(255);
    expect(result.data[1 * 3 + 1]).toBe(255);
    expect(result.data[2 * 3 + 2]).toBe(255);
  });

  it("intersect with different origins zeros non-overlapping areas", () => {
    const base = makeSel(2, 2, 255, 0, 0);
    const overlay = makeSel(2, 2, 255, 3, 3);
    const result = combineMasks(base, overlay, "intersect");
    for (let i = 0; i < result.data.length; i++) {
      expect(result.data[i]).toBe(0);
    }
  });
});

describe("offsetSelectionByDocumentDelta", () => {
  it("shifts origin without rewriting data", () => {
    const sel = makeSel(4, 4, 128, 10, 20);
    const result = offsetSelectionByDocumentDelta(sel, 5, -3);
    expect(result.originX).toBe(15);
    expect(result.originY).toBe(17);
    expect(result.width).toBe(4);
    expect(result.height).toBe(4);
    for (let i = 0; i < result.data.length; i++) {
      expect(result.data[i]).toBe(128);
    }
  });

  it("defaults origin to 0,0 when not set", () => {
    const sel = makeSel(3, 3, 255);
    const result = offsetSelectionByDocumentDelta(sel, 10, 20);
    expect(result.originX).toBe(10);
    expect(result.originY).toBe(20);
  });

  it("creates a new data array (does not share buffer)", () => {
    const sel = makeSel(2, 2, 100);
    const result = offsetSelectionByDocumentDelta(sel, 1, 1);
    result.data[0] = 0;
    expect(sel.data[0]).toBe(100);
  });
});

describe("writeBinaryIntoMask", () => {
  it("replace mode overwrites mask data entirely", () => {
    const mask = makeSel(4, 4, 128);
    const binary = new Uint8ClampedArray(16);
    binary.fill(255);
    writeBinaryIntoMask(mask, binary, "replace");
    for (let i = 0; i < mask.data.length; i++) {
      expect(mask.data[i]).toBe(255);
    }
  });

  it("add mode unions binary into mask", () => {
    const mask = makeSel(2, 2, [255, 0, 0, 255]);
    const binary = new Uint8ClampedArray([0, 255, 0, 0]);
    writeBinaryIntoMask(mask, binary, "add");
    expect(mask.data[0]).toBe(255);
    expect(mask.data[1]).toBe(255);
    expect(mask.data[2]).toBe(0);
    expect(mask.data[3]).toBe(255);
  });

  it("subtract mode removes binary from mask", () => {
    const mask = makeSel(2, 2, 255);
    const binary = new Uint8ClampedArray([255, 0, 255, 0]);
    writeBinaryIntoMask(mask, binary, "subtract");
    expect(mask.data[0]).toBe(0);
    expect(mask.data[1]).toBe(255);
    expect(mask.data[2]).toBe(0);
    expect(mask.data[3]).toBe(255);
  });

  it("intersect mode keeps only overlapping regions", () => {
    const mask = makeSel(2, 2, [255, 255, 0, 0]);
    const binary = new Uint8ClampedArray([255, 0, 255, 0]);
    writeBinaryIntoMask(mask, binary, "intersect");
    expect(mask.data[0]).toBe(255);
    expect(mask.data[1]).toBe(0);
    expect(mask.data[2]).toBe(0);
    expect(mask.data[3]).toBe(0);
  });

  it("does nothing when binary length does not match mask", () => {
    const mask = makeSel(2, 2, 128);
    const binary = new Uint8ClampedArray(10);
    binary.fill(255);
    writeBinaryIntoMask(mask, binary, "replace");
    for (let i = 0; i < mask.data.length; i++) {
      expect(mask.data[i]).toBe(128);
    }
  });

  it("uses threshold of 128 for binarization in non-replace modes", () => {
    const mask = makeSel(2, 1, [127, 128]);
    const binary = new Uint8ClampedArray([255, 255]);
    writeBinaryIntoMask(mask, binary, "add");
    expect(mask.data[0]).toBe(255);
    expect(mask.data[1]).toBe(255);
  });
});
