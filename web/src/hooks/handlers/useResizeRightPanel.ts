import { useCallback, useRef } from "react";
import { useRightPanelStore, RightPanelView } from "../../stores/RightPanelStore";

const DEFAULT_PANEL_SIZE = 300;
const MIN_DRAG_SIZE = 60;
const MIN_PANEL_SIZE = DEFAULT_PANEL_SIZE;
const MAX_PANEL_SIZE = 600;

export const useResizeRightPanel = (panelPosition: "left" | "right" = "right") => {
  const panel = useRightPanelStore((state) => state.panel);
  const startDragX = useRef(0);
  const startDragSize = useRef(0);

  const actions = useRightPanelStore(
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
        if (!hasMoved) {
          actions.handleViewChange(panel.activeView);
        } else {
          let finalSize = Math.max(MIN_DRAG_SIZE, panel.panelSize || DEFAULT_PANEL_SIZE);

          let visible = true;
          if (finalSize < MIN_PANEL_SIZE) {
            finalSize = MIN_DRAG_SIZE;
            visible = false;
          }

          if (finalSize !== panel.panelSize) {
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

  return {
    ref,
    size: panel.panelSize,
    isVisible: panel.isVisible,
    isDragging: panel.isDragging || false,
    handleMouseDown,
    handlePanelToggle: (view: RightPanelView) => actions.handleViewChange(view)
  };
};

export default useResizeRightPanel;
