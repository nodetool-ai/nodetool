import {
  HANDLE_GAP_X,
  OVERLAP_MARGIN,
  placeAtAnchor,
  resolveVerticalOverlap,
  type PlacementRect
} from "../nodePlacement";

const rect = (
  x: number,
  y: number,
  width = 200,
  height = 100
): PlacementRect => ({ x, y, width, height });

describe("placeAtAnchor", () => {
  it("puts the node's input handle a gap right of the anchor and level with it", () => {
    expect(placeAtAnchor({ x: 100, y: 500 }, 24)).toEqual({
      x: 100 + HANDLE_GAP_X,
      y: 476
    });
  });

  it("aligns each node type by its own input handle offset", () => {
    // A Reroute's handle sits 10px below its top, a Preview's 27px: both end
    // up with the handle at the anchor's y.
    expect(placeAtAnchor({ x: 0, y: 300 }, 10).y).toBe(290);
    expect(placeAtAnchor({ x: 0, y: 300 }, 27).y).toBe(273);
  });
});

describe("resolveVerticalOverlap", () => {
  it("keeps the desired position when nothing is in the way", () => {
    expect(resolveVerticalOverlap(rect(0, 100), [rect(1000, 100)])).toBe(100);
  });

  it("moves clear of a node on the same spot", () => {
    const other = rect(0, 100);
    expect(resolveVerticalOverlap(rect(0, 100), [other])).toBe(
      other.y + other.height + OVERLAP_MARGIN
    );
  });

  it("picks the nearest free slot, above when that is closer", () => {
    // Desired y 300. The blocker spans 260-560, so above (140) is nearer than
    // below (580).
    expect(resolveVerticalOverlap(rect(0, 300), [rect(0, 260, 200, 300)])).toBe(
      140
    );
  });

  it("prefers below when above and below are equally near", () => {
    const blocker = rect(0, 100);
    expect(resolveVerticalOverlap(rect(0, 100), [blocker])).toBe(220);
  });

  it("skips a candidate slot that another node already occupies", () => {
    // Below the first blocker is taken by the second, so the free slot is
    // above the first.
    const y = resolveVerticalOverlap(rect(0, 100), [
      rect(0, 100),
      rect(0, 220)
    ]);
    expect(y).toBe(-20);
  });

  it("ignores nodes that do not overlap horizontally", () => {
    expect(resolveVerticalOverlap(rect(0, 100), [rect(400, 100)])).toBe(100);
  });
});
