/**
 * @jest-environment node
 */
import {
  clampCropRectToCanvas,
  hitTestCropHandles,
  resizeCropRectFromDrag,
  type CropRectDoc,
} from "../cropGeometry";

describe("clampCropRectToCanvas", () => {
  const cw = 100;
  const ch = 100;

  it("leaves a rect that fits inside the canvas unchanged", () => {
    expect(clampCropRectToCanvas(10, 10, 50, 50, cw, ch)).toEqual({
      x: 10,
      y: 10,
      width: 50,
      height: 50,
    });
  });

  it("clamps negative x/y to 0", () => {
    const r = clampCropRectToCanvas(-10, -5, 30, 20, cw, ch);
    expect(r.x).toBe(0);
    expect(r.y).toBe(0);
  });

  it("clamps width/height to canvas bounds", () => {
    const r = clampCropRectToCanvas(80, 90, 50, 50, cw, ch);
    expect(r.x + r.width).toBeLessThanOrEqual(cw);
    expect(r.y + r.height).toBeLessThanOrEqual(ch);
  });

  it("enforces minimum crop size of 2", () => {
    const r = clampCropRectToCanvas(50, 50, 0, 0, cw, ch);
    expect(r.width).toBeGreaterThanOrEqual(2);
    expect(r.height).toBeGreaterThanOrEqual(2);
  });

  it("rounds fractional values", () => {
    const r = clampCropRectToCanvas(10.7, 20.3, 30.5, 40.9, cw, ch);
    expect(Number.isInteger(r.x)).toBe(true);
    expect(Number.isInteger(r.y)).toBe(true);
    expect(Number.isInteger(r.width)).toBe(true);
    expect(Number.isInteger(r.height)).toBe(true);
  });

  it("clamps x so it does not exceed cw - 2", () => {
    const r = clampCropRectToCanvas(200, 0, 10, 10, cw, ch);
    expect(r.x).toBeLessThanOrEqual(cw - 2);
  });
});

describe("hitTestCropHandles", () => {
  const rect: CropRectDoc = { x: 10, y: 10, width: 80, height: 60 };
  const zoom = 1;

  it("detects corner handles", () => {
    expect(hitTestCropHandles(rect, { x: 10, y: 10 }, zoom)).toBe("top-left");
    expect(hitTestCropHandles(rect, { x: 90, y: 10 }, zoom)).toBe("top-right");
    expect(hitTestCropHandles(rect, { x: 10, y: 70 }, zoom)).toBe(
      "bottom-left"
    );
    expect(hitTestCropHandles(rect, { x: 90, y: 70 }, zoom)).toBe(
      "bottom-right"
    );
  });

  it("detects edge midpoint handles", () => {
    expect(hitTestCropHandles(rect, { x: 50, y: 10 }, zoom)).toBe("top");
    expect(hitTestCropHandles(rect, { x: 50, y: 70 }, zoom)).toBe("bottom");
    expect(hitTestCropHandles(rect, { x: 10, y: 40 }, zoom)).toBe("left");
    expect(hitTestCropHandles(rect, { x: 90, y: 40 }, zoom)).toBe("right");
  });

  it("detects interior as move", () => {
    expect(hitTestCropHandles(rect, { x: 50, y: 40 }, zoom)).toBe("move");
  });

  it("returns null outside the rect and handles", () => {
    expect(hitTestCropHandles(rect, { x: 200, y: 200 }, zoom)).toBeNull();
    expect(hitTestCropHandles(rect, { x: 0, y: 0 }, zoom)).toBeNull();
  });

  it("accounts for zoom when hit-testing", () => {
    const highZoom = 4;
    // threshold = 8 / 4 = 2; dist((11,11),(10,10)) = sqrt(2) ≈ 1.41 ≤ 2
    expect(hitTestCropHandles(rect, { x: 11, y: 11 }, highZoom)).toBe(
      "top-left"
    );
    // dist((13,13),(10,10)) = sqrt(18) ≈ 4.24 > 2; but inside rect → "move"
    expect(hitTestCropHandles(rect, { x: 13, y: 13 }, highZoom)).toBe("move");
  });
});

describe("resizeCropRectFromDrag", () => {
  const start: CropRectDoc = { x: 20, y: 20, width: 60, height: 40 };
  const cw = 100;
  const ch = 100;

  it("moves the rect with handle 'move'", () => {
    const r = resizeCropRectFromDrag(start, "move", 10, 5, cw, ch);
    expect(r.x).toBe(30);
    expect(r.y).toBe(25);
    expect(r.width).toBe(60);
    expect(r.height).toBe(40);
  });

  it("resizes right edge", () => {
    const r = resizeCropRectFromDrag(start, "right", 10, 0, cw, ch);
    expect(r.width).toBe(70);
    expect(r.x).toBe(20);
  });

  it("resizes bottom edge", () => {
    const r = resizeCropRectFromDrag(start, "bottom", 0, 10, cw, ch);
    expect(r.height).toBe(50);
    expect(r.y).toBe(20);
  });

  it("resizes left edge (moves x, shrinks width)", () => {
    const r = resizeCropRectFromDrag(start, "left", 10, 0, cw, ch);
    expect(r.x).toBe(30);
    expect(r.width).toBe(50);
  });

  it("resizes top edge (moves y, shrinks height)", () => {
    const r = resizeCropRectFromDrag(start, "top", 0, 10, cw, ch);
    expect(r.y).toBe(30);
    expect(r.height).toBe(30);
  });

  it("resizes bottom-right corner", () => {
    const r = resizeCropRectFromDrag(start, "bottom-right", 5, 5, cw, ch);
    expect(r.width).toBe(65);
    expect(r.height).toBe(45);
    expect(r.x).toBe(20);
    expect(r.y).toBe(20);
  });

  it("resizes top-left corner", () => {
    const r = resizeCropRectFromDrag(start, "top-left", 5, 5, cw, ch);
    expect(r.x).toBe(25);
    expect(r.y).toBe(25);
    expect(r.width).toBe(55);
    expect(r.height).toBe(35);
  });

  it("resizes top-right corner", () => {
    const r = resizeCropRectFromDrag(start, "top-right", 5, 5, cw, ch);
    expect(r.y).toBe(25);
    expect(r.width).toBe(65);
    expect(r.height).toBe(35);
  });

  it("resizes bottom-left corner", () => {
    const r = resizeCropRectFromDrag(start, "bottom-left", 5, 5, cw, ch);
    expect(r.x).toBe(25);
    expect(r.width).toBe(55);
    expect(r.height).toBe(45);
  });

  it("clamps result to canvas bounds", () => {
    const r = resizeCropRectFromDrag(start, "move", 200, 200, cw, ch);
    expect(r.x + r.width).toBeLessThanOrEqual(cw);
    expect(r.y + r.height).toBeLessThanOrEqual(ch);
  });

  it("handles rotate handle as identity (default case)", () => {
    const r = resizeCropRectFromDrag(start, "rotate", 10, 10, cw, ch);
    expect(r.x).toBe(start.x);
    expect(r.y).toBe(start.y);
    expect(r.width).toBe(start.width);
    expect(r.height).toBe(start.height);
  });
});
