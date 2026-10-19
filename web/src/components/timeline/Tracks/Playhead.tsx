/** @jsxImportSource @emotion/react */
/**
 * Playhead
 *
 * Vertical magenta line + timecode pill at the top, spanning all track lanes.
 * - The 16px-wide invisible hit area around the line is draggable — grab
 *   anywhere along the playhead, not just the pill.
 * - The pill at the top is the visible affordance; it sits above the ruler.
 * - Click-and-drag uses a "jump-and-grab" pattern.
 * - Keyboard: ArrowLeft/Right nudge ±1 frame; Shift +/- 10 frames;
 *   Home / End jump to the bounds.
 *
 * Performance: the playhead position is driven imperatively. During playback
 * the live time advances ~60×/s through the playback store's TRANSIENT channel
 * (`subscribeTime`), which bypasses React. We subscribe once and set the DOM
 * `transform` (not `left`, which would invalidate layout every frame) / pill
 * text directly on refs — the component itself never re-renders per frame.
 * `aria-valuenow` and the pill text are additionally throttled to ~10 Hz.
 * Reactive `currentTimeMs` is only read for the initial/resting position
 * (seek/scrub/pause), and zoom/scroll changes reposition via the same
 * imperative path.
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
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";

import {
  useTimelinePlaybackStore,
  useTimelinePlaybackStoreApi
} from "../../../stores/timeline/TimelinePlaybackStore";
import { useTimelineStore } from "../../../stores/timeline/TimelineStore";
import { useTimelineUIStore } from "../../../stores/timeline/TimelineUIStore";
import { formatTimecode } from "../Inspector/InspectorPrimitives.helpers";
import {
  FONT_SIZE_MONO,
  FONT_WEIGHT,
  MOTION,
  TYPOGRAPHY,
  Z_INDEX,
  SPACING,
  getSpacingPx
} from "../../ui_primitives";

const LINE_WIDTH_PX = 1.5;
const HIT_AREA_WIDTH_PX = 16;
const PILL_HEIGHT_PX = 20;

/**
 * Outer element — it spans the full height and draws the line (`::before`)
 * and the pill, but takes no pointer events itself. The grab zone below,
 * invisibly wider than the line, takes the pointer. Over the ruler it leaves
 * a band free, so the markers there stay clickable: a click on a marker parks
 * the playhead on it, and a full-height hit area would then cover the marker.
 * The ruler scrubs on its own, so the band loses no gesture.
 */
const hitAreaStyles = (theme: Theme, dragging: boolean) =>
  css({
    position: "absolute",
    top: 0,
    bottom: 0,
    // Fixed base position — per-frame placement is done entirely via an
    // imperative `transform: translateX()` (see applyTimeMs) so a moving
    // playhead never invalidates layout the way animating `left` would. The
    // half-width centering offset that used to live here as a static
    // transform is folded into that same imperative translateX.
    left: 0,
    width: HIT_AREA_WIDTH_PX,
    pointerEvents: "none",
    zIndex: Z_INDEX.dropdown,
    "&::before": {
      content: '""',
      position: "absolute",
      top: 0,
      bottom: 0,
      left: "50%",
      transform: "translateX(-50%)",
      width: LINE_WIDTH_PX,
      backgroundColor: theme.vars.palette.secondary.main,
      boxShadow: `0 0 10px ${theme.vars.palette.secondary.main}66`,
      pointerEvents: "none"
    },
    "&:focus-visible": {
      outline: `2px solid ${theme.vars.palette.secondary.main}`,
      outlineOffset: 2
    }
  });

const grabZoneStyles = (dragging: boolean) =>
  css({
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    cursor: dragging ? "grabbing" : "ew-resize",
    touchAction: "none",
    pointerEvents: "auto"
  });

