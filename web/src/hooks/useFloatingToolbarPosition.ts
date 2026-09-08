import { useMemo } from "react";

/**
 * Vertical position for the floating toolbar above the bottom panel.
 * FloatingToolBar sets horizontal bounds from the visible side panels.
 */
export const useFloatingToolbarPosition = (
  bottomPanelVisible: boolean,
  bottomPanelSize: number
): React.CSSProperties => {
  return useMemo(() => {
    const style: React.CSSProperties = {};

    const BOTTOM_RAIL_HEIGHT = 36;
    if (bottomPanelVisible) {
      const maxBottomSize =
        typeof window !== "undefined"
          ? Math.max(200, window.innerHeight * 0.6)
          : bottomPanelSize;
      style.bottom = `${Math.max(
        Math.min(bottomPanelSize, maxBottomSize) + 20,
        80
      )}px`;
    } else {
      style.bottom = `${BOTTOM_RAIL_HEIGHT + 12}px`;
    }

    return style;
  }, [bottomPanelVisible, bottomPanelSize]);
};
