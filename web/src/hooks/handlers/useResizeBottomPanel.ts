import { useCallback, useRef } from "react";
import { BottomPanelView, useBottomPanelStore } from "../../stores/BottomPanelStore";

const DEFAULT_PANEL_SIZE = 300;
const MIN_DRAG_SIZE = 40;
const MIN_PANEL_SIZE = 200;
const MAX_PANEL_SIZE = 600;

export const useResizeBottomPanel = () => {
  const panel = useBottomPanelStore((state) => state.panel);
  const startDragY = useRef(0);
  const startDragSize = useRef(0);

  const actions = useBottomPanelStore(
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
      startDragY.current = event.clientY;
      startDragSize.current = panel.panelSize || DEFAULT_PANEL_SIZE;
      actions.setIsDragging(true);
      actions.setHasDragged(false);

      let hasMoved = false;

      const handleMouseMove = (event: MouseEvent) => {
        hasMoved = true;
        const deltaY = startDragY.current - event.clientY; // Inverted for bottom panel
        let newSize = startDragSize.current + deltaY;

        newSize = Math.max(MIN_DRAG_SIZE, Math.min(newSize, MAX_PANEL_SIZE));
        actions.setSize(newSize);

        if (Math.abs(deltaY) > dragThreshold) {
          actions.setHasDragged(true);
        }
      };

      const handleMouseUp = () => {
        const currentSize = useBottomPanelStore.getState().panel.panelSize;

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
    [panel.panelSize, panel.activeView, actions]
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
    handlePanelToggle: (view: BottomPanelView) => actions.handleViewChange(view),
  };
};
