/**
 * Sketch viewport wheel → zoom vs pan routing.
 */

import {
  partitionWheelViewportMotion,
  type WheelSrc
} from "../sketchCanvasHooks/useWheelZoom";

function fakeWheel(init: Partial<WheelSrc>): WheelSrc {
  return {
    deltaX: 0,
    deltaY: 0,
    deltaMode: WheelEvent.DOM_DELTA_PIXEL,
    clientX: 0,
    clientY: 0,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    preventDefault: () => {},
    ...init,
  };
}

describe("partitionWheelViewportMotion", () => {
  it("routes shift+wheel to vertical pan", () => {
    const out = partitionWheelViewportMotion(
      fakeWheel({ deltaY: 30, deltaX: 0, shiftKey: true }),
    );
    expect(out.zoomDelta).toBe(0);
    expect(out.panX).toBe(0);
    expect(out.panY).toBe(30);
  });

  it("routes ctrl+wheel on a mouse wheel to horizontal pan", () => {
    const out = partitionWheelViewportMotion(
      fakeWheel({
        deltaY: -120,
        deltaX: 0,
        ctrlKey: true,
        wheelDeltaY: 120,
      }),
    );
    expect(out.zoomDelta).toBe(0);
    expect(out.panX).toBe(-120);
    expect(out.panY).toBe(0);
  });

  it("routes ctrl+wheel to zoom (pinch pattern)", () => {
    expect(
      partitionWheelViewportMotion(
        fakeWheel({ deltaY: 8, deltaX: 0, ctrlKey: true }),
      ).zoomDelta,
    ).toBe(8);
  });

  it("routes LINE-mode vertical scroll as zoom (+ horizontal pans)", () => {
    const out = partitionWheelViewportMotion(
      fakeWheel({
        deltaMode: WheelEvent.DOM_DELTA_LINE,
        deltaY: -1,
        deltaX: 4,
      }),
    );
    expect(out.zoomDelta).toBe(-1);
    expect(out.panX).toBe(4);
    expect(out.panY).toBe(0);
  });

  it("routes small PIXEL deltas as pan (trackpad two-finger scroll)", () => {
    const out = partitionWheelViewportMotion(fakeWheel({ deltaY: -15, deltaX: -3 }));
    expect(out.zoomDelta).toBe(0);
    expect(out.panY).toBe(-15);
    expect(out.panX).toBe(-3);
  });

  it("routes legacy ±120-detent PIXEL deltas as zoom", () => {
    const out = partitionWheelViewportMotion(
      fakeWheel({
        deltaY: -100,
        deltaX: 0,
        wheelDeltaY: -120,
      }),
    );
    expect(out.zoomDelta).toBe(-100);
    expect(out.panY).toBe(0);
    expect(out.panX).toBe(0);
  });

  it("routes coarse single-step PIXEL vertical deltas as zoom (mouse fallback)", () => {
    expect(
      partitionWheelViewportMotion(
        fakeWheel({ deltaY: -150, deltaX: 0 }),
      ).zoomDelta,
    ).toBe(-150);
  });
});
