/**
 * Sketch viewport wheel → zoom vs pan routing.
 *
 * Mirrors ReactFlow's gesture model (see web/src/components/node/
 * ReactFlowWrapper.tsx): the zoom-vs-pan discriminator is `ctrlKey` alone —
 * macOS reports a trackpad pinch as a synthetic ctrlKey wheel event, so
 * ctrlKey always means zoom. No magnitude heuristic. Platform gates match
 * ReactFlow: on Mac two-finger scroll pans (panOnScroll); elsewhere the
 * mouse wheel zooms (zoomOnScroll).
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
  it("zooms on ctrl/pinch regardless of delta magnitude (Mac)", () => {
    // The old bug: a fast pinch (large deltaY) was misclassified as a mouse
    // wheel and panned. ReactFlow routes any ctrlKey wheel to zoom.
    const out = partitionWheelViewportMotion(
      fakeWheel({ deltaY: 120, deltaX: 0, ctrlKey: true }),
      true,
    );
    expect(out.zoomDelta).toBe(120);
    expect(out.panX).toBe(0);
    expect(out.panY).toBe(0);
  });

  it("zooms on a gentle pinch (Mac)", () => {
    expect(
      partitionWheelViewportMotion(
        fakeWheel({ deltaY: 8, deltaX: 0, ctrlKey: true }),
        true,
      ).zoomDelta,
    ).toBe(8);
  });

  it("pans both axes on Mac two-finger scroll (no ctrl)", () => {
    const out = partitionWheelViewportMotion(
      fakeWheel({ deltaY: -15, deltaX: -3 }),
      true,
    );
    expect(out.zoomDelta).toBe(0);
    expect(out.panY).toBe(-15);
    expect(out.panX).toBe(-3);
  });

  it("never zooms a plain wheel on Mac (panOnScroll), even when coarse", () => {
    const out = partitionWheelViewportMotion(
      fakeWheel({ deltaY: -150, deltaX: 0 }),
      true,
    );
    expect(out.zoomDelta).toBe(0);
    expect(out.panY).toBe(-150);
  });

  it("zooms a mouse wheel off Mac (zoomOnScroll)", () => {
    const out = partitionWheelViewportMotion(
      fakeWheel({ deltaY: -150, deltaX: 0 }),
      false,
    );
    expect(out.zoomDelta).toBe(-150);
    expect(out.panX).toBe(0);
    expect(out.panY).toBe(0);
  });

  it("ignores horizontal wheel delta while zooming off Mac", () => {
    const out = partitionWheelViewportMotion(
      fakeWheel({ deltaY: -100, deltaX: 42 }),
      false,
    );
    expect(out.zoomDelta).toBe(-100);
    expect(out.panX).toBe(0);
    expect(out.panY).toBe(0);
  });

  it("zooms on ctrl+wheel off Mac (no Photoshop-style horizontal pan)", () => {
    const out = partitionWheelViewportMotion(
      fakeWheel({ deltaY: -120, deltaX: 0, ctrlKey: true }),
      false,
    );
    expect(out.zoomDelta).toBe(-120);
    expect(out.panX).toBe(0);
  });

  it("routes shift+wheel to horizontal pan off Mac", () => {
    const out = partitionWheelViewportMotion(
      fakeWheel({ deltaY: 30, deltaX: 0, shiftKey: true }),
      false,
    );
    expect(out.zoomDelta).toBe(0);
    expect(out.panX).toBe(30);
    expect(out.panY).toBe(0);
  });
});
