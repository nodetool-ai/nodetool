/** @jsxImportSource @emotion/react */
/**
 * TimeRuler
 *
 * Canvas-rendered time ruler that sits above the track lanes.
 * - Major ticks every 5 s, minor every 1 s by default.
 * - Tick density adapts to msPerPx zoom level.
 * - Click → set playhead; drag → scrub (live update).
 * - Timecode format: M:SS (e.g. 0:05, 1:30); M:SS:FF once ticks go sub-second.
 * - In/out range (I / O) drawn as a band behind the ticks.
 */

import React, {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { useTranslation } from "react-i18next";
import { css } from "@emotion/react";
import { useColorScheme, useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";

import { barDurationMs, resolveTempo } from "@nodetool-ai/timeline";
import type { TimelineMarker } from "@nodetool-ai/timeline";
import { useTimelinePlaybackStore } from "../../../stores/timeline/TimelinePlaybackStore";
import { useTimelineUIStore } from "../../../stores/timeline/TimelineUIStore";
import { useTimelineStore } from "../../../stores/timeline/TimelineStore";
import {
  BORDER_RADIUS,
  MOTION,
  FONT_SIZE_MONO,
  SPACING,
  TYPOGRAPHY,
  getSpacingPx,
  Tooltip
} from "../../ui_primitives";
import { computeBarRulerTicks } from "./tempoGrid";
import { SectionRangeMenu } from "./SectionRangeMenu";
import { hasSectionClipboard } from "./sectionRange";
import { useAlertNotifier } from "../../../hooks/useAlertNotifier";

interface RulerColors {
  bg: string;
  text: string;
  tick: string;
  marker: string;
  range: string;
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
      palette?.primary?.main ?? (mode === "dark" ? "#5b9bd5" : "#1976d2"),
    range: palette?.c_timeline_range ?? (mode === "dark" ? "#2d8ceb" : "#1a6fc4")
  };
}

const RULER_HEIGHT_PX = 28;
const MIN_LABEL_GAP_PX = 60;
/** Visible height of a marker flag. */
const MARKER_FLAG_HEIGHT_PX = 14;
/** Minimum pointer target for a marker flag; the extra height is invisible. */
const MARKER_HIT_HEIGHT_PX = 20;

const rulerStyles = (theme: Theme) =>
  css({
    position: "relative",
    height: RULER_HEIGHT_PX,
    flexShrink: 0,
    // The marker layer scrolls by translateX and keeps an overscan of flags
    // past the left edge. Clip it so they never draw over the tracks header.
    overflow: "hidden",
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
    gap: getSpacingPx(SPACING.micro),
    height: MARKER_FLAG_HEIGHT_PX,
    maxWidth: 140,
    padding: theme.spacing(0, 1),
    borderRadius: `0 ${BORDER_RADIUS.xs} ${BORDER_RADIUS.xs} 0`,
    ...TYPOGRAPHY.mono.caption,
    lineHeight: `${MARKER_FLAG_HEIGHT_PX}px`,
    whiteSpace: "nowrap",
    color: theme.vars.palette.primary.contrastText,
    backgroundColor: theme.vars.palette.primary.main,
    pointerEvents: "auto",
    "& .marker-seek": {
      position: "relative",
      minWidth: 0,
      border: "none",
      background: "transparent",
      color: "inherit",
      font: "inherit",
      padding: 0,
      margin: 0,
      cursor: "pointer",
      overflow: "hidden",
      textOverflow: "ellipsis",
      // Extend the pointer target below the flag without drawing it taller.
      "&::after": {
        content: '""',
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        height: MARKER_HIT_HEIGHT_PX
      }
    },
    "& .marker-seek:focus-visible, & .marker-delete:focus-visible": {
      outline: `2px solid ${theme.vars.palette.primary.contrastText}`,
      outlineOffset: 1
    },
    "& .marker-delete": {
      display: "none",
      border: "none",
      background: "transparent",
      color: "inherit",
      cursor: "pointer",
      padding: 0,
      margin: 0,
      fontSize: FONT_SIZE_MONO.caption,
      lineHeight: 1
    },
    "&:hover .marker-delete, &:focus-within .marker-delete": {
      display: "inline"
    }
  });

/** The picked range as a band in the ruler, like a DAW's marquee ruler strip. */
const rangeBandStyles = (theme: Theme) =>
  css({
    position: "absolute",
    bottom: 0,
    height: "40%",
    backgroundColor: theme.vars.palette.c_timeline_range_fill,
    borderTop: `1px solid ${theme.vars.palette.c_timeline_range}`,
    borderLeft: `1px solid ${theme.vars.palette.c_timeline_range}`,
    borderRight: `1px solid ${theme.vars.palette.c_timeline_range}`,
    borderRadius: `${BORDER_RADIUS.sm} ${BORDER_RADIUS.sm} 0 0`,
    pointerEvents: "none",
    // A grip on each edge moves that end of the range.
    "& [data-range-edge]": {
      position: "absolute",
      top: 0,
      bottom: 0,
      width: RANGE_EDGE_HIT_PX,
      cursor: "ew-resize",
      pointerEvents: "auto",
      touchAction: "none"
    },
    "& [data-range-edge]::after": {
      content: '""',
      position: "absolute",
      top: 0,
      bottom: 0,
      left: "50%",
      width: 2,
      marginLeft: -1,
      backgroundColor: theme.vars.palette.c_timeline_range,
      opacity: 0,
      transition: `opacity ${MOTION.fast}`
    },
    "& [data-range-edge]:hover::after": { opacity: 1 }
  });

/** Width of the grab area on each range edge. */
const RANGE_EDGE_HIT_PX = 8;

const canvasStyles = css({
  // The draw pass reads the resolved size and family back through
  // getComputedStyle: canvas 2D cannot parse the CSS variables directly.
  ...TYPOGRAPHY.mono.caption,
  display: "block",
  width: "100%",
  height: "100%",
  // A finger dragged along the ruler scrubs the playhead; without this the
  // browser takes it as a pan and cancels the pointer.
  touchAction: "none"
});

/**
 * Marker overlay.
 *
 * Each marker flag is positioned in CONTENT space (left = timeMs / msPerPx) and
 * the whole overlay is shifted by the scroll offset via a single `translateX`.
 * This means a scroll event only mutates one inline transform on the wrapper —
 * the per-marker DOM (and the React tree below `MarkerOverlay`) is reconciled
 * only when the marker set or zoom actually changes, not on every scroll.
 */
interface MarkerOverlayProps {
  markers: TimelineMarker[];
  msPerPx: number;
  scrollLeftPx: number;
  /** Visible width of the ruler viewport (px) — NOT the scrollable content
   *  width, which can be orders of magnitude larger and would make the
   *  right-side cull effectively never fire. */
  viewportWidthPx: number;
  headerWidthPx: number;
  onSeek: (timeMs: number) => void;
  onRemove: (id: string) => void;
}

const MarkerOverlayInner: React.FC<MarkerOverlayProps> = ({
  markers,
  msPerPx,
  scrollLeftPx,
  viewportWidthPx,
  headerWidthPx,
  onSeek,
  onRemove
}) => {
  const theme = useTheme();
  const { t } = useTranslation();
  // Was serialized once per visible marker, on every scroll frame.
  const flagCss = useMemo(() => markerFlagStyles(theme), [theme]);
  return (
    <div
      css={markerLayerStyles}
      style={{
        left: headerWidthPx,
        transform: `translateX(${-scrollLeftPx}px)`
      }}
    >
      {markers.map((m) => {
        const contentPx = m.timeMs / msPerPx;
        // Cull markers outside the visible window (with a small overscan),
        // in content space: [scrollLeftPx - 200, scrollLeftPx + viewport + 200].
        if (
          contentPx < scrollLeftPx - 200 ||
          contentPx > scrollLeftPx + viewportWidthPx + 200
        ) {
          return null;
        }
        return (
          <div
            key={m.id}
            css={flagCss}
            style={{ left: contentPx, backgroundColor: m.color || undefined }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <Tooltip title={t("i18n-next73.ruler.markerSeekHint", { label: m.label || t("i18n-next73.ruler.marker") })} describeChild>
              <button
                type="button"
                className="marker-seek"
                data-testid="timeline-marker"
                aria-label={t("i18n-next73.ruler.markerAt", { label: m.label || t("i18n-next73.ruler.marker"), time: formatTimecode(m.timeMs, 500) })}
                onClick={(e) => {
                  e.stopPropagation();
                  onSeek(m.timeMs);
                }}
              >
                {m.label || t("i18n-next73.ruler.marker")}
              </button>
            </Tooltip>
            <button
              type="button"
              className="marker-delete"
              data-testid="marker-delete"
              aria-label={t("i18n-next73.ruler.deleteMarker", { label: m.label || "" }).trim()}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                onRemove(m.id);
              }}
            >
              ×
            </button>
          </div>
        );
      })}
    </div>
  );
};