const pillStyles = (theme: Theme, dragging: boolean, hovered: boolean) =>
  css({
    position: "absolute",
    top: 4,
    left: "50%",
    transform: "translateX(-50%)",
    height: PILL_HEIGHT_PX,
    padding: `0 ${getSpacingPx(SPACING.md)}`,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: PILL_HEIGHT_PX / 2,
    backgroundColor: theme.vars.palette.secondary.main,
    color: theme.vars.palette.secondary.contrastText,
    fontFamily: TYPOGRAPHY.mono.caption.fontFamily,
    fontSize: FONT_SIZE_MONO.caption,
    fontWeight: FONT_WEIGHT.semibold,
    letterSpacing: "0",
    whiteSpace: "nowrap",
    boxShadow:
      dragging || hovered
        ? `0 0 0 3px ${theme.vars.palette.secondary.main}33, 0 4px 12px ${theme.vars.palette.c_scrim}`
        : `0 2px 6px ${theme.vars.palette.c_scrim_soft}`,
    transition: `box-shadow ${MOTION.fast}`,
    pointerEvents: "none"
  });

/**
 * How far the pill moves off-centre so it stays whole inside the lanes'
 * viewport while the line is near an edge (at 0:00 the line sits on the
 * left edge and a centred pill would be cut in half). A line outside the
 * viewport takes its pill with it.
 */
export function pillShiftPx(
  lineLeftPx: number,
  pillWidthPx: number,
  viewportWidthPx: number
): number {
  if (pillWidthPx <= 0 || viewportWidthPx <= 0) return 0;
  if (lineLeftPx < 0 || lineLeftPx > viewportWidthPx) return 0;
  const half = pillWidthPx / 2;
  if (lineLeftPx < half) return half - lineLeftPx;
  if (lineLeftPx > viewportWidthPx - half) return viewportWidthPx - half - lineLeftPx;
  return 0;
}

interface PlayheadProps {
  /** Left offset of the scrollable track area (header width). */
  trackAreaOffsetPx?: number;
  /** Total height the playhead line should span (track area height). */
  heightPx: number;
  /** Content end (last clip end or project duration). Defaults to the store's durationMs. */
  endMs?: number;
  /**
   * Height of the band at the top that does not grab the playhead (the ruler
   * with its markers). The line and pill still draw over it.
   */
  grabTopPx?: number;
}

