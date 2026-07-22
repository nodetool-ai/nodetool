/**
 * Tests for useCanvasTouchGestures — the two-finger pan/pinch-zoom layer.
 *
 * Covers the pure pinch math (computePinchStep) and the consume/abort behavior
 * of the hook (second finger aborts a stroke, gesture events are consumed,
 * one finger draws normally).
 */

import React from "react";
import { renderHook, act } from "@testing-library/react";
import {
  computePinchStep,
  useCanvasTouchGestures
} from "../useCanvasTouchGestures";
import { SKETCH_ZOOM_MAX, SKETCH_ZOOM_MIN } from "../../state/useSketchStore";

const RECT = { left: 0, top: 0, width: 400, height: 300 };

describe("computePinchStep", () => {
  it("pans by the midpoint delta when the distance is unchanged", () => {
    const prev = { mid: { x: 200, y: 150 }, dist: 100 };
    const cur = { mid: { x: 220, y: 160 }, dist: 100 };
    const res = computePinchStep(prev, cur, 1, { x: 0, y: 0 }, RECT);
    expect(res.zoom).toBe(1);
    expect(res.pan).toEqual({ x: 20, y: 10 });
  });

  it("zooms in by the distance ratio", () => {
    const prev = { mid: { x: 200, y: 150 }, dist: 100 };
    const cur = { mid: { x: 200, y: 150 }, dist: 200 };
    const res = computePinchStep(prev, cur, 1, { x: 0, y: 0 }, RECT);
    expect(res.zoom).toBe(2);
  });

  it("keeps the pixel under the pinch midpoint anchored while zooming", () => {
    // Midpoint at the rect center → offset is zero → pan stays put on zoom.
    const prev = { mid: { x: 200, y: 150 }, dist: 100 };
    const cur = { mid: { x: 200, y: 150 }, dist: 150 };
    const res = computePinchStep(prev, cur, 1, { x: 0, y: 0 }, RECT);
    expect(res.zoom).toBeCloseTo(1.5);
    expect(res.pan.x).toBeCloseTo(0);
    expect(res.pan.y).toBeCloseTo(0);
  });

  it("clamps zoom to the editor min/max", () => {
    const prev = { mid: { x: 0, y: 0 }, dist: 1 };
    const zoomedOut = computePinchStep(
      prev,
      { mid: { x: 0, y: 0 }, dist: 0.0001 },
      SKETCH_ZOOM_MIN,
      { x: 0, y: 0 },
      RECT
    );
    expect(zoomedOut.zoom).toBe(SKETCH_ZOOM_MIN);

    const zoomedIn = computePinchStep(
      prev,
      { mid: { x: 0, y: 0 }, dist: 1_000_000 },
      SKETCH_ZOOM_MAX,
      { x: 0, y: 0 },
      RECT
    );
    expect(zoomedIn.zoom).toBe(SKETCH_ZOOM_MAX);
  });
});

function touchEvent(pointerId: number, clientX: number, clientY: number) {
  return {
    pointerType: "touch",
    pointerId,
    clientX,
    clientY
  } as unknown as React.PointerEvent;
}

function mouseEvent() {
  return { pointerType: "mouse", pointerId: 1 } as unknown as React.PointerEvent;
}

function setup() {
  const cancelDrawing = jest.fn();
  const onZoomChange = jest.fn();
  const onPanChange = jest.fn();
  const container = {
    current: {
      getBoundingClientRect: () => RECT
    }
  } as unknown as React.RefObject<HTMLDivElement | null>;

  const { result } = renderHook(() =>
    useCanvasTouchGestures({
      containerRef: container,
      zoom: 1,
      pan: { x: 0, y: 0 },
      onZoomChange,
      onPanChange,
      cancelDrawing
    })
  );
  return { result, cancelDrawing, onZoomChange, onPanChange };
}

