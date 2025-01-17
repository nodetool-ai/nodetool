import { useCallback, useRef } from "react";
import { usePanelStore } from "../../stores/PanelStore";

const DEFAULT_PANEL_SIZE = 400;
const MIN_DRAG_SIZE = 60;
const MIN_PANEL_SIZE = DEFAULT_PANEL_SIZE;
const MAX_PANEL_SIZE = 800;

export const useResizePanel = (panelPosition: "left" | "right" = "left") => {
  const panel = usePanelStore((state) => state.panel);
  const startDragX = useRef(0);
  const startDragSize = useRef(0);

  const actions = usePanelStore(
    useCallback(
      (state) => ({
        setSize: state.setSize,
        setIsDragging: state.setIsDragging,
        setHasDragged: state.setHasDragged,
        handleViewChange: state.handleViewChange
      }),
      []
    )
  );

  const ref = useRef<HTMLDivElement>(null);
  const lastSizeRef = useRef(
    Math.max(MIN_PANEL_SIZE, panel.size || DEFAULT_PANEL_SIZE)
  );
  const dragThreshold = 20;

  const handleMouseDown = useCallback(
    (event: React.MouseEvent<HTMLElement>) => {
      startDragX.current = event.clientX;
      startDragSize.current = panel.size || DEFAULT_PANEL_SIZE;
      actions.setIsDragging(true);
      actions.setHasDragged(false);

      let hasMoved = false;

      const handleMouseMove = (event: MouseEvent) => {
        hasMoved = true;
        const deltaX = event.clientX - startDragX.current;
        let newSize = startDragSize.current;

        if (panelPosition === "left") {
          newSize = startDragSize.current + deltaX;
        } else {
          newSize = startDragSize.current - deltaX;
        }

        newSize = Math.max(MIN_DRAG_SIZE, Math.min(newSize, MAX_PANEL_SIZE));
        actions.setSize(newSize);

        if (Math.abs(deltaX) > dragThreshold) {
          actions.setHasDragged(true);
        }
      };

      const handleMouseUp = () => {
        if (!hasMoved) {
          // If we didn't move, treat it as a click and toggle the current view
          actions.handleViewChange(panel.activeView);
        } else {
          // Ensure final size respects minimum
          const finalSize = Math.max(
            MIN_DRAG_SIZE,
            panel.size || DEFAULT_PANEL_SIZE
          );
          if (finalSize !== panel.size) {
            actions.setSize(finalSize);
          }
        }

        actions.setIsDragging(false);
        setTimeout(() => actions.setHasDragged(false), 0);

        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
      };

      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);

      event.preventDefault();
    },
    [panelPosition, panel.size, panel.activeView, actions]
  );

  // Update lastSizeRef when panel is open
  if (panel.size > MIN_DRAG_SIZE) {
    lastSizeRef.current = panel.size;
  }

  return {
    ref,
    size: Math.max(MIN_DRAG_SIZE, panel.size || DEFAULT_PANEL_SIZE),
    collapsed: panel.size <= MIN_DRAG_SIZE,
    isDragging: panel.isDragging || false,
    handleMouseDown,
    handlePanelToggle: () => actions.handleViewChange(panel.activeView)
  };
};
