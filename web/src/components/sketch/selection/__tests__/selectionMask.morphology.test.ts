/**
 * @jest-environment node
 */

import type { Selection } from "../../types";
import {
  expandSelectionMask,
  contractSelectionMask,
  featherMaskAlpha,
  smoothSelectionBorders,
  buildSelectionOutsideStrokeMask,
  buildSelectionBorderStrokeMask
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

function makeRectSelection(
  w: number,
  h: number,
  rx: number,
  ry: number,
  rw: number,
  rh: number
): Selection {
  const sel = makeSel(w, h, 0);
  for (let y = ry; y < ry + rh && y < h; y++) {
    for (let x = rx; x < rx + rw && x < w; x++) {
      sel.data[y * w + x] = 255;
    }
  }
  return sel;
}

function countNonZero(sel: Selection): number {
  let count = 0;
  for (let i = 0; i < sel.data.length; i++) {
    if (sel.data[i] > 0) count++;
  }
  return count;
}

function countFull(sel: Selection): number {
  let count = 0;
  for (let i = 0; i < sel.data.length; i++) {
    if (sel.data[i] === 255) count++;
  }
  return count;
}

describe("expandSelectionMask", () => {
  it("grows the selection boundary outward", () => {
    const sel = makeRectSelection(20, 20, 8, 8, 4, 4);
    const before = countNonZero(sel);
    expandSelectionMask(sel, 2);
    const after = countNonZero(sel);
    expect(after).toBeGreaterThan(before);
  });

  it("expands a single center pixel", () => {
    const sel = makeSel(11, 11, 0);
    sel.data[5 * 11 + 5] = 255;
    expandSelectionMask(sel, 2);
    expect(sel.data[5 * 11 + 5]).toBe(255);
    expect(sel.data[5 * 11 + 3]).toBe(255);
    expect(sel.data[5 * 11 + 7]).toBe(255);
    expect(sel.data[3 * 11 + 5]).toBe(255);
    expect(sel.data[7 * 11 + 5]).toBe(255);
  });

  it("is a no-op with radius 0", () => {
    const sel = makeRectSelection(10, 10, 3, 3, 4, 4);
    const originalData = new Uint8ClampedArray(sel.data);
    expandSelectionMask(sel, 0);
    for (let i = 0; i < sel.data.length; i++) {
      expect(sel.data[i]).toBe(originalData[i]);
    }
  });

  it("is a no-op with negative radius", () => {
    const sel = makeRectSelection(10, 10, 3, 3, 4, 4);
    const originalData = new Uint8ClampedArray(sel.data);
    expandSelectionMask(sel, -5);
    for (let i = 0; i < sel.data.length; i++) {
      expect(sel.data[i]).toBe(originalData[i]);
    }
  });

  it("mutates in place", () => {
    const sel = makeRectSelection(10, 10, 4, 4, 2, 2);
    const dataRef = sel.data;
    expandSelectionMask(sel, 1);
    expect(sel.data).toBe(dataRef);
  });
});

describe("contractSelectionMask", () => {
  it("shrinks the selection boundary inward", () => {
    const sel = makeRectSelection(20, 20, 5, 5, 10, 10);
    const before = countNonZero(sel);
    contractSelectionMask(sel, 2);
    const after = countNonZero(sel);
    expect(after).toBeLessThan(before);
  });

  it("removes thin selections entirely", () => {
    const sel = makeRectSelection(20, 20, 9, 9, 2, 2);
    contractSelectionMask(sel, 3);
    expect(countNonZero(sel)).toBe(0);
  });

  it("is a no-op with radius 0", () => {
    const sel = makeRectSelection(10, 10, 3, 3, 4, 4);
    const originalData = new Uint8ClampedArray(sel.data);
    contractSelectionMask(sel, 0);
    for (let i = 0; i < sel.data.length; i++) {
      expect(sel.data[i]).toBe(originalData[i]);
    }
  });

  it("is a no-op with negative radius", () => {
    const sel = makeRectSelection(10, 10, 3, 3, 4, 4);
    const originalData = new Uint8ClampedArray(sel.data);
    contractSelectionMask(sel, -5);
    for (let i = 0; i < sel.data.length; i++) {
      expect(sel.data[i]).toBe(originalData[i]);
    }
  });

  it("mutates in place", () => {
    const sel = makeRectSelection(10, 10, 2, 2, 6, 6);
    const dataRef = sel.data;
    contractSelectionMask(sel, 1);
    expect(sel.data).toBe(dataRef);
  });
});

describe("featherMaskAlpha", () => {
  it("produces soft edges (values between 0 and 255)", () => {
    const sel = makeRectSelection(30, 30, 10, 10, 10, 10);
    featherMaskAlpha(sel, 3);
    let hasSoft = false;
    for (let i = 0; i < sel.data.length; i++) {
      const v = sel.data[i];
      if (v > 0 && v < 255) {
        hasSoft = true;
        break;
      }
    }
    expect(hasSoft).toBe(true);
  });

  it("keeps center pixels close to 255", () => {
    const sel = makeRectSelection(30, 30, 10, 10, 10, 10);
    featherMaskAlpha(sel, 2);
    expect(sel.data[15 * 30 + 15]).toBeGreaterThan(200);
  });

  it("is a no-op with radius 0", () => {
    const sel = makeRectSelection(10, 10, 3, 3, 4, 4);
    const originalData = new Uint8ClampedArray(sel.data);
    featherMaskAlpha(sel, 0);
    for (let i = 0; i < sel.data.length; i++) {
      expect(sel.data[i]).toBe(originalData[i]);
    }
  });

  it("clamps radius to MAX_SELECTION_FEATHER_RADIUS", () => {
    const sel = makeRectSelection(20, 20, 5, 5, 10, 10);
    featherMaskAlpha(sel, 1000);
    let hasSoft = false;
    for (let i = 0; i < sel.data.length; i++) {
      if (sel.data[i] > 0 && sel.data[i] < 255) {
        hasSoft = true;
        break;
      }
    }
    expect(hasSoft).toBe(true);
  });

  it("mutates in place", () => {
    const sel = makeRectSelection(10, 10, 3, 3, 4, 4);
    const dataRef = sel.data;
    featherMaskAlpha(sel, 2);
    expect(sel.data).toBe(dataRef);
  });
});

describe("smoothSelectionBorders", () => {
  it("re-binarizes after blur (only 0 or 255)", () => {
    const sel = makeRectSelection(20, 20, 5, 5, 10, 10);
    smoothSelectionBorders(sel, 2);
    for (let i = 0; i < sel.data.length; i++) {
      expect(sel.data[i] === 0 || sel.data[i] === 255).toBe(true);
    }
  });

  it("preserves overall selection area approximately", () => {
    const sel = makeRectSelection(30, 30, 10, 10, 10, 10);
    const before = countFull(sel);
    smoothSelectionBorders(sel, 1);
    const after = countFull(sel);
    expect(Math.abs(after - before)).toBeLessThan(before * 0.5);
  });

  it("mutates in place", () => {
    const sel = makeRectSelection(10, 10, 3, 3, 4, 4);
    const dataRef = sel.data;
    smoothSelectionBorders(sel, 1);
    expect(sel.data).toBe(dataRef);
  });

  it("clamps strength to minimum of 1", () => {
    const sel = makeRectSelection(10, 10, 3, 3, 4, 4);
    smoothSelectionBorders(sel, 0);
    for (let i = 0; i < sel.data.length; i++) {
      expect(sel.data[i] === 0 || sel.data[i] === 255).toBe(true);
    }
  });
});

describe("buildSelectionOutsideStrokeMask", () => {
  it("returns a ring mask outside the original selection", () => {
    const sel = makeRectSelection(20, 20, 6, 6, 8, 8);
    const ring = buildSelectionOutsideStrokeMask(sel, 2);
    expect(ring).not.toBeNull();
    for (let y = 6; y < 14; y++) {
      for (let x = 6; x < 14; x++) {
        expect(ring!.data[y * 20 + x]).toBe(0);
      }
    }
    expect(countNonZero(ring!)).toBeGreaterThan(0);
  });

  it("ring pixels are all outside the original", () => {
    const sel = makeRectSelection(20, 20, 6, 6, 8, 8);
    const ring = buildSelectionOutsideStrokeMask(sel, 1);
    expect(ring).not.toBeNull();
    for (let i = 0; i < ring!.data.length; i++) {
      if (ring!.data[i] > 0) {
        expect(sel.data[i]).toBe(0);
      }
    }
  });

  it("returns null for null input", () => {
    expect(buildSelectionOutsideStrokeMask(null as unknown as Selection, 2)).toBeNull();
  });

  it("returns null for empty mask", () => {
    const sel = makeSel(10, 10, 0);
    expect(buildSelectionOutsideStrokeMask(sel, 2)).toBeNull();
  });

  it("preserves origin from source selection", () => {
    const sel = makeRectSelection(10, 10, 3, 3, 4, 4);
    sel.originX = 5;
    sel.originY = 10;
    const ring = buildSelectionOutsideStrokeMask(sel, 1);
    expect(ring).not.toBeNull();
    expect(ring!.originX).toBe(5);
    expect(ring!.originY).toBe(10);
  });
});

describe("buildSelectionBorderStrokeMask", () => {
  it("returns a ring mask centered on the selection border", () => {
    const sel = makeRectSelection(30, 30, 10, 10, 10, 10);
    const ring = buildSelectionBorderStrokeMask(sel, 4);
    expect(ring).not.toBeNull();
    expect(countNonZero(ring!)).toBeGreaterThan(0);
  });

  it("ring contains pixels both inside and outside original", () => {
    const sel = makeRectSelection(30, 30, 10, 10, 10, 10);
    const ring = buildSelectionBorderStrokeMask(sel, 4);
    expect(ring).not.toBeNull();
    let hasInside = false;
    let hasOutside = false;
    for (let i = 0; i < ring!.data.length; i++) {
      if (ring!.data[i] > 0) {
        if (sel.data[i] > 0) hasInside = true;
        if (sel.data[i] === 0) hasOutside = true;
      }
    }
    expect(hasInside).toBe(true);
    expect(hasOutside).toBe(true);
  });

  it("returns null for null input", () => {
    expect(buildSelectionBorderStrokeMask(null as unknown as Selection, 2)).toBeNull();
  });

  it("returns null for empty mask", () => {
    const sel = makeSel(10, 10, 0);
    expect(buildSelectionBorderStrokeMask(sel, 2)).toBeNull();
  });

  it("preserves origin from source selection", () => {
    const sel = makeRectSelection(10, 10, 2, 2, 6, 6);
    sel.originX = 3;
    sel.originY = 7;
    const ring = buildSelectionBorderStrokeMask(sel, 1);
    expect(ring).not.toBeNull();
    expect(ring!.originX).toBe(3);
    expect(ring!.originY).toBe(7);
  });

  it("ring is binary (only 0 and 255)", () => {
    const sel = makeRectSelection(20, 20, 5, 5, 10, 10);
    const ring = buildSelectionBorderStrokeMask(sel, 2);
    expect(ring).not.toBeNull();
    for (let i = 0; i < ring!.data.length; i++) {
      expect(ring!.data[i] === 0 || ring!.data[i] === 255).toBe(true);
    }
  });
});
