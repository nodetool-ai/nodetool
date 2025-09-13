import { useCallback, useRef } from "react";
import { LeftPanelView, usePanelStore } from "../../stores/PanelStore";
const DEFAULT_PANEL_SIZE = 400;
const MIN_DRAG_SIZE = 60;
const MIN_PANEL_SIZE = DEFAULT_PANEL_SIZE - 100;
const MAX_PANEL_SIZE = 800;

export const useResizePanel = (panelPosition: "left" | "right" = "left") => {
  const panel = usePanelStore((state) => state.panel);
  const startDragX = useRef(0);
  const startDragSize = useRef(0);

  const actions = usePanelStore(
    useCallback(
      (state) => ({
        setSize: state.setSize,
        setVisibility: state.setVisibility,
        setIsDragging: state.setIsDragging,
        setHasDragged: state.setHasDragged,
        handleViewChange: state.handleViewChange
      }),
      []
    )
  );

  const ref = useRef<HTMLDivElement>(null);
  const lastSizeRef = useRef(
    Math.max(MIN_PANEL_SIZE, panel.panelSize || DEFAULT_PANEL_SIZE)
  );
  const dragThreshold = 20;

  const handleMouseDown = useCallback(
    (event: React.MouseEvent<HTMLElement>) => {
      startDragX.current = event.clientX;
      startDragSize.current = panel.panelSize || DEFAULT_PANEL_SIZE;
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
        const currentSize = usePanelStore.getState().panel.panelSize;

        if (!hasMoved) {
          // If we didn't move, treat it as a click and toggle the current view
          actions.handleViewChange(panel.activeView);
        } else {
          // Ensure final size respects minimum and collapse if below threshold
          let finalSize = Math.max(
            MIN_DRAG_SIZE,
            currentSize || DEFAULT_PANEL_SIZE
          );

          let visible = true;
          if (finalSize < MIN_PANEL_SIZE) {
            finalSize = MIN_DRAG_SIZE;
            visible = false;
          }

          if (finalSize !== currentSize) {
            actions.setSize(finalSize);
          }
          actions.setVisibility(visible);
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
    [panelPosition, panel.panelSize, panel.activeView, actions]
  );

  // Update lastSizeRef when panel is open
  if (panel.panelSize > MIN_DRAG_SIZE) {
    lastSizeRef.current = panel.panelSize;
  }

  return {
    ref,
    size: panel.panelSize,
    isVisible: panel.isVisible,
    isDragging: panel.isDragging || false,
    handleMouseDown,
    handlePanelToggle: (view: LeftPanelView) => actions.handleViewChange(view)
  };
};
