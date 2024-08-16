import { useEffect, useCallback, useRef } from "react";
import { usePanelStore } from "../../stores/PanelStore";

export const useResizePanel = (
  panelPosition: "left" | "right" = "left"
) => {

  const { panels, setSize, setIsDragging, setHasDragged } = usePanelStore();
  const { size, isDragging, hasDragged, maxWidth, minWidth } = panels[panelPosition];

  const ref = useRef<HTMLDivElement>(null);
  const dragThreshold = 20;

  const handleMouseDown = useCallback(
    (event: React.MouseEvent<HTMLElement>) => {
      setIsDragging(panelPosition, true);
      setHasDragged(panelPosition, false);
      event.preventDefault();
    },
    []
  );

  const handleMouseUp = useCallback(() => {
    setIsDragging(panelPosition, false);

    // delay reset of hasDragged state
    setTimeout(() => setHasDragged(panelPosition, false), 0);
  }, []);

  const handleMouseMove = useCallback(
    (event: MouseEvent) => {
      if (!isDragging) return;

      let newSize;
      if (panelPosition === "left") {
        newSize =
          event.clientX -
          30 -
          (ref.current?.getBoundingClientRect().left || 0);
      } else {
        newSize = window.innerWidth - event.clientX - 30;
      }

      newSize = Math.max(minWidth, Math.min(newSize, maxWidth));
      setSize(panelPosition, newSize);

      const distance = Math.abs(
        event.clientX - (ref.current?.getBoundingClientRect().left || 0)
      );

      if (distance > dragThreshold) {
        setHasDragged(panelPosition, true);
      }
    },
    [isDragging, minWidth, maxWidth, setSize, panelPosition]
  );

  const handlePanelToggle = useCallback(() => {
    if (!hasDragged) {
      setSize(panelPosition, size > minWidth ? minWidth : Math.min(maxWidth / 2, 300));
    }
  }, [hasDragged, setSize, size, minWidth, maxWidth]);

  useEffect(() => {
    const handleMouseUpOutside = () => {
      setIsDragging(panelPosition, false);
      setTimeout(() => setHasDragged(panelPosition, false), 0);
    };

    document.addEventListener("mouseup", handleMouseUpOutside);
    document.addEventListener("mousemove", handleMouseMove);

    return () => {
      document.removeEventListener("mouseup", handleMouseUpOutside);
      document.removeEventListener("mousemove", handleMouseMove);
    };
  }, [handleMouseMove]);

  return {
    ref,
    size,
    isDragging,
    handleMouseDown,
    handleMouseUp,
    handlePanelToggle
  };
};
