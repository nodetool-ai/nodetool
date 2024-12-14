import { useCallback, useRef } from "react";
import { usePanelStore } from "../../stores/PanelStore";

const PANEL_SIZE_KEY = "panel-sizes";

// Helper function to get stored sizes
export const getStoredPanelSizes = (): Record<string, number> => {
  try {
    const stored = localStorage.getItem(PANEL_SIZE_KEY);
    return stored ? JSON.parse(stored) : {};
  } catch {
    return {};
  }
};

// Helper function to store sizes
const storePanelSize = (position: string, size: number) => {
  try {
    const currentSizes = getStoredPanelSizes();
    localStorage.setItem(
      PANEL_SIZE_KEY,
      JSON.stringify({ ...currentSizes, [position]: size })
    );
  } catch {
    // Silently fail if localStorage is not available
  }
};

export const useResizePanel = (panelPosition: "left" | "right" = "left") => {
  const panel = usePanelStore(
    useCallback((state) => state.panels[panelPosition], [panelPosition])
  );

  const actions = usePanelStore(
    useCallback(
      (state) => ({
        setSize: (position: "left" | "right", size: number) => {
          state.setSize(position, size);
          storePanelSize(position, size);
        },
        setIsDragging: state.setIsDragging,
        setHasDragged: state.setHasDragged
      }),
      []
    )
  );

  const ref = useRef<HTMLDivElement>(null);
  const lastSizeRef = useRef(panel.size);
  const dragThreshold = 20;

  const handleMouseDown = useCallback(
    (event: React.MouseEvent<HTMLElement>) => {
      actions.setIsDragging(panelPosition, true);
      actions.setHasDragged(panelPosition, false);

      const handleMouseMove = (event: MouseEvent) => {
        let newSize;
        if (panelPosition === "left") {
          newSize =
            event.clientX -
            30 -
            (ref.current?.getBoundingClientRect().left || 0);
        } else {
          newSize = window.innerWidth - event.clientX - 30;
        }

        newSize = Math.max(panel.minWidth, Math.min(newSize, panel.maxWidth));
        actions.setSize(panelPosition, newSize);

        const distance = Math.abs(
          event.clientX - (ref.current?.getBoundingClientRect().left || 0)
        );

        if (distance > dragThreshold) {
          actions.setHasDragged(panelPosition, true);
        }
      };

      const handleMouseUp = () => {
        actions.setIsDragging(panelPosition, false);
        setTimeout(() => actions.setHasDragged(panelPosition, false), 0);

        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
      };

      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);

      event.preventDefault();
    },
    [panelPosition, panel.minWidth, panel.maxWidth, actions]
  );

  const handlePanelToggle = useCallback(() => {
    if (!panel.hasDragged) {
      if (panel.size <= panel.minWidth) {
        // If panel is minimized, restore to last size or default size
        const newSize =
          lastSizeRef.current > panel.minWidth
            ? lastSizeRef.current
            : panel.defaultWidth || 250; // fallback default width
        actions.setSize(panelPosition, newSize);
      } else {
        // If panel is open, store current size and minimize
        lastSizeRef.current = panel.size;
        actions.setSize(panelPosition, panel.minWidth);
      }
    }
  }, [
    panel.hasDragged,
    panel.size,
    panel.minWidth,
    panel.defaultWidth,
    actions,
    panelPosition
  ]);

  // Store initial size in lastSizeRef when it changes
  if (panel.size > panel.minWidth) {
    lastSizeRef.current = panel.size;
  }

  return {
    ref,
    size: panel.size,
    isDragging: panel.isDragging,
    handleMouseDown,
    handlePanelToggle
  };
};
