/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, { useRef, useEffect, useCallback, memo } from "react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { hsbToRgb, rgbToHex } from "../../utils/colorConversion";

const styles = (theme: Theme, orientation: "horizontal" | "vertical") =>
  css({
    "&": {
      position: "relative",
      width: orientation === "horizontal" ? "100%" : "24px",
      height: orientation === "horizontal" ? "24px" : "100%",
      borderRadius: "12px",
      cursor: "pointer",
      overflow: "hidden",
      border: `1px solid ${theme.vars.palette.grey[700]}`
    },
    ".hue-canvas": {
      width: "100%",
      height: "100%",
      display: "block"
    },
    ".hue-cursor": {
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

interface HueSliderProps {
  hue: number; // 0-360
  onChange: (hue: number) => void;
  orientation?: "horizontal" | "vertical";
}

const HueSlider: React.FC<HueSliderProps> = ({
  hue,
  onChange,
  orientation = "horizontal"
}) => {
  const theme = useTheme();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);

  // Draw the hue gradient
  const drawGradient = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) { return; }

    const ctx = canvas.getContext("2d");
    if (!ctx) { return; }

    const width = canvas.width;
    const height = canvas.height;

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // Create hue gradient
    const gradient = orientation === "horizontal"
      ? ctx.createLinearGradient(0, 0, width, 0)
      : ctx.createLinearGradient(0, 0, 0, height);

    // Add color stops for the full hue spectrum
    for (let i = 0; i <= 360; i += 60) {
      const rgb = hsbToRgb({ h: i, s: 100, b: 100 });
      const color = rgbToHex(rgb);
      gradient.addColorStop(i / 360, color);
    }

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
  }, [orientation]);

  // Draw gradient on mount and orientation change
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) { return; }

    // Set canvas size to match display size
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * window.devicePixelRatio;
    canvas.height = rect.height * window.devicePixelRatio;

    drawGradient();
  }, [orientation, drawGradient]);

  // Handle resize
  useEffect(() => {
    const handleResize = () => {
      const canvas = canvasRef.current;
      if (!canvas) { return; }

      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * window.devicePixelRatio;
      canvas.height = rect.height * window.devicePixelRatio;

      drawGradient();
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [drawGradient]);

  const updateHue = useCallback(
    (clientX: number, clientY: number) => {
      const container = containerRef.current;
      if (!container) { return; }

      const rect = container.getBoundingClientRect();
      
      let percentage: number;
      if (orientation === "horizontal") {
        percentage = (clientX - rect.left) / rect.width;
      } else {
        percentage = (clientY - rect.top) / rect.height;
      }

      // Clamp and convert to hue
      percentage = Math.max(0, Math.min(1, percentage));
      const newHue = Math.round(percentage * 360);

      onChange(newHue);
    },
    [onChange, orientation]
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      isDragging.current = true;
      updateHue(e.clientX, e.clientY);
    },
    [updateHue]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isDragging.current) { return; }
      updateHue(e.clientX, e.clientY);
    },
    [updateHue]
  );

  const handleMouseUp = useCallback(() => {
    isDragging.current = false;
  }, []);

  // Handle touch events
  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      isDragging.current = true;
      const touch = e.touches[0];
      updateHue(touch.clientX, touch.clientY);
    },
    [updateHue]
  );

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (!isDragging.current) { return; }
      const touch = e.touches[0];
      updateHue(touch.clientX, touch.clientY);
    },
    [updateHue]
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
  const cursorPosition = `${(hue / 360) * 100}%`;

  // Get color at current hue for cursor
  const cursorRgb = hsbToRgb({ h: hue, s: 100, b: 100 });
  const cursorColor = rgbToHex(cursorRgb);

  const cursorStyle = orientation === "horizontal"
    ? { left: cursorPosition, backgroundColor: cursorColor }
    : { top: cursorPosition, backgroundColor: cursorColor };

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
      <canvas ref={canvasRef} className="hue-canvas" />
      <div className="hue-cursor" style={cursorStyle} />
    </div>
  );
};

export default memo(HueSlider);
