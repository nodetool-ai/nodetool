import { useMemo } from "react";

/**
 * Position styles for the floating toolbar. Reacts only to the bottom panel
 * (which is user-driven). The right panel auto-opens on node selection, so
 * shifting the toolbar with it would make it jump on every click — instead
 * the toolbar stays centered and the inspector overlays it when needed.
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
