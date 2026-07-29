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

import React, { memo, useCallback, useEffect, useRef, useState } from "react";
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
import { MOTION, Z_INDEX, SPACING, getSpacingPx } from "../../ui_primitives";

const LINE_WIDTH_PX = 1.5;
const HIT_AREA_WIDTH_PX = 16;
const PILL_HEIGHT_PX = 20;

/**
 * Outer hit area — invisibly wider than the line so the user can grab the
 * playhead anywhere along its full height. The visible line is centred via
 * `::before`. The pill sits as a positioned child on top.
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
    cursor: dragging ? "grabbing" : "ew-resize",
    touchAction: "none",
    pointerEvents: "auto",
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
    fontFamily:
      "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace",
    fontSize: theme.fontSizeSmaller,
    fontWeight: 600,
    letterSpacing: "0",
    whiteSpace: "nowrap",
    boxShadow:
      dragging || hovered
        ? `0 0 0 3px ${theme.vars.palette.secondary.main}33, 0 4px 12px ${theme.vars.palette.c_scrim}`
        : `0 2px 6px ${theme.vars.palette.c_scrim_soft}`,
    transition: `box-shadow ${MOTION.fast}`,
    pointerEvents: "none"
  });

export interface PlayheadProps {
  /** Left offset of the scrollable track area (header width). */
  trackAreaOffsetPx?: number;
  /** Total height the playhead line should span (track area height). */
  heightPx: number;
}

export const Playhead: React.FC<PlayheadProps> = memo(
  ({ trackAreaOffsetPx = 0, heightPx }) => {
    const theme = useTheme();

    // Geometry inputs that DO change reactively (zoom/scroll). We keep them in
    // refs so the imperative subscription always reads the latest values
    // without re-subscribing, and reposition the element when they change.
    const msPerPx = useTimelineUIStore((s) => s.msPerPx);
    const scrollLeftPx = useTimelineUIStore((s) => s.scrollLeftPx);

    const setCurrentTimeMs = useTimelinePlaybackStore(
      (s) => s.setCurrentTimeMs
    );
    const fps = useTimelineStore((s) => s.fps);
    const durationMs = useTimelineStore((s) => s.durationMs);

    const playbackStoreApi = useTimelinePlaybackStoreApi();

    const [hovered, setHovered] = useState(false);
    const [dragging, setDragging] = useState(false);

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
      }
    }, []);

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
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
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
        css={hitAreaStyles(theme, dragging)}
        style={{ height: heightPx }}
        data-testid="playhead"
        role="slider"
        tabIndex={0}
        aria-label="Playhead"
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
          ref={pillRef}
          css={pillStyles(theme, dragging, hovered)}
          aria-hidden
          data-testid="playhead-pill"
        />
      </div>
    );
  }
);

Playhead.displayName = "Playhead";
