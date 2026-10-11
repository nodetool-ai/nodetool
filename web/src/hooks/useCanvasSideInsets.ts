import { TOOLBAR_WIDTH, LEFT_PANEL_MIN_DRAWER_WIDTH } from "../config/constants";
import { usePanelStore } from "../stores/PanelStore";
import { useRightPanelStore } from "../stores/RightPanelStore";

export interface CanvasSideInsets {
  /** Pixels the left rail and open left panel cover at the canvas's left edge. */
  left: number;
  /** Pixels the open inspector covers at the canvas's right edge. */
  right: number;
}

/**
 * The side panels overlay the canvas rather than shrinking it. An overlay
 * that centers on the canvas must center between these insets, or an open
 * Library panel covers its left half.
 */
export const useCanvasSideInsets = (): CanvasSideInsets => {
  const left = usePanelStore((state) =>
    state.panel.isVisible
      ? Math.max(state.panel.panelSize, TOOLBAR_WIDTH + LEFT_PANEL_MIN_DRAWER_WIDTH)
      : TOOLBAR_WIDTH
  );
  const right = useRightPanelStore((state) =>
    state.panel.isVisible ? state.panel.panelSize : 0
  );
  return { left, right };
};
