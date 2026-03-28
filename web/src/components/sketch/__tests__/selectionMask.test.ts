import {
  buildSelectionBorderStrokeMask,
  createEmptyMask,
  ellipseSelectionMask,
  fillRectMask,
  marqueeAdjustedDocPoints,
  marqueeRectFromDocPoints,
  rectSelectionMask
} from "../selection/selectionMask";

describe("marqueeRectFromDocPoints", () => {
  it("matches fillRectMask coverage (no round-vs-floor drift)", () => {
    const start = { x: 10.6, y: 5.2 };
    const end = { x: 20.4, y: 15.8 };
    const { x, y, w, h } = marqueeRectFromDocPoints(start, end);
    const m1 = createEmptyMask(32, 32);
    fillRectMask(m1, x, y, w, h, 255);
    const m2 = createEmptyMask(32, 32);
    fillRectMask(m2, Math.min(start.x, end.x), Math.min(start.y, end.y), Math.abs(end.x - start.x), Math.abs(end.y - start.y), 255);
    expect(m1.data).toEqual(m2.data);
  });

  it("matches rectSelectionMask output for arbitrary fractional drag", () => {
    const a = { x: 3.1, y: 7.9 };
    const b = { x: 12.7, y: 2.2 };
    const r = marqueeRectFromDocPoints(a, b);
    const fromHelper = rectSelectionMask(64, 64, r.x, r.y, r.w, r.h);
    const fromFloat = rectSelectionMask(64, 64, Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y));
    expect(fromHelper.data).toEqual(fromFloat.data);
  });
});

describe("marqueeAdjustedDocPoints", () => {
  it("constrains to square from corner (Shift-style)", () => {
    const anchor = { x: 10, y: 10 };
    const pointer = { x: 25, y: 18 };
    const { start, end } = marqueeAdjustedDocPoints(anchor, pointer, {
      fromCenter: false,
      constrainSquare: true
    });
    expect(start).toEqual(anchor);
    expect(end.x).toBe(25);
    expect(end.y).toBe(25);
  });

  it("from-center with constrain yields square bounds", () => {
    const center = { x: 20, y: 20 };
    const pointer = { x: 32, y: 24 };
    const { start, end } = marqueeAdjustedDocPoints(center, pointer, {
      fromCenter: true,
      constrainSquare: true
    });
    const w = Math.abs(end.x - start.x);
    const h = Math.abs(end.y - start.y);
    expect(w).toBeCloseTo(h, 5);
    expect((start.x + end.x) / 2).toBeCloseTo(center.x, 5);
    expect((start.y + end.y) / 2).toBeCloseTo(center.y, 5);
  });
});

describe("ellipseSelectionMask", () => {
  it("fills center pixel for a small ellipse", () => {
    const m = ellipseSelectionMask(16, 16, 6, 6, 4, 4);
    expect(m.data[8 * 16 + 8]).toBeGreaterThanOrEqual(128);
    expect(m.data[6 * 16 + 6]).toBe(0);
  });
});

describe("buildSelectionBorderStrokeMask", () => {
  it("produces a ring around a solid rectangle (width 2)", () => {
    const m = createEmptyMask(12, 12);
    fillRectMask(m, 3, 3, 6, 6, 255);
    const border = buildSelectionBorderStrokeMask(m, 2);
    expect(border).not.toBeNull();
    const { width: w, height: h, data } = border!;
    expect(w).toBe(12);
    expect(h).toBe(12);
    // Center of rect should not be in the stroke
    expect(data[6 * w + 6]).toBe(0);
    // Top edge of selection (inside doc) should include stroke pixels
    expect(data[3 * w + 5]).toBeGreaterThanOrEqual(128);
  });
});