const MarkerOverlay = memo(MarkerOverlayInner);
MarkerOverlay.displayName = "MarkerOverlay";

/** Returns the best major/minor tick interval (in ms) given the zoom level. */
function computeTickIntervals(msPerPx: number) {
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

/**
 * Formats ms into M:SS (e.g. 0:05, 1:30). Once the tick interval is
 * sub-second the label has to say more or every tick reads the same
 * ("0:02  0:02  0:02"): with an `fps` it gains a frame field (M:SS:FF, the
 * non-drop-frame timecode editors count in), without one it gains decimals.
 */
export function formatTimecode(
  ms: number,
  majorMs = 1000,
  fps?: number
): string {
  const totalSec = ms / 1000;
  const min = Math.floor(totalSec / 60);
  const sec = totalSec - min * 60;
  if (majorMs >= 1000) {
    return `${min}:${sec < 10 ? "0" : ""}${sec.toFixed(0)}`;
  }
  if (fps !== undefined && fps > 0) {
    const fpsInt = Math.max(1, Math.round(fps));
    const totalFrames = Math.round((ms / 1000) * fps);
    const frame = totalFrames % fpsInt;
    // Minutes come from the frame count at the nominal rate, like seconds
    // and frames: at 29.97 the wall-clock minute runs ahead of the timecode.
    const totalTcSec = Math.floor(totalFrames / fpsInt);
    const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
    return `${Math.floor(totalTcSec / 60)}:${pad(totalTcSec % 60)}:${pad(frame)}`;
  }
  const decimals = majorMs >= 500 ? 1 : 2;
  const secText = sec.toFixed(decimals);
  return `${min}:${sec < 10 ? "0" : ""}${secText}`;
}

interface TimeRulerProps {
  /** Total width of the scrollable canvas in pixels. */
  totalWidthPx: number;
  /** Header width (left panel) to offset the ruler content. */
  headerWidthPx?: number;
}

export const TimeRuler: React.FC<TimeRulerProps> = memo(
  ({ totalWidthPx, headerWidthPx = 0 }) => {
    const theme = useTheme();
    const { t } = useTranslation();
    // `scrollLeftPx` re-renders this on every scroll frame.
    const rootCss = useMemo(() => rulerStyles(theme), [theme]);
    const { mode, systemMode } = useColorScheme();
    const activeMode = mode === "system" ? systemMode : mode;
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const ownsGestureRef = useRef(false);
    // Shift+drag picks a range across all tracks (CE4, D48).
    const rangeAnchorMsRef = useRef<number | null>(null);
    const [rangeMenu, setRangeMenu] = useState<{ x: number; y: number } | null>(null);
    const reportRangeError = useAlertNotifier("error");

    const msPerPx = useTimelineUIStore((s) => s.msPerPx);
    const scrollLeftPx = useTimelineUIStore((s) => s.scrollLeftPx);
    const rulerMode = useTimelineUIStore((s) => s.rulerMode);
    const tempo = useTimelineStore((s) => resolveTempo(s));
    const seek = useTimelinePlaybackStore((s) => s.seek);
    const markers = useTimelineStore((s) => s.markers);
    const deleteMarker = useTimelineStore((s) => s.deleteMarker);
    const fps = useTimelineStore((s) => s.fps);
    const rangeInMs = useTimelinePlaybackStore((s) => s.rangeInMs);
    const rangeOutMs = useTimelinePlaybackStore((s) => s.rangeOutMs);

    // Resize → redraw.
    // The canvas backing store is sized from offsetWidth/offsetHeight inside
    // the draw effect; bump a tick on container resize so the effect reruns
    // and the ruler redraws at the new size. Also track the canvas's visible
    // width for the marker overlay's cull predicate (viewport, not content,
    // width).

    const [resizeTick, setResizeTick] = useState(0);
    const [viewportWidthPx, setViewportWidthPx] = useState(0);
    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) {
        return;
      }
      const ro = new ResizeObserver(() => {
        setResizeTick((t) => t + 1);
        setViewportWidthPx(canvas.offsetWidth);
      });
      ro.observe(canvas);
      return () => ro.disconnect();
    }, []);

    // Draw.
    // The draw inputs (scrollLeftPx especially) change on every scroll event,
    // so we coalesce redraws into a single requestAnimationFrame: the effect
    // schedules a draw and dedupes (if one is already pending we don't queue
    // another), then performs the actual canvas work in the frame callback.

    // Keep the latest draw inputs in a ref so the scheduled frame always reads
    // current values without re-creating the draw function.
    const drawInputsRef = useRef({
      msPerPx,
      scrollLeftPx,
      theme,
      activeMode,
      markers,
      fps,
      rangeInMs,
      rangeOutMs,
      rulerMode,
      tempo
    });
    drawInputsRef.current = {
      msPerPx,
      scrollLeftPx,
      theme,
      activeMode,
      markers,
      fps,
      rangeInMs,
      rangeOutMs,
      rulerMode,
      tempo
    };

    const rafIdRef = useRef<number | null>(null);

    const draw = useCallback(() => {
      const canvas = canvasRef.current;
      if (!canvas) {
        return;
      }

      const {
        msPerPx: mpp,
        scrollLeftPx: scrollLeft,
        theme: th,
        activeMode: mode,
        markers: marks,
        fps: frameRate,
        rangeInMs: rangeIn,
        rangeOutMs: rangeOut,
        tempo: docTempo
      } = drawInputsRef.current;
      const barsMode = drawInputsRef.current.rulerMode === "bars";

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

      const colors = pickRulerColors(th, mode === "light" ? "light" : "dark");
      ctx.fillStyle = colors.bg;
      ctx.fillRect(0, 0, w, h);

      const textColor = colors.text;
      const tickColor = colors.tick;

      const { majorMs, minorMs } = computeTickIntervals(mpp);

      // In/out range: a translucent band from the in point (or 0) to the out
      // point (or the right edge), with a solid edge line at each set point.
      if (rangeIn !== null || rangeOut !== null) {
        const inPx = rangeIn === null ? 0 : rangeIn / mpp - scrollLeft;
        const outPx = rangeOut === null ? w : rangeOut / mpp - scrollLeft;
        ctx.save();
        ctx.globalAlpha = 0.18;
        ctx.fillStyle = colors.range;
        ctx.fillRect(Math.max(0, inPx), 0, Math.min(w, outPx) - Math.max(0, inPx), h);
        ctx.restore();
        ctx.strokeStyle = colors.range;
        ctx.lineWidth = 1;
        for (const px of [rangeIn === null ? null : inPx, rangeOut === null ? null : outPx]) {
          if (px === null || px < 0 || px > w) continue;
          ctx.beginPath();
          ctx.moveTo(px, 0);
          ctx.lineTo(px, h);
          ctx.stroke();
        }
      }

      // The canvas is already offset by the CSS paddingLeft (headerWidthPx),
      // so its x=0 aligns with the scrollable lanes' left edge. We work in the
      // canvas's own coordinate space here — no further header offset.
      const visibleStartMs = scrollLeft * mpp;
      const visibleEndMs = visibleStartMs + w * mpp;

      // First tick time (floor to minorMs boundary)
      const firstTickMs = Math.floor(visibleStartMs / minorMs) * minorMs;

      const canvasStyle = getComputedStyle(canvas);
      ctx.font = `${canvasStyle.fontSize} ${canvasStyle.fontFamily}`;
      ctx.textBaseline = "top";
      ctx.textAlign = "left";

      const drawTick = (px: number, major: boolean, label?: string) => {
        if (px < 0 || px > w) return;
        ctx.strokeStyle = tickColor;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(px, h);
        ctx.lineTo(px, major ? h / 2 : h * 0.75);
        ctx.stroke();
        if (label === undefined) return;
        ctx.fillStyle = textColor;
        ctx.fillText(label, px + 3, 3);
      };

      if (barsMode) {
        // Bars read the same milliseconds against the tempo: a bar line where
        // the bar starts, the bar number on it, and beat ticks between when
        // the zoom leaves room for them.
        for (const tick of computeBarRulerTicks({
          tempo: docTempo,
          msPerPx: mpp,
          fromMs: visibleStartMs,
          toMs: visibleEndMs
        })) {
          drawTick(tick.timeMs / mpp - scrollLeft, tick.kind === "bar", tick.label);
        }
      } else {
        for (
          let tMs = firstTickMs;
          tMs <= visibleEndMs + minorMs;
          tMs += minorMs
        ) {
          const isMajor = Math.round(tMs) % Math.round(majorMs) === 0;
          drawTick(
            tMs / mpp - scrollLeft,
            isMajor,
            isMajor ? formatTimecode(tMs, majorMs, frameRate) : undefined
          );
        }
      }

      // Scene markers — a full-height guide line on the canvas; the interactive
      // flag (label + delete) is a DOM overlay layered on top (see below).
      for (const m of marks) {
        const px = m.timeMs / mpp - scrollLeft;
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
    }, []);

    const scheduleDraw = useCallback(() => {
      if (rafIdRef.current !== null) {
        return;
      }
      rafIdRef.current = requestAnimationFrame(() => {
        rafIdRef.current = null;
        draw();
      });
    }, [draw]);

    useEffect(() => {
      scheduleDraw();
      return () => {
        if (rafIdRef.current !== null) {
          cancelAnimationFrame(rafIdRef.current);
          rafIdRef.current = null;
        }
      };
    }, [
      msPerPx,
      scrollLeftPx,
      totalWidthPx,
      theme,
      headerWidthPx,
      activeMode,
      markers,
      fps,
      rangeInMs,
      rangeOutMs,
      rulerMode,
      tempo,
      resizeTick,
      scheduleDraw
    ]);

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

    // Bars mode snaps a range edge to the nearest bar line.
    const snapRangeMs = useCallback(
      (ms: number): number => {
        if (rulerMode !== "bars") {
          return ms;
        }
        const bar = barDurationMs(tempo);
        return Math.max(
          0,
          tempo.offsetMs + Math.round((ms - tempo.offsetMs) / bar) * bar
        );
      },
      [rulerMode, tempo]
    );
    const setSectionRange = useTimelineUIStore((s) => s.setSectionRange);
    const sectionRange = useTimelineUIStore((s) => s.sectionRange);
    const rangeBandCss = useMemo(() => rangeBandStyles(theme), [theme]);
    // The fixed end while an edge of the range is dragged.
    const edgeAnchorMsRef = useRef<number | null>(null);

    const handlePointerDown = useCallback(
      (e: React.PointerEvent<HTMLCanvasElement>) => {
        // Right and middle presses must not move the playhead.
        if (e.button !== 0) {
          return;
        }
        e.currentTarget.setPointerCapture(e.pointerId);
        ownsGestureRef.current = true;
        if (e.shiftKey) {
          rangeAnchorMsRef.current = snapRangeMs(pxToMs(e.clientX));
          setSectionRange(null);
          return;
        }
        rangeAnchorMsRef.current = null;
        seek(pxToMs(e.clientX));
      },
      [pxToMs, seek, setSectionRange, snapRangeMs]
    );

    const handlePointerMove = useCallback(
      (e: React.PointerEvent<HTMLCanvasElement>) => {
        // Only scrub a drag that started on the ruler, not a clip dragged
        // across it.
        if (!ownsGestureRef.current || e.buttons !== 1) {
          return;
        }
        const anchor = rangeAnchorMsRef.current;
        if (anchor !== null) {
          const here = snapRangeMs(pxToMs(e.clientX));
          const fromMs = Math.min(anchor, here);
          const toMs = Math.max(anchor, here);
          setSectionRange(toMs > fromMs ? { fromMs, toMs } : null);
          return;
        }
        seek(pxToMs(e.clientX));
      },
      [pxToMs, seek, setSectionRange, snapRangeMs]
    );

    const handlePointerEnd = useCallback(() => {
      ownsGestureRef.current = false;
      rangeAnchorMsRef.current = null;
    }, []);

    const handleEdgePointerDown = useCallback(
      (e: React.PointerEvent<HTMLDivElement>) => {
        const range = useTimelineUIStore.getState().sectionRange;
        if (e.button !== 0 || !range) return;
        e.stopPropagation();
        e.currentTarget.setPointerCapture(e.pointerId);
        edgeAnchorMsRef.current =
          e.currentTarget.dataset.rangeEdge === "start"
            ? range.toMs
            : range.fromMs;
      },
      []
    );

    const handleEdgePointerMove = useCallback(
      (e: React.PointerEvent<HTMLDivElement>) => {
        const anchor = edgeAnchorMsRef.current;
        if (anchor === null || e.buttons !== 1) return;
        e.stopPropagation();
        const here = snapRangeMs(pxToMs(e.clientX));
        // Dragging an edge past the other one flips the range.
        const fromMs = Math.min(anchor, here);
        const toMs = Math.max(anchor, here);
        if (toMs > fromMs) setSectionRange({ fromMs, toMs });
      },
      [pxToMs, setSectionRange, snapRangeMs]
    );

    const handleEdgePointerEnd = useCallback(() => {
      edgeAnchorMsRef.current = null;
    }, []);

    const handleContextMenu = useCallback(
      (e: React.MouseEvent<HTMLCanvasElement>) => {
        // Paste stays reachable while the clipboard holds a section.
        if (
          useTimelineUIStore.getState().sectionRange === null &&
          !hasSectionClipboard()
        ) {
          return;
        }
        e.preventDefault();
        setRangeMenu({ x: e.clientX, y: e.clientY });
      },
      []
    );

    return (
      <div
        css={rootCss}
        style={{ paddingLeft: headerWidthPx }}
        data-testid="time-ruler"
      >
        <canvas
          ref={canvasRef}
          css={canvasStyles}
          style={{ width: "100%", height: "100%" }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerEnd}
          onPointerCancel={handlePointerEnd}
          onLostPointerCapture={handlePointerEnd}
          onContextMenu={handleContextMenu}
          aria-label={
            rulerMode === "bars"
              ? t("i18n-next73.ruler.barsHint")
              : t("i18n-next73.ruler.timeHint")
          }
        />
        {sectionRange && (
          <div
            css={rangeBandCss}
            data-testid="time-ruler-section-range"
            style={{
              left: headerWidthPx + sectionRange.fromMs / msPerPx - scrollLeftPx,
              width: (sectionRange.toMs - sectionRange.fromMs) / msPerPx
            }}
          >
            {(["start", "end"] as const).map((edge) => (
              <div
                key={edge}
                data-range-edge={edge}
                data-testid={`time-ruler-range-${edge}`}
                role="slider"
                aria-label={t(
                  edge === "start"
                    ? "i18n-next73.ruler.rangeStart"
                    : "i18n-next73.ruler.rangeEnd"
                )}
                aria-valuenow={Math.round(
                  edge === "start" ? sectionRange.fromMs : sectionRange.toMs
                )}
                style={
                  edge === "start"
                    ? { left: -RANGE_EDGE_HIT_PX / 2 }
                    : { right: -RANGE_EDGE_HIT_PX / 2 }
                }
                onPointerDown={handleEdgePointerDown}
                onPointerMove={handleEdgePointerMove}
                onPointerUp={handleEdgePointerEnd}
                onPointerCancel={handleEdgePointerEnd}
              />
            ))}
          </div>
        )}
        <MarkerOverlay
          markers={markers}
          msPerPx={msPerPx}
          scrollLeftPx={scrollLeftPx}
          viewportWidthPx={viewportWidthPx}
          headerWidthPx={headerWidthPx}
          onSeek={seek}
          onRemove={deleteMarker}
        />
        {rangeMenu && (
          <SectionRangeMenu
            position={rangeMenu}
            onClose={() => setRangeMenu(null)}
            onError={reportRangeError}
          />
        )}
      </div>
    );
  }
);

TimeRuler.displayName = "TimeRuler";
