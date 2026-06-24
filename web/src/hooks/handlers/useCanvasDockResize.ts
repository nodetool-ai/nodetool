import { useCallback, useEffect, useRef } from "react";
import useCanvasChatDockStore, {
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

export default useCanvasDockResize;
