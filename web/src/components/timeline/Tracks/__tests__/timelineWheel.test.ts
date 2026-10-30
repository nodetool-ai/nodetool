/**
 * Timeline wheel-gesture routing.
 *
 * Pins how a wheel event splits into a zoom step vs a horizontal-scroll delta:
 *   - Ctrl/Cmd+wheel (and the macOS pinch, reported as a synthetic ctrlKey
 *     wheel) → zoom.
 *   - Shift+wheel → horizontal scroll (mice with a vertical-only wheel).
 *   - Trackpad horizontal swipe (deltaX dominant) → horizontal scroll.
 *   - Plain vertical wheel → left alone for native vertical track scrolling.
 */

import {
  partitionTimelineWheel,
  normalizeWheelDeltaPx,
  wheelZoomFactor,
  type TimelineWheelSrc
} from "../timelineWheel";

function fakeWheel(init: Partial<TimelineWheelSrc>): TimelineWheelSrc {
  return {
    deltaX: 0,
    deltaY: 0,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    ...init
  };
}

describe("partitionTimelineWheel", () => {
  it("zooms on Ctrl+wheel (vertical delta drives the zoom)", () => {
    const out = partitionTimelineWheel(
      fakeWheel({ deltaY: 120, ctrlKey: true })
    );
    expect(out.zoomDelta).toBe(120);
    expect(out.scrollDelta).toBe(0);
  });

  it("zooms on Cmd+wheel / macOS pinch (reported as ctrlKey)", () => {
    expect(
      partitionTimelineWheel(fakeWheel({ deltaY: 8, metaKey: true })).zoomDelta
    ).toBe(8);
    expect(
      partitionTimelineWheel(fakeWheel({ deltaY: -14, ctrlKey: true })).zoomDelta
    ).toBe(-14);
  });

  it("scrolls horizontally on a trackpad horizontal swipe (deltaX dominant)", () => {
    const out = partitionTimelineWheel(fakeWheel({ deltaX: 40, deltaY: 6 }));
    expect(out.zoomDelta).toBe(0);
    expect(out.scrollDelta).toBe(40);
  });

  it("leaves a vertical-dominant plain wheel alone (native track scroll)", () => {
    const out = partitionTimelineWheel(fakeWheel({ deltaX: 3, deltaY: 90 }));
    expect(out.zoomDelta).toBe(0);
    expect(out.scrollDelta).toBe(0);
  });

  it("routes Shift+wheel to horizontal scroll using deltaY", () => {
    const out = partitionTimelineWheel(fakeWheel({ deltaY: 30, shiftKey: true }));
    expect(out.zoomDelta).toBe(0);
    expect(out.scrollDelta).toBe(30);
  });

  it("prefers deltaX for Shift+wheel when the browser folds it in", () => {
    const out = partitionTimelineWheel(
      fakeWheel({ deltaX: 18, deltaY: 30, shiftKey: true })
    );
    expect(out.scrollDelta).toBe(18);
  });

  it("zoom wins over scroll when Ctrl and a horizontal swipe coincide", () => {
    const out = partitionTimelineWheel(
      fakeWheel({ deltaX: 50, deltaY: 10, ctrlKey: true })
    );
    expect(out.zoomDelta).toBe(10);
    expect(out.scrollDelta).toBe(0);
  });
});

describe("normalizeWheelDeltaPx", () => {
  it("passes pixel-mode deltas through unchanged", () => {
    expect(normalizeWheelDeltaPx(120, 0 /* DOM_DELTA_PIXEL */, 800)).toBe(120);
  });

  it("scales line-mode deltas by a per-line pixel height", () => {
    expect(normalizeWheelDeltaPx(3, 1 /* DOM_DELTA_LINE */, 800)).toBe(48);
  });

  it("scales page-mode deltas by the page (viewport) size", () => {
    expect(normalizeWheelDeltaPx(2, 2 /* DOM_DELTA_PAGE */, 800)).toBe(1600);
  });
});

describe("wheelZoomFactor", () => {
  it("zooms a Chromium trackpad pinch at twice the finger scale", () => {
    // Chromium sends deltaY = -100 * ln(scale); split a 2x pinch-out into
    // the many small events a trackpad delivers.
    const steps = 10;
    const perEvent = (-100 * Math.log(2)) / steps;
    let factor = 1;
    for (let i = 0; i < steps; i++) {
      factor *= wheelZoomFactor(perEvent, 0, 1000);
    }
    expect(factor).toBeCloseTo(0.25, 6);
  });

  it("caps a mouse wheel notch to one bounded step", () => {
    const notch = wheelZoomFactor(100, 0, 1000);
    expect(notch).toBeGreaterThan(1.2);
    expect(notch).toBeLessThan(1.4);
    expect(wheelZoomFactor(-100, 0, 1000) * notch).toBeCloseTo(1, 10);
  });

  it("normalizes line-mode deltas before the cap", () => {
    expect(wheelZoomFactor(1, 1 /* DOM_DELTA_LINE */, 1000)).toBeCloseTo(
      Math.exp(0.3),
      10
    );
  });
});
