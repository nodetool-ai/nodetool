/**
 * useCanvasTouchGestures
 *
 * Two-finger pan + pinch-zoom for touchscreens. The canvas is Pointer
 * Events–based, so a single finger already draws; this layer adds the
 * multi-touch navigation that mouse/trackpad users get from wheel + Space/Alt
 * drag (see useWheelZoom / usePointerHandlers), which touch has no equivalent
 * for.
 *
 * The wrapper calls these handlers before delegating to the drawing pointer
 * handlers. When a second finger lands the in-progress stroke is aborted
 * (`cancelDrawing`) and every subsequent touch event is consumed until all
 * fingers lift, so a pinch never paints and the leftover finger never resumes
 * a stroke. Each handler returns `true` when it consumed the event.
 */

import { useCallback, useEffect, useRef } from "react";
import type { Point } from "../types";
import { SKETCH_ZOOM_MAX, SKETCH_ZOOM_MIN } from "../state/useSketchStore";

interface PinchSample {
  mid: Point;
  dist: number;
}

interface DomRectLike {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * One incremental pinch step. Pans by the midpoint delta, then applies the
 * distance-ratio zoom anchored at the current midpoint so the pixels under the
 * fingers stay put — mirroring the cursor-anchored zoom in useWheelZoom. Pure
 * for testability.
 */
export function computePinchStep(
  prev: PinchSample,
  cur: PinchSample,
  curZoom: number,
  curPan: Point,
  rect: DomRectLike,
  zoomMin: number = SKETCH_ZOOM_MIN,
  zoomMax: number = SKETCH_ZOOM_MAX
): { zoom: number; pan: Point } {
  let newPanX = curPan.x + (cur.mid.x - prev.mid.x);
  let newPanY = curPan.y + (cur.mid.y - prev.mid.y);
  let newZoom = curZoom;

  if (prev.dist > 0 && cur.dist > 0) {
    const factor = cur.dist / prev.dist;
    newZoom = Math.max(zoomMin, Math.min(zoomMax, curZoom * factor));
    if (newZoom !== curZoom) {
      const offsetX = cur.mid.x - rect.left - rect.width / 2 - newPanX;
      const offsetY = cur.mid.y - rect.top - rect.height / 2 - newPanY;
      const zoomRatio = newZoom / curZoom;
      newPanX += offsetX * (1 - zoomRatio);
      newPanY += offsetY * (1 - zoomRatio);
    }
  }

  return { zoom: newZoom, pan: { x: newPanX, y: newPanY } };
}

function pinchSample(a: Point, b: Point): PinchSample {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return {
    mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
    dist: Math.hypot(dx, dy)
  };
}

export interface UseCanvasTouchGesturesParams {
  containerRef: React.RefObject<HTMLDivElement | null>;
  zoom: number;
  pan: Point;
  onZoomChange: (zoom: number) => void;
  onPanChange: (pan: Point) => void;
  /** Abort a one-finger stroke when the pinch supersedes it. */
  cancelDrawing: () => void;
}

export interface UseCanvasTouchGesturesResult {
  /** @returns true when the event was consumed as a gesture (skip drawing). */
  onPointerDown: (e: React.PointerEvent) => boolean;
  onPointerMove: (e: React.PointerEvent) => boolean;
  onPointerUp: (e: React.PointerEvent) => boolean;
}

export function useCanvasTouchGestures({
  containerRef,
  zoom,
  pan,
  onZoomChange,
  onPanChange,
  cancelDrawing
}: UseCanvasTouchGesturesParams): UseCanvasTouchGesturesResult {
  const pointersRef = useRef<Map<number, Point>>(new Map());
  const lastSampleRef = useRef<PinchSample | null>(null);
  // Running viewport values driven by the gesture itself. Multiple pointermove
  // events fire before React re-renders with the new zoom/pan props, so the
  // gesture must accumulate against its own copy rather than the stale props.
  const runningZoomRef = useRef(zoom);
  const runningPanRef = useRef(pan);

  // Keep the running values in sync with committed props while no gesture is
  // active, so the next pinch starts from the true viewport state.
  useEffect(() => {
    if (!lastSampleRef.current) {
      runningZoomRef.current = zoom;
      runningPanRef.current = pan;
    }
  }, [zoom, pan]);

  const firstTwoPoints = (): [Point, Point] => {
    const it = pointersRef.current.values();
    return [it.next().value as Point, it.next().value as Point];
  };

  const onPointerDown = useCallback(
    (e: React.PointerEvent): boolean => {
      if (e.pointerType !== "touch") {
        return false;
      }
      pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointersRef.current.size >= 2) {
        // Second finger — supersede the single-finger stroke that already
        // started and begin the pinch/pan gesture.
        cancelDrawing();
        runningZoomRef.current = zoom;
        runningPanRef.current = pan;
        const [a, b] = firstTwoPoints();
        lastSampleRef.current = pinchSample(a, b);
        return true;
      }
      return false;
    },
    [zoom, pan, cancelDrawing]
  );

  const onPointerMove = useCallback((e: React.PointerEvent): boolean => {
    if (e.pointerType !== "touch" || !pointersRef.current.has(e.pointerId)) {
      return false;
    }
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointersRef.current.size < 2 || !lastSampleRef.current) {
      return false;
    }
    const [a, b] = firstTwoPoints();
    const cur = pinchSample(a, b);
    const rect = containerRef.current?.getBoundingClientRect();
    if (rect) {
      const next = computePinchStep(
        lastSampleRef.current,
        cur,
        runningZoomRef.current,
        runningPanRef.current,
        rect
      );
      runningZoomRef.current = next.zoom;
      runningPanRef.current = next.pan;
      onPanChange(next.pan);
      onZoomChange(next.zoom);
    }
    lastSampleRef.current = cur;
    return true;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- containerRef is stable
  }, [onPanChange, onZoomChange]);

  const onPointerUp = useCallback((e: React.PointerEvent): boolean => {
    if (e.pointerType !== "touch") {
      return false;
    }
    const wasGesture = lastSampleRef.current !== null;
    pointersRef.current.delete(e.pointerId);
    if (pointersRef.current.size < 2) {
      lastSampleRef.current = null;
    }
    // Consume the lift while a gesture was live so the remaining finger can't
    // resume drawing from the same touch sequence.
    return wasGesture;
  }, []);

  return { onPointerDown, onPointerMove, onPointerUp };
}
