import { useCallback, useEffect, useMemo, useRef } from "react";
import useCanvasChatDockStore, {
  MAX_DOCK_WIDTH,
  MAX_OVERLAY_HEIGHT,
  MIN_DOCK_WIDTH,
  MIN_OVERLAY_HEIGHT,
  clampDockWidth,
  clampOverlayHeight
} from "../../stores/CanvasChatDockStore";

/**
 * Which edge/corner of the conversation overlay a resize gesture grabs.
 *  - `top` adjusts the overlay height (it grows upward from the composer).
 *  - `left`/`right` adjust the whole dock width. The dock is centre-anchored,
 *    so a side handle has to move the width by twice the pointer delta to keep
 *    that edge under the cursor.
 *  - corners adjust both at once.
 */
export type DockResizeEdge =
  | "top"
  | "left"
  | "right"
  | "top-left"
  | "top-right";

/**
 * Mouse-driven resize for the canvas chat dock. Measures the live size from
 * `overlayRef` on grab so it works whether the stored width is an explicit px
 * value or the responsive default, then writes clamped values to the dock
 * store as the pointer moves.
 */
export const useCanvasDockResize = (
  overlayRef: React.RefObject<HTMLElement | null>
) => {
  const setOverlayHeight = useCanvasChatDockStore((s) => s.setOverlayHeight);
  const setDockWidth = useCanvasChatDockStore((s) => s.setDockWidth);

  const cleanupRef = useRef<(() => void) | null>(null);

  const startResize = useCallback(
    (edge: DockResizeEdge) => (event: React.MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      const el = overlayRef.current;
      if (!el) {
        return;
      }
      const startX = event.clientX;
      const startY = event.clientY;
      const startWidth = el.offsetWidth;
      const startHeight = el.offsetHeight;

      const affectsHeight =
        edge === "top" || edge === "top-left" || edge === "top-right";
      const widthSign =
        edge === "right" || edge === "top-right"
          ? 1
          : edge === "left" || edge === "top-left"
            ? -1
            : 0;

      const prevCursor = document.body.style.cursor;
      const prevUserSelect = document.body.style.userSelect;
      const cursor =
        widthSign !== 0 && affectsHeight
          ? widthSign > 0
            ? "nesw-resize"
            : "nwse-resize"
          : widthSign !== 0
            ? "ew-resize"
            : "ns-resize";
      document.body.style.cursor = cursor;
      document.body.style.userSelect = "none";

      const handleMove = (e: MouseEvent) => {
        if (affectsHeight) {
          // Dragging up (clientY decreases) makes the overlay taller.
          setOverlayHeight(clampOverlayHeight(startHeight - (e.clientY - startY)));
        }
        if (widthSign !== 0) {
          setDockWidth(
            clampDockWidth(startWidth + widthSign * 2 * (e.clientX - startX))
          );
        }
      };

      const handleUp = () => {
        document.body.style.cursor = prevCursor;
        document.body.style.userSelect = prevUserSelect;
        document.removeEventListener("mousemove", handleMove);
        document.removeEventListener("mouseup", handleUp);
        cleanupRef.current = null;
      };

      cleanupRef.current = handleUp;
      document.addEventListener("mousemove", handleMove);
      document.addEventListener("mouseup", handleUp);
    },
    [overlayRef, setOverlayHeight, setDockWidth]
  );

  useEffect(() => () => cleanupRef.current?.(), []);

  return startResize;
};

/** Props one edge `ResizeHandle` of the conversation overlay takes. */
interface DockEdgeHandleProps {
  getValue: () => number;
  min: number;
  max: number;
  onResize: (delta: number) => void;
  onResizeStart: () => void;
  onResizeEnd: () => void;
}

/**
 * `ResizeHandle` props for the overlay's top and side edges. Sizes are
 * measured from `overlayRef` on grab, like {@link useCanvasDockResize}, and
 * summed from the start so a drag past a clamp has no slack to undo.
 *
 * The dock is centre-anchored, so a side edge changes the width by twice the
 * pointer delta. Its handle therefore works in half-widths: the bounds it
 * clamps to are half the dock bounds.
 */
export const useCanvasDockEdgeResize = (
  overlayRef: React.RefObject<HTMLElement | null>
): { top: DockEdgeHandleProps; side: DockEdgeHandleProps } => {
  const setOverlayHeight = useCanvasChatDockStore((s) => s.setOverlayHeight);
  const setDockWidth = useCanvasChatDockStore((s) => s.setDockWidth);
  // Size at grab plus the deltas since. Null outside a drag (keyboard steps).
  const heightRef = useRef<number | null>(null);
  const widthRef = useRef<number | null>(null);

  return useMemo(() => {
    const measureHeight = () => overlayRef.current?.offsetHeight ?? 0;
    const measureWidth = () => overlayRef.current?.offsetWidth ?? 0;
    return {
      top: {
        getValue: measureHeight,
        min: MIN_OVERLAY_HEIGHT,
        max: MAX_OVERLAY_HEIGHT,
        onResizeStart: () => {
          heightRef.current = measureHeight();
        },
        onResize: (delta: number) => {
          const next = (heightRef.current ?? measureHeight()) + delta;
          if (heightRef.current !== null) {
            heightRef.current = next;
          }
          setOverlayHeight(clampOverlayHeight(next));
        },
        onResizeEnd: () => {
          heightRef.current = null;
        }
      },
      side: {
        getValue: () => measureWidth() / 2,
        min: MIN_DOCK_WIDTH / 2,
        max: MAX_DOCK_WIDTH / 2,
        onResizeStart: () => {
          widthRef.current = measureWidth();
        },
        onResize: (delta: number) => {
          const next = (widthRef.current ?? measureWidth()) + 2 * delta;
          if (widthRef.current !== null) {
            widthRef.current = next;
          }
          setDockWidth(clampDockWidth(next));
        },
        onResizeEnd: () => {
          widthRef.current = null;
        }
      }
    };
  }, [overlayRef, setOverlayHeight, setDockWidth]);
};

export default useCanvasDockResize;
