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

export function useWheelZoom({
  zoom,
  pan,
  containerRef,
  onZoomChange,
  onPanChange,
}: UseWheelZoomParams): UseWheelZoomResult {
  // Accumulate wheel deltas and apply them once per animation frame.
  // This prevents multiple wheel events per frame from each causing
  // separate state updates and React re-renders.
  const zoomRafRef = useRef<number | null>(null);
  const pendingZoomRef = useRef<{
    deltaY: number;
    clientX: number;
    clientY: number;
  } | null>(null);

  const handleZoomWheel = useCallback(
    (
      event: Pick<WheelEvent, "deltaY" | "clientX" | "clientY" | "preventDefault">
    ) => {
      event.preventDefault();
      // Accumulate delta; keep the latest pointer position for centering.
      const pending = pendingZoomRef.current;
      if (pending) {
        pending.deltaY += event.deltaY;
        pending.clientX = event.clientX;
        pending.clientY = event.clientY;
      } else {
        pendingZoomRef.current = {
          deltaY: event.deltaY,
          clientX: event.clientX,
          clientY: event.clientY,
        };
      }
      if (zoomRafRef.current === null) {
        zoomRafRef.current = requestAnimationFrame(() => {
          zoomRafRef.current = null;
          const p = pendingZoomRef.current;
          if (!p) {
            return;
          }
          pendingZoomRef.current = null;

          const factor = 1.3;
          const wheelDelta = p.deltaY > 0 ? 1 / factor : factor;
          const newZoom = Math.max(
            SKETCH_ZOOM_MIN,
            Math.min(SKETCH_ZOOM_MAX, zoom * wheelDelta)
          );
          const container = containerRef.current;
          if (container) {
            const rect = container.getBoundingClientRect();
            const mouseX = p.clientX - rect.left;
            const mouseY = p.clientY - rect.top;
            const centerX = rect.width / 2;
            const centerY = rect.height / 2;
            const offsetX = mouseX - centerX - pan.x;
            const offsetY = mouseY - centerY - pan.y;
            const zoomRatio = newZoom / zoom;
            onPanChange({
              x: pan.x + offsetX * (1 - zoomRatio),
              y: pan.y + offsetY * (1 - zoomRatio),
            });
          }
          onZoomChange(newZoom);
        });
      }
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
