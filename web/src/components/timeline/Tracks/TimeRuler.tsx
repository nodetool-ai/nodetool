/** @jsxImportSource @emotion/react */
/**
 * TimeRuler
 *
 * Canvas-rendered time ruler that sits above the track lanes.
 * - Major ticks every 5 s, minor every 1 s by default.
 * - Tick density adapts to msPerPx zoom level.
 * - Click → set playhead; drag → scrub (live update).
 * - Timecode format: M:SS (e.g. 0:05, 1:30).
 */

import React, {
  memo,
  useCallback,
  useEffect,
  useRef
} from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";

import { useTimelinePlaybackStore } from "../../../stores/timeline/TimelinePlaybackStore";
import { useTimelineUIStore } from "../../../stores/timeline/TimelineUIStore";

// ── Constants ──────────────────────────────────────────────────────────────

const RULER_HEIGHT_PX = 28;
const MIN_LABEL_GAP_PX = 60;

// ── Styles ─────────────────────────────────────────────────────────────────

const rulerStyles = (theme: Theme) =>
  css({
    position: "relative",
    height: RULER_HEIGHT_PX,
    flexShrink: 0,
    cursor: "pointer",
    userSelect: "none",
    backgroundColor: theme.vars.palette.background.paper,
    borderBottom: `1px solid ${theme.vars.palette.divider}`
  });

const canvasStyles = css({
  display: "block",
  width: "100%",
  height: "100%"
});

// ── Helpers ────────────────────────────────────────────────────────────────

/** Returns the best major/minor tick interval (in ms) given the zoom level. */
function computeTickIntervals(msPerPx: number): {
  majorMs: number;
  minorMs: number;
} {
  // How many ms fit in MIN_LABEL_GAP_PX?
  const minGapMs = MIN_LABEL_GAP_PX * msPerPx;

  // Candidate intervals (ms)
  const candidates = [
    100, 200, 500,
    1_000, 2_000, 5_000, 10_000,
    15_000, 30_000, 60_000,
    120_000, 300_000, 600_000
  ];

  let majorMs = candidates[candidates.length - 1];
  for (const c of candidates) {
    if (c >= minGapMs) {
      majorMs = c;
      break;
    }
  }

  // Minor tick = majorMs / 5
  const minorMs = majorMs / 5;
  return { majorMs, minorMs };
}

/** Formats ms into M:SS (e.g. 0:05, 1:30). */
function formatTimecode(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${String(sec).padStart(2, "0")}`;
}

// ── Component ──────────────────────────────────────────────────────────────

export interface TimeRulerProps {
  /** Total width of the scrollable canvas in pixels. */
  totalWidthPx: number;
  /** Header width (left panel) to offset the ruler content. */
  headerWidthPx?: number;
}

export const TimeRuler: React.FC<TimeRulerProps> = memo(
  ({ totalWidthPx, headerWidthPx = 0 }) => {
    const theme = useTheme();
    const canvasRef = useRef<HTMLCanvasElement>(null);

    const msPerPx = useTimelineUIStore((s) => s.msPerPx);
    const scrollLeftPx = useTimelineUIStore((s) => s.scrollLeftPx);
    const setCurrentTimeMs = useTimelinePlaybackStore(
      (s) => s.setCurrentTimeMs
    );
    const currentTimeMs = useTimelinePlaybackStore((s) => s.currentTimeMs);

    // ── Draw ────────────────────────────────────────────────────────────────

    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) {
        return;
      }

      const dpr = window.devicePixelRatio || 1;
      const w = canvas.offsetWidth;
      const h = canvas.offsetHeight;

      if (w === 0 || h === 0) {
        return;
      }

      canvas.width = w * dpr;
      canvas.height = h * dpr;

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        return;
      }

      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, w, h);

      const bg = theme.palette.background.paper;
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);

      const textColor = theme.palette.text.secondary;
      const tickColor = theme.palette.divider;

      const { majorMs, minorMs } = computeTickIntervals(msPerPx);

      // Visible time range (accounting for scroll and header offset)
      const visibleStartMs = scrollLeftPx * msPerPx;
      const visibleEndMs = visibleStartMs + (w - headerWidthPx) * msPerPx;

      // First tick time (floor to minorMs boundary)
      const firstTickMs =
        Math.floor(visibleStartMs / minorMs) * minorMs;

      ctx.font = `10px ${theme.typography.fontFamily ?? "sans-serif"}`;
      ctx.textBaseline = "top";
      ctx.textAlign = "left";

      for (
        let tMs = firstTickMs;
        tMs <= visibleEndMs + minorMs;
        tMs += minorMs
      ) {
        const px =
          headerWidthPx + (tMs / msPerPx) - scrollLeftPx;

        if (px < headerWidthPx || px > w) {
          continue;
        }

        const isMajor = Math.round(tMs) % Math.round(majorMs) === 0;

        ctx.strokeStyle = tickColor;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(px, h);
        ctx.lineTo(px, isMajor ? h / 2 : h * 0.75);
        ctx.stroke();

        if (isMajor) {
          ctx.fillStyle = textColor;
          ctx.fillText(formatTimecode(tMs), px + 3, 3);
        }
      }
    }, [msPerPx, scrollLeftPx, totalWidthPx, theme, headerWidthPx]);

    // ── Pointer interaction ─────────────────────────────────────────────────

    const pxToMs = useCallback(
      (clientX: number): number => {
        const canvas = canvasRef.current;
        if (!canvas) {
          return 0;
        }
        const rect = canvas.getBoundingClientRect();
        const localPx = clientX - rect.left - headerWidthPx;
        return Math.max(0, localPx * msPerPx + scrollLeftPx * msPerPx);
      },
      [msPerPx, scrollLeftPx, headerWidthPx]
    );

    const handlePointerDown = useCallback(
      (e: React.PointerEvent<HTMLCanvasElement>) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        setCurrentTimeMs(pxToMs(e.clientX));
      },
      [pxToMs, setCurrentTimeMs]
    );

    const handlePointerMove = useCallback(
      (e: React.PointerEvent<HTMLCanvasElement>) => {
        if (e.buttons !== 1) {
          return;
        }
        setCurrentTimeMs(pxToMs(e.clientX));
      },
      [pxToMs, setCurrentTimeMs]
    );

    return (
      <div
        css={rulerStyles(theme)}
        style={{ paddingLeft: headerWidthPx }}
        data-testid="time-ruler"
      >
        <canvas
          ref={canvasRef}
          css={canvasStyles}
          style={{ width: "100%", height: "100%" }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          aria-label="Time ruler — click or drag to set playhead"
          role="slider"
          aria-valuemin={0}
          aria-valuenow={Math.round(currentTimeMs)}
        />
      </div>
    );
  }
);

TimeRuler.displayName = "TimeRuler";
