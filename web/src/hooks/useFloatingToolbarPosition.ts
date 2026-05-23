import { useMemo } from "react";

/**
 * Calculates the position styles for the floating toolbar based on panel states.
 *
 * @param isRightPanelVisible - Whether the right panel is visible
 * @param rightPanelSize - Width of the right panel in pixels
 * @param bottomPanelVisible - Whether the bottom panel is visible
 * @param bottomPanelSize - Height of the bottom panel in pixels
 * @param isMobile - When true, skip the side-panel horizontal offset (mobile
 *   renders the right panel as a bottom sheet, not a fixed side panel).
 * @returns CSS style object for toolbar positioning
 */
export const useFloatingToolbarPosition = (
  isRightPanelVisible: boolean,
  rightPanelSize: number,
  bottomPanelVisible: boolean,
  bottomPanelSize: number,
  isMobile: boolean = false
): React.CSSProperties => {
  return useMemo(() => {
    const style: React.CSSProperties = {};

    // Adjust horizontal position when right panel is visible (desktop only).
    if (isRightPanelVisible && !isMobile) {
      style.left = "auto";
      style.transform = "none";
      style.right = `${Math.max(rightPanelSize + 20, 72)}px`;
    }

    // The bottom panel is always present as a thin tab rail (~36px) and
    // expands when visible. Offset the toolbar above whichever height applies.
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
  }, [
    isRightPanelVisible,
    rightPanelSize,
    bottomPanelVisible,
    bottomPanelSize,
    isMobile
  ]);
};
