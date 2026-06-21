import { describe, it, expect } from "@jest/globals";
import { computeScrollThumb } from "../TimelineScrollbar";

describe("computeScrollThumb", () => {
  it("is not scrollable when content fits the viewport", () => {
    const t = computeScrollThumb(800, 1000, 0, 1000);
    expect(t.scrollable).toBe(false);
    expect(t.maxScroll).toBe(0);
    expect(t.thumbWidth).toBe(1000); // full-width thumb
    expect(t.thumbLeft).toBe(0);
  });

  it("sizes the thumb to the visible fraction", () => {
    // viewport is half the content → thumb is half the track.
    const t = computeScrollThumb(2000, 1000, 0, 1000);
    expect(t.scrollable).toBe(true);
    expect(t.maxScroll).toBe(1000);
    expect(t.thumbWidth).toBe(500);
    expect(t.thumbTravel).toBe(500);
    expect(t.thumbLeft).toBe(0);
  });

  it("positions the thumb proportionally to scrollLeft", () => {
    const t = computeScrollThumb(2000, 1000, 500, 1000); // halfway scrolled
    expect(t.thumbLeft).toBe(250); // half of thumbTravel (500)
  });

  it("clamps the thumb to the end when scrolled to max", () => {
    const t = computeScrollThumb(2000, 1000, 999999, 1000);
    expect(t.thumbLeft).toBe(t.thumbTravel);
  });

  it("enforces a minimum thumb width for tiny visible fractions", () => {
    const t = computeScrollThumb(100000, 1000, 0, 1000);
    expect(t.thumbWidth).toBeGreaterThanOrEqual(28);
  });

  it("is not scrollable with a zero-width viewport (pre-measure)", () => {
    const t = computeScrollThumb(2000, 0, 0, 0);
    expect(t.scrollable).toBe(false);
  });
});
