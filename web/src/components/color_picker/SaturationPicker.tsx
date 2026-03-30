/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, { useRef, useEffect, useCallback, memo } from "react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { hsbToRgb, rgbToHex } from "../../utils/colorConversion";

const styles = (theme: Theme) =>
  css({
    "&": {
      position: "relative",
      width: "100%",
      aspectRatio: "1",
      borderRadius: "8px",
      cursor: "crosshair",
      overflow: "hidden",
      border: `1px solid ${theme.vars.palette.grey[700]}`
    },
    ".picker-canvas": {
      width: "100%",
      height: "100%",
      display: "block"
    },
    ".picker-cursor": {
      position: "absolute",
      width: "16px",
      height: "16px",
      borderRadius: "50%",
      border: "2px solid white",
      boxShadow: "0 0 0 1px rgba(0,0,0,0.3), 0 2px 4px rgba(0,0,0,0.3)",
      transform: "translate(-50%, -50%)",
      pointerEvents: "none"
    }
  });

interface SaturationPickerProps {
  hue: number; // 0-360
  saturation: number; // 0-100
  brightness: number; // 0-100
  onChange: (saturation: number, brightness: number) => void;
}

const SaturationPicker = memo(function SaturationPicker({
  hue,
  saturation,
  brightness,
  onChange
}: SaturationPickerProps) {
  const theme = useTheme();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);

  // Draw the saturation/brightness gradient
  const drawGradient = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) { return; }

    const ctx = canvas.getContext("2d");
    if (!ctx) { return; }

    const width = canvas.width;
    const height = canvas.height;

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // Get the base color at full saturation and brightness
    const baseRgb = hsbToRgb({ h: hue, s: 100, b: 100 });
    const baseColor = rgbToHex(baseRgb);

    // Create horizontal gradient (white to color)
    const gradientH = ctx.createLinearGradient(0, 0, width, 0);
    gradientH.addColorStop(0, "#ffffff");
    gradientH.addColorStop(1, baseColor);
    ctx.fillStyle = gradientH;
    ctx.fillRect(0, 0, width, height);

    // Create vertical gradient (transparent to black)
    const gradientV = ctx.createLinearGradient(0, 0, 0, height);
    gradientV.addColorStop(0, "rgba(0,0,0,0)");
    gradientV.addColorStop(1, "#000000");
    ctx.fillStyle = gradientV;
    ctx.fillRect(0, 0, width, height);
  }, [hue]);

  // Draw gradient when hue changes
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) { return; }

    // Set canvas size to match display size
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * window.devicePixelRatio;
    canvas.height = rect.height * window.devicePixelRatio;

    drawGradient();
  }, [hue, drawGradient]);

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

  const updateColor = useCallback(
    (clientX: number, clientY: number) => {
      const container = containerRef.current;
      if (!container) { return; }

      const rect = container.getBoundingClientRect();
      
      // Calculate position as percentage
      let x = ((clientX - rect.left) / rect.width) * 100;
      let y = ((clientY - rect.top) / rect.height) * 100;

      // Clamp values
      x = Math.max(0, Math.min(100, x));
      y = Math.max(0, Math.min(100, y));

      // x = saturation, y = inverse brightness (top = 100, bottom = 0)
      onChange(x, 100 - y);
    },
    [onChange]
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      isDragging.current = true;
      updateColor(e.clientX, e.clientY);
    },
    [updateColor]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isDragging.current) { return; }
      updateColor(e.clientX, e.clientY);
    },
    [updateColor]
  );

  const handleMouseUp = useCallback(() => {
    isDragging.current = false;
  }, []);

  // Handle touch events
  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      isDragging.current = true;
      const touch = e.touches[0];
      updateColor(touch.clientX, touch.clientY);
    },
    [updateColor]
  );

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (!isDragging.current) { return; }
      const touch = e.touches[0];
      updateColor(touch.clientX, touch.clientY);
    },
    [updateColor]
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
  const cursorX = `${saturation}%`;
  const cursorY = `${100 - brightness}%`;

  // Get cursor color for border contrast
  const cursorRgb = hsbToRgb({ h: hue, s: saturation, b: brightness });
  const cursorHex = rgbToHex(cursorRgb);

  return (
    <div
      ref={containerRef}
      css={styles(theme)}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleMouseUp}
    >
      <canvas ref={canvasRef} className="picker-canvas" />
      <div
        className="picker-cursor"
        style={{
          left: cursorX,
          top: cursorY,
          backgroundColor: cursorHex
        }}
      />
    </div>
  );
});

export default SaturationPicker;
