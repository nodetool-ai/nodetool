/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, { useRef, useEffect, useCallback, memo } from "react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";

// Checkered background pattern for transparency
const checkerboardPattern = `
  linear-gradient(45deg, #ccc 25%, transparent 25%),
  linear-gradient(-45deg, #ccc 25%, transparent 25%),
  linear-gradient(45deg, transparent 75%, #ccc 75%),
  linear-gradient(-45deg, transparent 75%, #ccc 75%)
`;

const styles = (theme: Theme, orientation: "horizontal" | "vertical") =>
  css({
    "&": {
      position: "relative",
      width: orientation === "horizontal" ? "100%" : "24px",
      height: orientation === "horizontal" ? "24px" : "100%",
      borderRadius: "12px",
      cursor: "pointer",
      overflow: "hidden",
      border: `1px solid ${theme.vars.palette.grey[700]}`,
      // Checkered background for transparency visualization
      backgroundImage: checkerboardPattern,
      backgroundSize: "8px 8px",
      backgroundPosition: "0 0, 0 4px, 4px -4px, -4px 0px"
    },
    ".alpha-gradient": {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0
    },
    ".alpha-cursor": {
      position: "absolute",
      width: orientation === "horizontal" ? "8px" : "100%",
      height: orientation === "horizontal" ? "100%" : "8px",
      borderRadius: "4px",
      border: "2px solid white",
      boxShadow: "0 0 0 1px rgba(0,0,0,0.3), 0 2px 4px rgba(0,0,0,0.3)",
      transform: orientation === "horizontal" ? "translateX(-50%)" : "translateY(-50%)",
      pointerEvents: "none",
      boxSizing: "border-box"
    }
  });

interface AlphaSliderProps {
  color: string; // hex color without alpha
  alpha: number; // 0-1
  onChange: (alpha: number) => void;
  orientation?: "horizontal" | "vertical";
}

const AlphaSlider = memo(function AlphaSlider({
  color,
  alpha,
  onChange,
  orientation = "horizontal"
}: AlphaSliderProps) {
  const theme = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);

  const updateAlpha = useCallback(
    (clientX: number, clientY: number) => {
      const container = containerRef.current;
      if (!container) { return; }

      const rect = container.getBoundingClientRect();
      
      let percentage: number;
      if (orientation === "horizontal") {
        percentage = (clientX - rect.left) / rect.width;
      } else {
        percentage = 1 - (clientY - rect.top) / rect.height;
      }

      // Clamp alpha to 0-1
      const newAlpha = Math.max(0, Math.min(1, percentage));
      onChange(Math.round(newAlpha * 100) / 100);
    },
    [onChange, orientation]
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      isDragging.current = true;
      updateAlpha(e.clientX, e.clientY);
    },
    [updateAlpha]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isDragging.current) { return; }
      updateAlpha(e.clientX, e.clientY);
    },
    [updateAlpha]
  );

  const handleMouseUp = useCallback(() => {
    isDragging.current = false;
  }, []);

  // Handle touch events
  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      isDragging.current = true;
      const touch = e.touches[0];
      updateAlpha(touch.clientX, touch.clientY);
    },
    [updateAlpha]
  );

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (!isDragging.current) { return; }
      const touch = e.touches[0];
      updateAlpha(touch.clientX, touch.clientY);
    },
    [updateAlpha]
  );

  // Global mouse up listener
  useEffect(() => {
    const handleGlobalMouseUp = () => {
      isDragging.current = false;
    };

    window.addEventListener("mouseup", handleGlobalMouseUp);
    window.addEventListener("touchend", handleGlobalMouseUp);

    return () => {
      window.removeEventListener("mouseup", handleGlobalMouseUp);
      window.removeEventListener("touchend", handleGlobalMouseUp);
    };
  }, []);

  // Calculate cursor position
  const cursorPosition = orientation === "horizontal"
    ? `${alpha * 100}%`
    : `${(1 - alpha) * 100}%`;

  // Create gradient background
  const gradientStyle = orientation === "horizontal"
    ? {
        background: `linear-gradient(to right, transparent, ${color})`
      }
    : {
        background: `linear-gradient(to top, transparent, ${color})`
      };

  const cursorStyle = orientation === "horizontal"
    ? { left: cursorPosition, backgroundColor: color }
    : { top: cursorPosition, backgroundColor: color };

  return (
    <div
      ref={containerRef}
      css={styles(theme, orientation)}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleMouseUp}
    >
      <div className="alpha-gradient" style={gradientStyle} />
      <div className="alpha-cursor" style={cursorStyle} />
    </div>
  );
});

export default AlphaSlider;
