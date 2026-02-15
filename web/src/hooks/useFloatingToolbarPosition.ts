import { useMemo } from "react";

/**
 * Calculates the position styles for the floating toolbar based on panel states.
 *
 * @param isRightPanelVisible - Whether the right panel is visible
 * @param rightPanelSize - Width of the right panel in pixels
 * @param bottomPanelVisible - Whether the bottom panel is visible
 * @param bottomPanelSize - Height of the bottom panel in pixels
 * @returns CSS style object for toolbar positioning
 */
export const useFloatingToolbarPosition = (
  isRightPanelVisible: boolean,
  rightPanelSize: number,
  bottomPanelVisible: boolean,
  bottomPanelSize: number
): React.CSSProperties => {
  return useMemo(() => {
    const style: React.CSSProperties = {};

    // Adjust horizontal position when right panel is visible
    if (isRightPanelVisible) {
      style.left = "auto";
      style.transform = "none";
      style.right = `${Math.max(rightPanelSize + 20, 72)}px`;
    }

    // Adjust vertical position when bottom panel is visible
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
      style.bottom = "20px";
    }

    return style;
  }, [isRightPanelVisible, rightPanelSize, bottomPanelVisible, bottomPanelSize]);
};