describe("useCanvasTouchGestures", () => {
  it("does not consume a single touch (one finger still draws)", () => {
    const { result } = setup();
    let consumed = true;
    act(() => {
      consumed = result.current.onPointerDown(touchEvent(1, 100, 100));
    });
    expect(consumed).toBe(false);
  });

  it("ignores mouse pointers entirely", () => {
    const { result } = setup();
    expect(result.current.onPointerDown(mouseEvent())).toBe(false);
    expect(result.current.onPointerMove(mouseEvent())).toBe(false);
    expect(result.current.onPointerUp(mouseEvent())).toBe(false);
  });

  it("aborts the in-progress stroke and consumes when a second finger lands", () => {
    const { result, cancelDrawing } = setup();
    act(() => {
      result.current.onPointerDown(touchEvent(1, 100, 100));
    });
    let consumed = false;
    act(() => {
      consumed = result.current.onPointerDown(touchEvent(2, 200, 100));
    });
    expect(consumed).toBe(true);
    expect(cancelDrawing).toHaveBeenCalledTimes(1);
  });

  it("emits zoom/pan updates on a two-finger move", () => {
    const { result, onZoomChange, onPanChange } = setup();
    act(() => {
      result.current.onPointerDown(touchEvent(1, 150, 150));
      result.current.onPointerDown(touchEvent(2, 250, 150));
    });
    act(() => {
      // Spread the fingers apart → zoom in.
      result.current.onPointerMove(touchEvent(1, 100, 150));
      result.current.onPointerMove(touchEvent(2, 300, 150));
    });
    expect(onZoomChange).toHaveBeenCalled();
    expect(onPanChange).toHaveBeenCalled();
    const lastZoom = onZoomChange.mock.calls.at(-1)?.[0] as number;
    expect(lastZoom).toBeGreaterThan(1);
  });

  it("consumes the finger lift while a gesture is active", () => {
    const { result } = setup();
    act(() => {
      result.current.onPointerDown(touchEvent(1, 150, 150));
      result.current.onPointerDown(touchEvent(2, 250, 150));
    });
    let consumed = false;
    act(() => {
      consumed = result.current.onPointerUp(touchEvent(2, 250, 150));
    });
    expect(consumed).toBe(true);
  });

  it("keeps consuming the leftover finger until the last lifts", () => {
    const { result } = setup();
    act(() => {
      result.current.onPointerDown(touchEvent(1, 150, 150));
      result.current.onPointerDown(touchEvent(2, 250, 150));
      result.current.onPointerUp(touchEvent(2, 250, 150));
    });
    // One finger remains after the pinch — its moves and final lift must still
    // be consumed so it can't resume a stroke mid-sequence.
    let move = false;
    let lift = false;
    act(() => {
      move = result.current.onPointerMove(touchEvent(1, 170, 160));
      lift = result.current.onPointerUp(touchEvent(1, 170, 160));
    });
    expect(move).toBe(true);
    expect(lift).toBe(true);

    // Gesture fully ended: a fresh single touch draws again (not consumed).
    let fresh = true;
    act(() => {
      fresh = result.current.onPointerDown(touchEvent(3, 100, 100));
    });
    expect(fresh).toBe(false);
  });

  it("rebaselines geometry when a 3rd finger lifts leaving two down", () => {
    const { result, onZoomChange } = setup();
    act(() => {
      result.current.onPointerDown(touchEvent(1, 100, 150));
      result.current.onPointerDown(touchEvent(2, 200, 150));
      result.current.onPointerDown(touchEvent(3, 300, 150));
    });
    onZoomChange.mockClear();
    // Lift the middle finger; the surviving pair (1 @100, 3 @300, dist 200) must
    // become the new baseline. A move that holds that distance → no zoom jump.
    act(() => {
      result.current.onPointerUp(touchEvent(2, 200, 150));
      result.current.onPointerMove(touchEvent(1, 100, 150));
      result.current.onPointerMove(touchEvent(3, 300, 150));
    });
    // Distance unchanged from the rebaseline → zoom stays at 1 (no jump).
    for (const call of onZoomChange.mock.calls) {
      expect(call[0]).toBeCloseTo(1);
    }
  });

  it("tears down the gesture on pointercancel", () => {
    const { result } = setup();
    act(() => {
      result.current.onPointerDown(touchEvent(1, 150, 150));
      result.current.onPointerDown(touchEvent(2, 250, 150));
    });
    act(() => {
      result.current.onPointerCancel(touchEvent(1, 150, 150));
      result.current.onPointerCancel(touchEvent(2, 250, 150));
    });
    // After cancel of all fingers the gesture is gone: a fresh single touch
    // draws again instead of being consumed by a stuck gesture.
    let fresh = true;
    act(() => {
      fresh = result.current.onPointerDown(touchEvent(3, 100, 100));
    });
    expect(fresh).toBe(false);
  });
});
