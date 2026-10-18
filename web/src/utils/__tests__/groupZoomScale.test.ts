import { groupZoomScale } from "../groupZoomScale";

describe("groupZoomScale", () => {
  // Screen size = world size × zoom. A group must stay identifiable in an
  // overview, so its headline and outline may not shrink on screen when
  // zoomed out (issue #6758).
  it.each([0.9, 0.5, 0.38, 0.13, 0.1])(
    "keeps the headline and outline at full screen size at zoom %p",
    (zoom) => {
      const scale = groupZoomScale(zoom);
      expect(scale.label * zoom).toBeCloseTo(1);
      expect(scale.outlineWidthPx * zoom).toBeCloseTo(1);
      expect(scale.headerGapPx * zoom).toBeCloseTo(5);
    }
  );

  it("grows the headline gently when zoomed in", () => {
    const { label } = groupZoomScale(4);
    expect(label * 4).toBeGreaterThan(1);
    expect(label).toBeLessThan(1);
  });

  it("is continuous at 100% zoom", () => {
    expect(groupZoomScale(0.999).label).toBeCloseTo(groupZoomScale(1).label, 2);
  });

  it("clamps extreme zoom values", () => {
    expect(groupZoomScale(0).outlineWidthPx).toBeCloseTo(1 / 0.08);
    expect(groupZoomScale(100).outlineWidthPx).toBeCloseTo(1 / 8);
  });
});
