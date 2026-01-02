/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, { useRef, useEffect, useCallback, useState } from "react";
import { Box } from "@mui/material";
import { useTheme, Theme } from "@mui/material/styles";
import {
  generateRulerTicks,
  formatTimeShort,
  timeToPixels,
  pixelsToTime
} from "../../utils/timelineUtils";
import useTimelineStore from "../../stores/TimelineStore";

const styles = (theme: Theme) =>
  css({
    position: "relative",
    height: "100%",
    overflow: "hidden",
    backgroundColor:
      theme.vars?.palette?.background?.paper || theme.palette.background.paper,

    ".ruler-canvas": {
      display: "block"
    },

    ".loop-region": {
      position: "absolute",
      top: 0,
      bottom: 0,
      backgroundColor: "rgba(255, 193, 7, 0.2)",
      borderLeft: "2px solid #ffc107",
      borderRight: "2px solid #ffc107",
      pointerEvents: "none",
      zIndex: 1
    },

    ".loop-handle": {
      position: "absolute",
      top: 0,
      width: "12px",
      height: "100%",
      cursor: "ew-resize",
      zIndex: 2,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",

      "&::before": {
        content: '""',
        width: "4px",
        height: "16px",
        backgroundColor: "#ffc107",
        borderRadius: "2px",
        boxShadow: "0 1px 3px rgba(0,0,0,0.3)"
      },

      "&:hover::before": {
        backgroundColor: "#ffca28",
        transform: "scaleY(1.1)"
      },

      "&.loop-in": {
        transform: "translateX(-6px)"
      },

      "&.loop-out": {
        transform: "translateX(-6px)"
      }
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
  frameRate: _frameRate,
  width
}) => {
  const theme = useTheme();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dragSelection, setDragSelection] = useState<{
    start: number;
    end: number;
  } | null>(null);

  const { playback, setLoopRegion, seek } = useTimelineStore();
  const { loopEnabled, loopStart, loopEnd } = playback;

  // Colors from theme
  const textColor = theme.palette.text.secondary;
  const majorTickColor = theme.palette.text.primary;
  const minorTickColor = theme.palette.divider;
  const microTickColor = theme.palette.action.disabled;
  const bgColor = theme.palette.background.paper;

  // Handle dragging loop markers
  const handleLoopHandleMouseDown = useCallback(
    (handle: "in" | "out") => (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const handleMouseMove = (moveEvent: MouseEvent) => {
        if (!containerRef.current) {
          return;
        }
        const rect = containerRef.current.getBoundingClientRect();
        const x = moveEvent.clientX - rect.left + scrollLeft;
        const time = Math.max(
          0,
          Math.min(duration, pixelsToTime(x, pixelsPerSecond))
        );

        if (handle === "in") {
          setLoopRegion(time, loopEnd);
        } else {
          setLoopRegion(loopStart, time);
        }
      };

      const handleMouseUp = () => {
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
      };

      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    },
    [scrollLeft, pixelsPerSecond, duration, loopStart, loopEnd, setLoopRegion]
  );

  // Handle drag on ruler to create loop region (Alt+drag or Shift+drag)
  // or click to seek
  const handleRulerMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (!containerRef.current) {
        return;
      }

      const rect = containerRef.current.getBoundingClientRect();
      const startX = e.clientX - rect.left + scrollLeft;
      const startTime = Math.max(
        0,
        Math.min(duration, pixelsToTime(startX, pixelsPerSecond))
      );

      // Alt+drag or Shift+drag to create loop region
      if (e.altKey || e.shiftKey) {
        e.preventDefault();
        setDragSelection({ start: startTime, end: startTime });

        const handleMouseMove = (moveEvent: MouseEvent) => {
          if (!containerRef.current) {
            return;
          }
          const currentRect = containerRef.current.getBoundingClientRect();
          const currentX = moveEvent.clientX - currentRect.left + scrollLeft;
          const currentTime = Math.max(
            0,
            Math.min(duration, pixelsToTime(currentX, pixelsPerSecond))
          );

          // Update preview
          setDragSelection({
            start: Math.min(startTime, currentTime),
            end: Math.max(startTime, currentTime)
          });
        };

        const handleMouseUp = (upEvent: MouseEvent) => {
          if (!containerRef.current) {
            setDragSelection(null);
            document.removeEventListener("mousemove", handleMouseMove);
            document.removeEventListener("mouseup", handleMouseUp);
            return;
          }
          const currentRect = containerRef.current.getBoundingClientRect();
          const currentX = upEvent.clientX - currentRect.left + scrollLeft;
          const currentTime = Math.max(
            0,
            Math.min(duration, pixelsToTime(currentX, pixelsPerSecond))
          );

          // Set loop region from start to current (auto-swaps if needed)
          const loopIn = Math.min(startTime, currentTime);
          const loopOut = Math.max(startTime, currentTime);
          if (loopOut - loopIn > 0.1) {
            // Only set if drag was significant
            setLoopRegion(loopIn, loopOut);
          }

          setDragSelection(null);
          document.removeEventListener("mousemove", handleMouseMove);
          document.removeEventListener("mouseup", handleMouseUp);
        };

        document.addEventListener("mousemove", handleMouseMove);
        document.addEventListener("mouseup", handleMouseUp);
      } else {
        // Regular click - seek to position
        seek(startTime);
      }
    },
    [scrollLeft, pixelsPerSecond, duration, setLoopRegion, seek]
  );

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
    const endTime = Math.min(
      duration,
      (scrollLeft + rect.width + padding) / pixelsPerSecond
    );

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

  // Calculate loop region positions
  const loopInPixels = timeToPixels(loopStart, pixelsPerSecond) - scrollLeft;
  const loopOutPixels = timeToPixels(loopEnd, pixelsPerSecond) - scrollLeft;
  const loopWidth = loopOutPixels - loopInPixels;
  const showLoopRegion = loopEnabled && loopEnd > loopStart;

  return (
    <Box ref={containerRef} css={styles(theme)} className="time-ruler">
      <canvas
        ref={canvasRef}
        className="ruler-canvas"
        style={{
          width: "100%",
          height: "100%",
          cursor: "pointer"
        }}
        onMouseDown={handleRulerMouseDown}
      />
      {/* Drag selection preview */}
      {dragSelection && (
        <div
          className="loop-region"
          style={{
            left:
              timeToPixels(dragSelection.start, pixelsPerSecond) - scrollLeft,
            width: Math.max(
              0,
              (dragSelection.end - dragSelection.start) * pixelsPerSecond
            ),
            opacity: 0.6
          }}
        />
      )}

      {/* Loop region overlay and handles */}
      {showLoopRegion && !dragSelection && (
        <>
          <div
            className="loop-region"
            style={{
              left: loopInPixels,
              width: Math.max(0, loopWidth)
            }}
          />
          <div
            className="loop-handle loop-in"
            style={{ left: loopInPixels }}
            onMouseDown={handleLoopHandleMouseDown("in")}
            title="Loop In"
          />
          <div
            className="loop-handle loop-out"
            style={{ left: loopOutPixels }}
            onMouseDown={handleLoopHandleMouseDown("out")}
            title="Loop Out"
          />
        </>
      )}
    </Box>
  );
};

export default React.memo(TimeRuler);
