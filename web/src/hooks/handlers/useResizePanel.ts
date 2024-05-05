import { useState, useEffect, useCallback, useRef } from "react";

export const useResizePanel = (
  minWidth: number,
  maxWidth: number,
  initialWidth: number,
  orientation: "horizontal" | "vertical" = "vertical",
  panelPosition: "left" | "right" = "left"
) => {
  const [size, _setSize] = useState(initialWidth);
  const [isDragging, setIsDragging] = useState(false);
  const [hasDragged, setHasDragged] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const dragThreshold = 20;
  const storageKey = "panel-" + panelPosition + "-" + orientation;

  const setSize = useCallback(
    (newSize: number) => {
      _setSize(newSize);
      localStorage.setItem(storageKey, newSize.toString());
    },
    [storageKey]
  );

  // restore state from local storage
  useEffect(() => {
    const storedSize = localStorage.getItem(storageKey);
    if (storedSize) {
      _setSize(parseInt(storedSize));
    }
  }, [storageKey]);

  const handleMouseDown = useCallback(
    (event: React.MouseEvent<HTMLElement>) => {
      setIsDragging(true);
      setHasDragged(false);
      event.preventDefault();
    },
    []
  );

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);

    // delay reset of hasDragged state
    setTimeout(() => setHasDragged(false), 0);
  }, []);

  const handleMouseMove = useCallback(
    (event: MouseEvent) => {
      if (!isDragging) return;

      let newSize;
      if (orientation === "vertical") {
        newSize = window.innerHeight - event.clientY - 20;
      } else {
        if (panelPosition === "left") {
          newSize =
            event.clientX -
            30 -
            (ref.current?.getBoundingClientRect().left || 0);
        } else {
          newSize = window.innerWidth - event.clientX - 30;
        }
      }

      newSize = Math.max(minWidth, Math.min(newSize, maxWidth));
      setSize(newSize);

      const distance =
        orientation === "vertical"
          ? Math.abs(
              event.clientY - (ref.current?.getBoundingClientRect().top || 0)
            )
          : Math.abs(
              event.clientX - (ref.current?.getBoundingClientRect().left || 0)
            );

      if (distance > dragThreshold) {
        setHasDragged(true);
      }
    },
    [isDragging, orientation, minWidth, maxWidth, setSize, panelPosition]
  );

  const handlePanelToggle = useCallback(() => {
    if (!hasDragged) {
      setSize(size > minWidth ? minWidth : Math.min(maxWidth / 2, 300));
    }
  }, [hasDragged, setSize, size, minWidth, maxWidth]);

  useEffect(() => {
    const handleMouseUpOutside = () => {
      setIsDragging(false);
      setTimeout(() => setHasDragged(false), 0);
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
