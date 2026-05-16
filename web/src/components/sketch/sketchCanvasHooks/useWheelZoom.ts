import { useCallback, useEffect, useRef } from "react";
import type { Point } from "../types";
import { SKETCH_ZOOM_MAX, SKETCH_ZOOM_MIN } from "../state/useSketchStore";

interface UseWheelZoomParams {
  zoom: number;
  pan: Point;
  containerRef: React.RefObject<HTMLDivElement | null>;
  onZoomChange: (zoom: number) => void;
  onPanChange: (pan: Point) => void;
}

export interface UseWheelZoomResult {
  handleWheel: (e: React.WheelEvent) => void;
}

interface PendingWheel {
  zoomDelta: number;
  panX: number;
  panY: number;
  clientX: number;
  clientY: number;
}

// macOS trackpad pinch-zoom is a ctrlKey wheel event.
// Ctrl/Meta + wheel stays zoom everywhere.
// Discrete mouse wheels → zoom vertically; fluid trackpad two-finger pans use pixel deltas.
export type WheelSrc = Pick<
  WheelEvent,
  "deltaX" | "deltaY" | "deltaMode" | "clientX" | "clientY" | "ctrlKey" | "metaKey" | "preventDefault"
> & {
  /** Legacy WebKit/Chromium ±120 multiples for physical detents (not typed on WheelEvent everywhere). */
  wheelDelta?: number;
  wheelDeltaY?: number;
};

/** Split one wheel gesture into zoom (vertical Δ) vs 2-D pan vectors. Exported for tests. */
export function partitionWheelViewportMotion(event: WheelSrc): {
  zoomDelta: number;
  panX: number;
  panY: number;
} {
  if (event.ctrlKey || event.metaKey) {
    return {
      zoomDelta: event.deltaY,
      panX: event.deltaX,
      panY: 0
    };
  }

  const lineOrPageLike =
    event.deltaMode === WheelEvent.DOM_DELTA_LINE ||
    event.deltaMode === WheelEvent.DOM_DELTA_PAGE;

  if (lineOrPageLike) {
    return {
      zoomDelta: event.deltaY,
      panX: event.deltaX,
      panY: 0
    };
  }

  // Pixel mode — keep two-finger trackpad gestures as pan ...
  let verticalActsAsZoomTick = false;
  const absY = Math.abs(event.deltaY);
  if (absY !== 0 && event.deltaX === 0) {
    const legacy =
      typeof event.wheelDelta === "number"
        ? event.wheelDelta
        : typeof event.wheelDeltaY === "number"
          ? event.wheelDeltaY
          : 0;
    verticalActsAsZoomTick =
      legacy !== 0 && Math.abs(legacy) >= 120 && Math.abs(legacy) % 120 === 0;
    if (!verticalActsAsZoomTick && absY >= 120) {
      verticalActsAsZoomTick = true;
    }
  }

  if (verticalActsAsZoomTick && event.deltaX === 0) {
    return { zoomDelta: event.deltaY, panX: 0, panY: 0 };
  }

  return { zoomDelta: 0, panX: event.deltaX, panY: event.deltaY };
}

export function useWheelZoom({
  zoom,
  pan,
  containerRef,
  onZoomChange,
  onPanChange,
}: UseWheelZoomParams): UseWheelZoomResult {
  // Coalesce wheel events into one update per animation frame.
  const rafRef = useRef<number | null>(null);
  const pendingRef = useRef<PendingWheel | null>(null);

  const handleZoomWheel = useCallback(
    (event: WheelSrc) => {
      event.preventDefault();

      const { zoomDelta: zd, panX: xd, panY: yd } = partitionWheelViewportMotion(event);

      const pending = pendingRef.current ?? {
        zoomDelta: 0,
        panX: 0,
        panY: 0,
        clientX: event.clientX,
        clientY: event.clientY,
      };
      pending.clientX = event.clientX;
      pending.clientY = event.clientY;
      pending.zoomDelta += zd;
      pending.panX += xd;
      pending.panY += yd;

      pendingRef.current = pending;

      if (rafRef.current !== null) {
        return;
      }
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        const p = pendingRef.current;
        if (!p) {
          return;
        }
        pendingRef.current = null;

        let newX = pan.x - p.panX;
        let newY = pan.y - p.panY;
        let newZoom = zoom;

        if (p.zoomDelta !== 0) {
          // Clamp so a single mouse-wheel notch (~100+) doesn't overwhelm trackpad pinches (~1-20).
          const clamped = Math.max(-50, Math.min(50, p.zoomDelta));
          const factor = Math.exp(-clamped * 0.01);
          newZoom = Math.max(
            SKETCH_ZOOM_MIN,
            Math.min(SKETCH_ZOOM_MAX, zoom * factor)
          );

          // Anchor zoom at the cursor so the point under it stays put.
          const container = containerRef.current;
          if (container && newZoom !== zoom) {
            const rect = container.getBoundingClientRect();
            const offsetX = p.clientX - rect.left - rect.width / 2 - newX;
            const offsetY = p.clientY - rect.top - rect.height / 2 - newY;
            const zoomRatio = newZoom / zoom;
            newX += offsetX * (1 - zoomRatio);
            newY += offsetY * (1 - zoomRatio);
          }
        }

        if (newX !== pan.x || newY !== pan.y) {
          onPanChange({ x: newX, y: newY });
        }
        if (newZoom !== zoom) {
          onZoomChange(newZoom);
        }
      });
    },
    [zoom, pan, onZoomChange, onPanChange, containerRef]
  );

  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      handleZoomWheel(e.nativeEvent);
    },
    [handleZoomWheel]
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }
    const onWheel = (event: WheelEvent) => {
      handleZoomWheel(event);
    };
    container.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      container.removeEventListener("wheel", onWheel);
    };
  }, [containerRef, handleZoomWheel]);

  return { handleWheel };
}
