import { useEffect, useCallback, useRef } from "react";
import { usePanelStore } from "../../stores/PanelStore";
import useSessionStateStore from "../../stores/SessionStateStore";

export const useResizePanel = (panelPosition: "left" | "right" = "left") => {
  const { panels, setSize, setIsDragging, setHasDragged } = usePanelStore();
  const { size, isDragging, hasDragged, maxWidth, minWidth } =
    panels[panelPosition];

  const {
    leftPanelWidth,
    rightPanelWidth,
    setLeftPanelWidth,
    setRightPanelWidth
  } = useSessionStateStore();

  const ref = useRef<HTMLDivElement>(null);
  const dragThreshold = 20;

  const handleMouseDown = useCallback(
    (event: React.MouseEvent<HTMLElement>) => {
      setIsDragging(panelPosition, true);
      setHasDragged(panelPosition, false);
      event.preventDefault();
    },
    [panelPosition, setHasDragged, setIsDragging]
  );

  const handleMouseUp = useCallback(() => {
    setIsDragging(panelPosition, false);
    setTimeout(() => setHasDragged(panelPosition, false), 0);
  }, [panelPosition, setHasDragged, setIsDragging]);

  const handleMouseMove = useCallback(
    (event: MouseEvent) => {
      if (!isDragging) return;

      let newSize;
      if (panelPosition === "left") {
        newSize =
          event.clientX - 30 - (ref.current?.getBoundingClientRect().left || 0);
      } else {
        newSize = window.innerWidth - event.clientX - 30;
      }

      newSize = Math.max(minWidth, Math.min(newSize, maxWidth));
      setSize(panelPosition, newSize);

      // Update SessionStateStore
      if (panelPosition === "left") {
        setLeftPanelWidth(newSize);
      } else {
        setRightPanelWidth(newSize);
      }

      const distance = Math.abs(
        event.clientX - (ref.current?.getBoundingClientRect().left || 0)
      );

      if (distance > dragThreshold) {
        setHasDragged(panelPosition, true);
      }
    },
    [
      isDragging,
      panelPosition,
      minWidth,
      maxWidth,
      setSize,
      setHasDragged,
      setLeftPanelWidth,
      setRightPanelWidth
    ]
  );

  const handlePanelToggle = useCallback(() => {
    if (!hasDragged) {
      const storedWidth =
        panelPosition === "left" ? leftPanelWidth : rightPanelWidth;
      const newSize = size > minWidth ? minWidth : storedWidth;
      setSize(panelPosition, newSize);
    }
  }, [
    hasDragged,
    setSize,
    panelPosition,
    size,
    minWidth,
    leftPanelWidth,
    rightPanelWidth
  ]);

  useEffect(() => {
    document.addEventListener("mouseup", handleMouseUp);
    document.addEventListener("mousemove", handleMouseMove);

    return () => {
      document.removeEventListener("mouseup", handleMouseUp);
      document.removeEventListener("mousemove", handleMouseMove);
    };
  }, [handleMouseMove, handleMouseUp]);

  return {
    ref,
    size,
    isDragging,
    handleMouseDown,
    handlePanelToggle
  };
};
