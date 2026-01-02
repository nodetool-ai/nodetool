/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, { useMemo, useRef, useEffect } from "react";
import { Box } from "@mui/material";
import { useTheme, Theme } from "@mui/material/styles";
import { generateRulerTicks, formatTimeShort, timeToPixels } from "../../utils/timelineUtils";

const styles = (theme: Theme) =>
  css({
    position: "relative",
    height: "100%",
    overflow: "hidden",
    backgroundColor: theme.vars?.palette?.background?.paper || theme.palette.background.paper,

    ".ruler-canvas": {
      display: "block"
    }
  });

interface TimeRulerProps {
  scrollLeft: number;
  pixelsPerSecond: number;
  duration: number;
  frameRate: number;
  width: number;
}

const TimeRuler: React.FC<TimeRulerProps> = ({
  scrollLeft,
  pixelsPerSecond,
  duration,
  frameRate,
  width
}) => {
  const theme = useTheme();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Colors from theme
  const textColor = theme.palette.text.secondary;
  const majorTickColor = theme.palette.text.primary;
  const minorTickColor = theme.palette.divider;
  const microTickColor = theme.palette.action.disabled;
  const bgColor = theme.palette.background.paper;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    
    // Set canvas size accounting for device pixel ratio
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    // Clear canvas
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, rect.width, rect.height);

    // Calculate visible time range with padding
    const padding = 100; // Extra pixels to render for smooth scrolling
    const startTime = Math.max(0, (scrollLeft - padding) / pixelsPerSecond);
    const endTime = Math.min(duration, (scrollLeft + rect.width + padding) / pixelsPerSecond);

    // Generate ticks
    const ticks = generateRulerTicks(startTime, endTime, pixelsPerSecond);

    // Draw ticks
    ctx.font = "10px Inter, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";

    for (const tick of ticks) {
      const x = timeToPixels(tick.time, pixelsPerSecond) - scrollLeft;
      
      if (x < -padding || x > rect.width + padding) {
        continue;
      }

      let tickHeight: number;
      let tickColor: string;

      switch (tick.type) {
        case "major":
          tickHeight = 12;
          tickColor = majorTickColor;
          // Draw time label for major ticks
          ctx.fillStyle = textColor;
          ctx.fillText(formatTimeShort(tick.time), x, 2);
          break;
        case "minor":
          tickHeight = 8;
          tickColor = minorTickColor;
          break;
        case "micro":
          tickHeight = 4;
          tickColor = microTickColor;
          break;
        default:
          tickHeight = 4;
          tickColor = microTickColor;
      }

      // Draw tick
      ctx.beginPath();
      ctx.strokeStyle = tickColor;
      ctx.lineWidth = tick.type === "major" ? 1 : 0.5;
      ctx.moveTo(x, rect.height - tickHeight);
      ctx.lineTo(x, rect.height);
      ctx.stroke();
    }

    // Draw bottom border
    ctx.beginPath();
    ctx.strokeStyle = theme.palette.divider;
    ctx.lineWidth = 1;
    ctx.moveTo(0, rect.height - 0.5);
    ctx.lineTo(rect.width, rect.height - 0.5);
    ctx.stroke();

  }, [
    scrollLeft,
    pixelsPerSecond,
    duration,
    width,
    bgColor,
    textColor,
    majorTickColor,
    minorTickColor,
    microTickColor,
    theme.palette.divider
  ]);

  return (
    <Box css={styles(theme)} className="time-ruler">
      <canvas
        ref={canvasRef}
        className="ruler-canvas"
        style={{
          width: "100%",
          height: "100%"
        }}
      />
    </Box>
  );
};

export default React.memo(TimeRuler);
