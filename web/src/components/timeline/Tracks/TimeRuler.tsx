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
  useRef,
  useState
} from "react";
import { css } from "@emotion/react";
import { useColorScheme, useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";

import { useTimelinePlaybackStore } from "../../../stores/timeline/TimelinePlaybackStore";
import { useTimelineUIStore } from "../../../stores/timeline/TimelineUIStore";
import { useTimelineStore } from "../../../stores/timeline/TimelineStore";
import { BORDER_RADIUS, FONT_SIZE_MONO } from "../../ui_primitives";

interface RulerColors {
  bg: string;
  text: string;
  tick: string;
  marker: string;
}

/**
 * Pick concrete color strings for the ruler from the active color scheme.
 * Canvas 2D won't parse `var(--…)`, and `theme.palette.X` returns CSS-var
 * strings under nodetool's `cssVariables` theme — so we go through
 * `theme.colorSchemes` which exposes the plain palette values for each mode.
 */
function pickRulerColors(theme: Theme, mode: "light" | "dark"): RulerColors {
  const scheme = theme.colorSchemes?.[mode];
  const palette = scheme?.palette;
  return {
    bg: palette?.background?.paper ?? (mode === "dark" ? "#101113" : "#ffffff"),
    text:
      palette?.text?.secondary ?? (mode === "dark" ? "#a0a0a0" : "#5a5550"),
    tick:
      palette?.divider ??
      (mode === "dark" ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.12)"),
    marker:
      palette?.primary?.main ?? (mode === "dark" ? "#5b9bd5" : "#1976d2")
  };
}

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

/** Overlay layer holding the interactive marker flags above the canvas. */
const markerLayerStyles = css({
  position: "absolute",
  top: 0,
  bottom: 0,
  right: 0,
  pointerEvents: "none"
});

const markerFlagStyles = (theme: Theme) =>
  css({
    position: "absolute",
    top: 0,
    transform: "translateX(-1px)",
    display: "flex",
    alignItems: "center",
    gap: 2,
    height: 14,
    maxWidth: 140,
    padding: "0 3px",
    borderRadius: `0 ${BORDER_RADIUS.xs} ${BORDER_RADIUS.xs} 0`,
    fontSize: FONT_SIZE_MONO.caption,
    lineHeight: "14px",
    whiteSpace: "nowrap",
    color: theme.vars.palette.primary.contrastText,
    backgroundColor: theme.vars.palette.primary.main,
    cursor: "pointer",
    pointerEvents: "auto",
    "& .marker-label": {
      overflow: "hidden",
      textOverflow: "ellipsis"
    },
    "& .marker-delete": {
      display: "none",
      border: "none",
      background: "transparent",
      color: "inherit",
      cursor: "pointer",
      padding: 0,
      margin: 0,
      fontSize: "var(--fontSizeSmaller)",
      lineHeight: 1
    },
    "&:hover .marker-delete": { display: "inline" }
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
    const { mode, systemMode } = useColorScheme();
    const activeMode = mode === "system" ? systemMode : mode;
    const canvasRef = useRef<HTMLCanvasElement>(null);

    const msPerPx = useTimelineUIStore((s) => s.msPerPx);
    const scrollLeftPx = useTimelineUIStore((s) => s.scrollLeftPx);
    const seek = useTimelinePlaybackStore((s) => s.seek);
    const currentTimeMs = useTimelinePlaybackStore((s) => s.currentTimeMs);
    const markers = useTimelineStore((s) => s.markers);
    const removeScene = useTimelineStore((s) => s.removeScene);

    // ── Resize → redraw ─────────────────────────────────────────────────────
    //
    // The canvas backing store is sized from offsetWidth/offsetHeight inside
    // the draw effect; bump a tick on container resize so the effect reruns
    // and the ruler redraws at the new size.

    const [resizeTick, setResizeTick] = useState(0);
    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) {
        return;
      }
      const ro = new ResizeObserver(() => setResizeTick((t) => t + 1));
      ro.observe(canvas);
      return () => ro.disconnect();
    }, []);

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

      const colors = pickRulerColors(theme, activeMode === "light" ? "light" : "dark");
      ctx.fillStyle = colors.bg;
      ctx.fillRect(0, 0, w, h);

      const textColor = colors.text;
      const tickColor = colors.tick;

      const { majorMs, minorMs } = computeTickIntervals(msPerPx);

      // The canvas is already offset by the CSS paddingLeft (headerWidthPx),
      // so its x=0 aligns with the scrollable lanes' left edge. We work in the
      // canvas's own coordinate space here — no further header offset.
      const visibleStartMs = scrollLeftPx * msPerPx;
      const visibleEndMs = visibleStartMs + w * msPerPx;

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
        const px = tMs / msPerPx - scrollLeftPx;

        if (px < 0 || px > w) {
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

      // Scene markers — a full-height guide line on the canvas; the interactive
      // flag (label + delete) is a DOM overlay layered on top (see below).
      for (const m of markers) {
        const px = m.timeMs / msPerPx - scrollLeftPx;
        if (px < 0 || px > w) {
          continue;
        }
        ctx.strokeStyle = m.color || colors.marker;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(px + 0.5, 0);
        ctx.lineTo(px + 0.5, h);
        ctx.stroke();
      }
    }, [msPerPx, scrollLeftPx, totalWidthPx, theme, headerWidthPx, activeMode, markers, resizeTick]);

    // ── Pointer interaction ─────────────────────────────────────────────────

    const pxToMs = useCallback(
      (clientX: number): number => {
        const canvas = canvasRef.current;
        if (!canvas) {
          return 0;
        }
        const rect = canvas.getBoundingClientRect();
        const localPx = clientX - rect.left;
        return Math.max(0, localPx * msPerPx + scrollLeftPx * msPerPx);
      },
      [msPerPx, scrollLeftPx]
    );

    const handlePointerDown = useCallback(
      (e: React.PointerEvent<HTMLCanvasElement>) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        seek(pxToMs(e.clientX));
      },
      [pxToMs, seek]
    );

    const handlePointerMove = useCallback(
      (e: React.PointerEvent<HTMLCanvasElement>) => {
        if (e.buttons !== 1) {
          return;
        }
        seek(pxToMs(e.clientX));
      },
      [pxToMs, seek]
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
        <div css={markerLayerStyles} style={{ left: headerWidthPx }}>
          {markers.map((m) => {
            const px = m.timeMs / msPerPx - scrollLeftPx;
            if (px < 0 || px > totalWidthPx) {
              return null;
            }
            return (
              <div
                key={m.id}
                css={markerFlagStyles(theme)}
                style={{ left: px, backgroundColor: m.color || undefined }}
                title={`${m.label || "Marker"} — click to seek`}
                data-testid="timeline-marker"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  seek(m.timeMs);
                }}
              >
                <span className="marker-label">{m.label || "Marker"}</span>
                <button
                  type="button"
                  className="marker-delete"
                  data-testid="marker-delete"
                  aria-label={`Delete marker ${m.label || ""}`.trim()}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    removeScene(m.id);
                  }}
                >
                  ×
                </button>
              </div>
            );
          })}
        </div>
      </div>
    );
  }
);

TimeRuler.displayName = "TimeRuler";
