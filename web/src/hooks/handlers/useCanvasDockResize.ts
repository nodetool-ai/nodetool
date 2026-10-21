import { useCallback, useEffect, useMemo, useRef } from "react";
import useCanvasChatDockStore, {
  MAX_WINDOW_HEIGHT,
  MAX_WINDOW_WIDTH,
  MIN_WINDOW_HEIGHT,
  MIN_WINDOW_WIDTH,
  clampWindowHeight,
  clampWindowWidth
} from "../../stores/CanvasChatDockStore";

/**
 * Which edge/corner of the canvas chat window a resize gesture grabs. The
 * window is anchored at its top-right corner, so only the left edge, the
 * bottom edge and the corner between them resize it:
 *  - `left` grows the width as the pointer moves left.
 *  - `bottom` grows the height as the pointer moves down.
 *  - `bottom-left` does both.
 */
export type DockResizeEdge = "left" | "bottom" | "bottom-left";

/**
 * Mouse-driven corner resize for the canvas chat window. Measures the live
 * size from `windowRef` on grab, then writes clamped values to the dock store
 * as the pointer moves.
 */
export const useCanvasDockResize = (
  windowRef: React.RefObject<HTMLElement | null>
) => {
  const setWindowHeight = useCanvasChatDockStore((s) => s.setWindowHeight);
  const setWindowWidth = useCanvasChatDockStore((s) => s.setWindowWidth);

  const cleanupRef = useRef<(() => void) | null>(null);

  const startResize = useCallback(
    (edge: DockResizeEdge) => (event: React.MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      const el = windowRef.current;
      if (!el) {
        return;
      }
      const startX = event.clientX;
      const startY = event.clientY;
      const startWidth = el.offsetWidth;
      const startHeight = el.offsetHeight;
      const affectsWidth = edge !== "bottom";
      const affectsHeight = edge !== "left";

      const prevCursor = document.body.style.cursor;
      const prevUserSelect = document.body.style.userSelect;
      document.body.style.cursor =
        affectsWidth && affectsHeight
          ? "nesw-resize"
          : affectsWidth
            ? "ew-resize"
            : "ns-resize";
      document.body.style.userSelect = "none";

      const handleMove = (e: MouseEvent) => {
        if (affectsWidth) {
          // Dragging left (clientX decreases) makes the window wider.
          setWindowWidth(clampWindowWidth(startWidth - (e.clientX - startX)));
        }
        if (affectsHeight) {
          setWindowHeight(clampWindowHeight(startHeight + (e.clientY - startY)));
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
    [windowRef, setWindowHeight, setWindowWidth]
  );

  useEffect(() => () => cleanupRef.current?.(), []);

  return startResize;
};

/** Props one edge `ResizeHandle` of the chat window takes. */
interface DockEdgeHandleProps {
  getValue: () => number;
  min: number;
  max: number;
  onResize: (delta: number) => void;
  onResizeStart: () => void;
  onResizeEnd: () => void;
}

/**
 * `ResizeHandle` props for the window's left and bottom edges. Sizes are
 * measured from `windowRef` on grab, like {@link useCanvasDockResize}, and
 * summed from the start so a drag past a clamp has no slack to undo.
 */
export const useCanvasDockEdgeResize = (
  windowRef: React.RefObject<HTMLElement | null>
): { left: DockEdgeHandleProps; bottom: DockEdgeHandleProps } => {
  const setWindowHeight = useCanvasChatDockStore((s) => s.setWindowHeight);
  const setWindowWidth = useCanvasChatDockStore((s) => s.setWindowWidth);
  // Size at grab plus the deltas since. Null outside a drag (keyboard steps).
  const heightRef = useRef<number | null>(null);
  const widthRef = useRef<number | null>(null);

  return useMemo(() => {
    const measureHeight = () => windowRef.current?.offsetHeight ?? 0;
    const measureWidth = () => windowRef.current?.offsetWidth ?? 0;
    return {
      left: {
        getValue: measureWidth,
        min: MIN_WINDOW_WIDTH,
        max: MAX_WINDOW_WIDTH,
        onResizeStart: () => {
          widthRef.current = measureWidth();
        },
        onResize: (delta: number) => {
          const next = (widthRef.current ?? measureWidth()) + delta;
          if (widthRef.current !== null) {
            widthRef.current = next;
          }
          setWindowWidth(clampWindowWidth(next));
        },
        onResizeEnd: () => {
          widthRef.current = null;
        }
      },
      bottom: {
        getValue: measureHeight,
        min: MIN_WINDOW_HEIGHT,
        max: MAX_WINDOW_HEIGHT,
        onResizeStart: () => {
          heightRef.current = measureHeight();
        },
        onResize: (delta: number) => {
          const next = (heightRef.current ?? measureHeight()) + delta;
          if (heightRef.current !== null) {
            heightRef.current = next;
          }
          setWindowHeight(clampWindowHeight(next));
        },
        onResizeEnd: () => {
          heightRef.current = null;
        }
      }
    };
  }, [windowRef, setWindowHeight, setWindowWidth]);
};

export default useCanvasDockResize;
