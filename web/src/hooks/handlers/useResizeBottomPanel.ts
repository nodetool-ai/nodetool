import { useCallback, useEffect, useRef } from "react";
import { BottomPanelView, useBottomPanelStore } from "../../stores/BottomPanelStore";
import { useShallow } from "zustand/react/shallow";

const DEFAULT_PANEL_SIZE = 300;
const MIN_DRAG_SIZE = 40;
const MIN_PANEL_SIZE = 200;
const MAX_PANEL_SIZE = 600;

/** The tab strip PanelBottom keeps docked while the panel is collapsed. */
export const BOTTOM_PANEL_STRIP_HEIGHT = 32;

/**
 * The height the bottom panel takes on screen. An open panel never takes more
 * than 70% of the window, so the page above it keeps room to work in.
 */
export const bottomPanelHeight = (
  isVisible: boolean,
  panelSize: number,
  viewportHeight: number
): number =>
  isVisible
    ? Math.min(panelSize, Math.max(200, viewportHeight * 0.7))
    : BOTTOM_PANEL_STRIP_HEIGHT;

/** Smallest and largest height a drag can set. */
export const BOTTOM_PANEL_MIN_DRAG_SIZE = MIN_DRAG_SIZE;
export const BOTTOM_PANEL_MAX_SIZE = MAX_PANEL_SIZE;

/**
 * Drives the bottom panel's `ResizeHandle`. The handle reports clamped deltas,
 * so this hook only applies them to the store and decides what a release
 * means: a press with no movement toggles the current view, a drag below
 * `MIN_PANEL_SIZE` collapses the panel.
 */
export const useResizeBottomPanel = () => {
  const panel = useBottomPanelStore(useShallow((state) => state.panel));
  const dragRef = useRef({ startSize: 0, moved: false });

  const actions = useBottomPanelStore(
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
  const hasDraggedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dragThreshold = 20;

  const handleResizeStart = useCallback(() => {
    dragRef.current = {
      startSize:
        useBottomPanelStore.getState().panel.panelSize || DEFAULT_PANEL_SIZE,
      moved: false
    };
    actions.setIsDragging(true);
    actions.setHasDragged(false);
  }, [actions]);

  const handleResize = useCallback(
    (delta: number) => {
      dragRef.current.moved = true;
      const current =
        useBottomPanelStore.getState().panel.panelSize || DEFAULT_PANEL_SIZE;
      const newSize = Math.max(
        MIN_DRAG_SIZE,
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
      useBottomPanelStore.getState().panel;

    if (!dragRef.current.moved) {
      // If we didn't move, treat it as a click and toggle the current view
      actions.handleViewChange(activeView);
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
    if (hasDraggedTimeoutRef.current !== null) {
      clearTimeout(hasDraggedTimeoutRef.current);
    }
    hasDraggedTimeoutRef.current = setTimeout(() => actions.setHasDragged(false), 0);
  }, [actions]);

  if (panel.panelSize > MIN_DRAG_SIZE) {
    lastSizeRef.current = panel.panelSize;
  }

  // Clear the pending hasDragged reset on unmount
  useEffect(() => {
    return () => {
      if (hasDraggedTimeoutRef.current !== null) {
        clearTimeout(hasDraggedTimeoutRef.current);
      }
    };
  }, []);

  return {
    ref,
    size: panel.panelSize,
    isVisible: panel.isVisible,
    isDragging: panel.isDragging || false,
    handleResizeStart,
    handleResize,
    handleResizeEnd,
    handlePanelToggle: (view: BottomPanelView) => actions.handleViewChange(view),
  };
};
