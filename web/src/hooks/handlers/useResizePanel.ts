import { useCallback, useRef } from "react";
import { LeftPanelView, usePanelStore } from "../../stores/PanelStore";
import { useShallow } from "zustand/react/shallow";
const DEFAULT_PANEL_SIZE = 400;
const MIN_DRAG_SIZE = 60;
const MIN_PANEL_SIZE = 160;
const MAX_PANEL_SIZE = 800;

/** Smallest and largest width a drag can set. */
export const PANEL_MIN_SIZE = MIN_PANEL_SIZE;
export const PANEL_MAX_SIZE = MAX_PANEL_SIZE;

/**
 * Drives a side panel's `ResizeHandle`. The handle reports clamped deltas, so
 * this hook only applies them to the store and decides what a release means:
 * a press with no movement toggles the current view, a drag keeps the panel
 * open at the dragged width.
 */
export const useResizePanel = () => {
  const panel = usePanelStore(useShallow((state) => state.panel));
  const dragRef = useRef({ startSize: 0, moved: false });

  const actions = usePanelStore(
    useShallow(
      (state) => ({
        setSize: state.setSize,
        setVisibility: state.setVisibility,
        setIsDragging: state.setIsDragging,
        setHasDragged: state.setHasDragged,
        handleViewChange: state.handleViewChange
      })
    )
  );

  const ref = useRef<HTMLDivElement>(null);
  const lastSizeRef = useRef(
    Math.max(MIN_PANEL_SIZE, panel.panelSize || DEFAULT_PANEL_SIZE)
  );
  const dragThreshold = 20;

  const handleResizeStart = useCallback(() => {
    dragRef.current = {
      startSize: usePanelStore.getState().panel.panelSize || DEFAULT_PANEL_SIZE,
      moved: false
    };
    actions.setIsDragging(true);
    actions.setHasDragged(false);
  }, [actions]);

  const handleResize = useCallback(
    (delta: number) => {
      dragRef.current.moved = true;
      const current =
        usePanelStore.getState().panel.panelSize || DEFAULT_PANEL_SIZE;
      const newSize = Math.max(
        MIN_PANEL_SIZE,
        Math.min(current + delta, MAX_PANEL_SIZE)
      );
      actions.setSize(newSize);

      if (Math.abs(newSize - dragRef.current.startSize) > dragThreshold) {
        actions.setHasDragged(true);
      }
    },
    [actions]
  );

  const handleResizeEnd = useCallback(() => {
    const { panelSize: currentSize, activeView } =
      usePanelStore.getState().panel;

    if (!dragRef.current.moved) {
      // If we didn't move, treat it as a click and toggle the current view
      actions.handleViewChange(activeView);
    } else {
      // Clamp to the minimum width rather than collapsing — resizing small
      // limits the size; closing is done via the toggle button.
      const finalSize = Math.max(
        MIN_PANEL_SIZE,
        currentSize || DEFAULT_PANEL_SIZE
      );

      if (finalSize !== currentSize) {
        actions.setSize(finalSize);
      }
      actions.setVisibility(true);
    }

    actions.setIsDragging(false);
    // Reset hasDragged flag after drag completes
    // Using requestAnimationFrame ensures this happens after the current frame
    requestAnimationFrame(() => actions.setHasDragged(false));
  }, [actions]);

  // Update lastSizeRef when panel is open
  if (panel.panelSize > MIN_DRAG_SIZE) {
    lastSizeRef.current = panel.panelSize;
  }

  return {
    ref,
    size: panel.panelSize,
    isVisible: panel.isVisible,
    isDragging: panel.isDragging || false,
    handleResizeStart,
    handleResize,
    handleResizeEnd,
    handlePanelToggle: (view: LeftPanelView) => actions.handleViewChange(view)
  };
};
