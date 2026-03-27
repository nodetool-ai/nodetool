import {
  fillRectMask,
  createEmptyMask,
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