export const Playhead: React.FC<PlayheadProps> = memo(
  ({ trackAreaOffsetPx = 0, heightPx, endMs, grabTopPx = 0 }) => {
    const theme = useTheme();
    const { t: tt } = useTranslation();

    // Geometry inputs that DO change reactively (zoom/scroll). We keep them in
    // refs so the imperative subscription always reads the latest values
    // without re-subscribing, and reposition the element when they change.
    const msPerPx = useTimelineUIStore((s) => s.msPerPx);
    const scrollLeftPx = useTimelineUIStore((s) => s.scrollLeftPx);

    const setCurrentTimeMs = useTimelinePlaybackStore(
      (s) => s.setCurrentTimeMs
    );
    const fps = useTimelineStore((s) => s.fps);
    const storeDurationMs = useTimelineStore((s) => s.durationMs);
    const durationMs = Math.max(storeDurationMs, endMs ?? 0);

    const playbackStoreApi = useTimelinePlaybackStoreApi();

    const [hovered, setHovered] = useState(false);
    const [dragging, setDragging] = useState(false);

    // Playback never re-renders this (see the header), but zoom and scroll do.
    const hitAreaCss = useMemo(
      () => hitAreaStyles(theme, dragging),
      [theme, dragging]
    );
    const grabZoneCss = useMemo(() => grabZoneStyles(dragging), [dragging]);
    const pillCss = useMemo(
      () => pillStyles(theme, dragging, hovered),
      [theme, dragging, hovered]
    );

    const hitAreaRef = useRef<HTMLDivElement | null>(null);
    const pillRef = useRef<HTMLDivElement | null>(null);

    // Latest geometry, read inside the (stable) imperative subscription.
    const msPerPxRef = useRef(msPerPx);
    const scrollLeftRef = useRef(scrollLeftPx);
    const trackAreaOffsetRef = useRef(trackAreaOffsetPx);
    const fpsRef = useRef(fps);
    msPerPxRef.current = msPerPx;
    scrollLeftRef.current = scrollLeftPx;
    trackAreaOffsetRef.current = trackAreaOffsetPx;
    fpsRef.current = fps;

    // Last-written aria bucket / pill text, so the throttled DOM writes below
    // only fire when the displayed value actually changes.
    const lastAriaBucketRef = useRef<number | null>(null);
    const lastPillTextRef = useRef<string | null>(null);
    // Pill and viewport widths, kept by a ResizeObserver so placing the pill
    // never reads layout during playback.
    const pillWidthRef = useRef(0);
    const viewportWidthRef = useRef(0);
    const lastPillShiftRef = useRef<number | null>(null);

    // Imperatively position the element + pill text from a time in ms.
    // Position updates every call (needed every frame during playback) via
    // `transform` (no layout invalidation, unlike animating `left`).
    // aria-valuenow and the pill text are comparatively expensive DOM writes
    // (attribute mutation / text reflow) that only need to change ~10×/s for
    // a11y/readability, so they're gated behind a "did the rounded value
    // actually change" check.
    const applyTimeMs = useCallback((timeMs: number) => {
      const leftPx =
        trackAreaOffsetRef.current +
        timeMs / msPerPxRef.current -
        scrollLeftRef.current;
      const el = hitAreaRef.current;
      if (el) {
        el.style.transform = `translateX(${leftPx - HIT_AREA_WIDTH_PX / 2}px)`;
        const ariaBucket = Math.round(timeMs / 100);
        if (ariaBucket !== lastAriaBucketRef.current) {
          lastAriaBucketRef.current = ariaBucket;
          el.setAttribute("aria-valuenow", String(Math.round(timeMs)));
        }
      }
      const pill = pillRef.current;
      if (pill) {
        const text = formatTimecode(timeMs, fpsRef.current);
        if (text !== lastPillTextRef.current) {
          lastPillTextRef.current = text;
          pill.textContent = text;
        }
        const shift = Math.round(
          pillShiftPx(leftPx, pillWidthRef.current, viewportWidthRef.current)
        );
        if (shift !== lastPillShiftRef.current) {
          lastPillShiftRef.current = shift;
          pill.style.transform = `translateX(calc(-50% + ${shift}px))`;
        }
      }
    }, []);

    useEffect(() => {
      const pill = pillRef.current;
      const viewport = hitAreaRef.current?.parentElement;
      if (!pill || !viewport || typeof ResizeObserver === "undefined") return;
      const observer = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const width = entry.borderBoxSize?.[0]?.inlineSize ?? entry.contentRect.width;
          if (entry.target === pill) pillWidthRef.current = width;
          else viewportWidthRef.current = width;
        }
        applyTimeMs(playbackStoreApi.getState().getTimeMs());
      });
      observer.observe(pill);
      observer.observe(viewport);
      return () => observer.disconnect();
    }, [applyTimeMs, playbackStoreApi]);

    // Subscribe once to the transient playhead channel. Updates the DOM
    // directly — no React re-render per frame. Also initialise from the live
    // position on mount and reposition when zoom/scroll change.
    useEffect(() => {
      const api = playbackStoreApi;
      applyTimeMs(api.getState().getTimeMs());
      const unsubscribe = api.getState().subscribeTime(applyTimeMs);
      return unsubscribe;
    }, [playbackStoreApi, applyTimeMs]);

    // Reposition imperatively when geometry (zoom/scroll) changes — read the
    // live position so a paused or playing playhead lands correctly.
    useEffect(() => {
      applyTimeMs(playbackStoreApi.getState().getTimeMs());
    }, [msPerPx, scrollLeftPx, trackAreaOffsetPx, fps, applyTimeMs, playbackStoreApi]);

    // Drag baseline: where the pointer started and what the playhead position
    // was at that moment.
    const dragStartXRef = useRef(0);
    const dragStartMsRef = useRef(0);

    const handlePointerDown = useCallback(
      (e: React.PointerEvent<HTMLDivElement>) => {
        // A keyframe diamond under the line wins: the playhead parks on a
        // keyframe whenever one is clicked, and would otherwise cover it.
        // jsdom has no elementsFromPoint.
        const passthrough = (document.elementsFromPoint?.(e.clientX, e.clientY) ?? [])
          .find(
            (el) =>
              el instanceof HTMLElement &&
              el.dataset.playheadPassthrough !== undefined
          );
        if (passthrough) {
          passthrough.dispatchEvent(new PointerEvent("pointerdown", e.nativeEvent));
          return;
        }
        e.preventDefault();
        // Capture on the grab zone: the root takes no pointer events, and the
        // captured events still bubble to the handlers here.
        if (e.target instanceof Element) {
          e.target.setPointerCapture(e.pointerId);
        }
        dragStartXRef.current = e.clientX;
        dragStartMsRef.current = playbackStoreApi.getState().getTimeMs();
        setDragging(true);
      },
      [playbackStoreApi]
    );

    const handlePointerMove = useCallback(
      (e: React.PointerEvent<HTMLDivElement>) => {
        // Only react while this playhead owns the gesture — otherwise a clip
        // dragged across the hit area (buttons === 1) would scrub the playhead.
        if (!dragging) return;
        if (e.buttons !== 1) return;
        const deltaPx = e.clientX - dragStartXRef.current;
        const deltaMs = deltaPx * msPerPxRef.current;
        const cap = durationMs > 0 ? durationMs : Number.MAX_SAFE_INTEGER;
        setCurrentTimeMs(
          Math.max(0, Math.min(cap, dragStartMsRef.current + deltaMs))
        );
      },
      [dragging, durationMs, setCurrentTimeMs]
    );

    const handlePointerUp = useCallback(() => {
      setDragging(false);
    }, []);

    const handleKeyDown = useCallback(
      (e: React.KeyboardEvent<HTMLDivElement>) => {
        const frameMs = 1000 / Math.max(1, fps);
        const cap = durationMs > 0 ? durationMs : Number.MAX_SAFE_INTEGER;
        const currentTimeMs = playbackStoreApi.getState().getTimeMs();
        let next: number | null = null;
        if (e.key === "ArrowLeft") {
          next = currentTimeMs - frameMs * (e.shiftKey ? 10 : 1);
        } else if (e.key === "ArrowRight") {
          next = currentTimeMs + frameMs * (e.shiftKey ? 10 : 1);
        } else if (e.key === "Home") {
          next = 0;
        } else if (e.key === "End") {
          const endTargetMs = durationMs > 0 ? durationMs : currentTimeMs;
          next = endTargetMs;
        }
        if (next != null) {
          e.preventDefault();
          setCurrentTimeMs(Math.max(0, Math.min(cap, next)));
        }
      },
      [durationMs, fps, setCurrentTimeMs, playbackStoreApi]
    );

    return (
      <div
        ref={hitAreaRef}
        css={hitAreaCss}
        style={{ height: heightPx }}
        data-testid="playhead"
        role="slider"
        tabIndex={0}
        aria-label={tt("i18n-next73.playhead.label")}
        aria-valuemin={0}
        aria-valuemax={Math.round(durationMs)}
        onPointerEnter={() => setHovered(true)}
        onPointerLeave={() => setHovered(false)}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onKeyDown={handleKeyDown}
      >
        <div
          css={grabZoneCss}
          style={{ top: grabTopPx }}
          data-testid="playhead-grab"
        />
        <div
          ref={pillRef}
          css={pillCss}
          aria-hidden
          data-testid="playhead-pill"
        />
      </div>
    );
  }
);

Playhead.displayName = "Playhead";
