/** @jsxImportSource @emotion/react */
/**
 * Playhead
 *
 * Single absolute-positioned vertical line spanning all track lanes.
 * - The line + a 16px-wide invisible hit area around it are draggable —
 *   grab anywhere along the playhead, not just the small handle.
 * - The handle is a visible affordance at the top; it expands on hover
 *   and active drag.
 * - Click-and-drag uses a "jump-and-grab" pattern: pointerdown anywhere
 *   on the hit area starts the scrub from the current position; the
 *   pointer's delta drives currentTime from there.
 * - Keyboard: ArrowLeft/Right nudge ±1 frame; Shift +/- 10 frames;
 *   Home / End jump to the bounds.
 */

import React, { memo, useCallback, useRef, useState } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";

import { useTimelinePlaybackStore } from "../../../stores/timeline/TimelinePlaybackStore";
import { useTimelineStore } from "../../../stores/timeline/TimelineStore";
import { useTimelineUIStore } from "../../../stores/timeline/TimelineUIStore";

// ── Constants ──────────────────────────────────────────────────────────────

const LINE_WIDTH_PX = 2;
const HIT_AREA_WIDTH_PX = 16;
const HANDLE_SIZE_PX = 14;
const HANDLE_HOVER_SIZE_PX = 18;

// ── Styles ─────────────────────────────────────────────────────────────────

/**
 * Outer hit area — invisibly wider than the line so the user can grab the
 * playhead anywhere along its full height. The visible 2px line is centred
 * inside via `::before`. The handle sits as a positioned child on top.
 */
const hitAreaStyles = (theme: Theme, dragging: boolean) =>
  css({
    position: "absolute",
    top: 0,
    bottom: 0,
    width: HIT_AREA_WIDTH_PX,
    transform: `translateX(-${HIT_AREA_WIDTH_PX / 2}px)`,
    cursor: dragging ? "grabbing" : "ew-resize",
    touchAction: "none",
    zIndex: 10,
    "&::before": {
      content: '""',
      position: "absolute",
      top: 0,
      bottom: 0,
      left: "50%",
      transform: "translateX(-50%)",
      width: LINE_WIDTH_PX,
      backgroundColor: theme.vars.palette.primary.main,
      pointerEvents: "none"
    },
    "&:focus-visible": {
      outline: `2px solid ${theme.vars.palette.primary.main}`,
      outlineOffset: 2
    }
  });

const handleStyles = (theme: Theme, hovered: boolean, dragging: boolean) => {
  const size =
    hovered || dragging ? HANDLE_HOVER_SIZE_PX : HANDLE_SIZE_PX;
  return css({
    position: "absolute",
    top: -size / 2 + 2,
    left: "50%",
    transform: "translateX(-50%)",
    width: size,
    height: size,
    borderRadius: "50%",
    backgroundColor: theme.vars.palette.primary.main,
    boxShadow: dragging
      ? `0 0 0 4px ${theme.vars.palette.primary.main}40`
      : hovered
        ? `0 0 0 3px ${theme.vars.palette.primary.main}30`
        : "none",
    transition: "width 80ms, height 80ms, box-shadow 80ms",
    pointerEvents: "none"
  });
};

// ── Component ──────────────────────────────────────────────────────────────

export interface PlayheadProps {
  /** Left offset of the scrollable track area (header width). */
  trackAreaOffsetPx?: number;
  /** Total height the playhead line should span (track area height). */
  heightPx: number;
}

export const Playhead: React.FC<PlayheadProps> = memo(
  ({ trackAreaOffsetPx = 0, heightPx }) => {
    const theme = useTheme();

    const currentTimeMs = useTimelinePlaybackStore((s) => s.currentTimeMs);
    const msPerPx = useTimelineUIStore((s) => s.msPerPx);
    const scrollLeftPx = useTimelineUIStore((s) => s.scrollLeftPx);
    const setCurrentTimeMs = useTimelinePlaybackStore(
      (s) => s.setCurrentTimeMs
    );
    const fps = useTimelineStore((s) => s.fps);
    const durationMs = useTimelineStore((s) => s.durationMs);

    const [hovered, setHovered] = useState(false);
    const [dragging, setDragging] = useState(false);

    const leftPx =
      trackAreaOffsetPx + currentTimeMs / msPerPx - scrollLeftPx;

    // Drag baseline: where the pointer started and what currentTimeMs was
    // at that moment. Delta is applied to that snapshot — so the pointer
    // tracks the playhead exactly even if the store is being written
    // concurrently elsewhere.
    const dragStartXRef = useRef(0);
    const dragStartMsRef = useRef(0);

    const handlePointerDown = useCallback(
      (e: React.PointerEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        dragStartXRef.current = e.clientX;
        dragStartMsRef.current = currentTimeMs;
        setDragging(true);
      },
      [currentTimeMs]
    );

    const handlePointerMove = useCallback(
      (e: React.PointerEvent<HTMLDivElement>) => {
        if (e.buttons !== 1) return;
        const deltaPx = e.clientX - dragStartXRef.current;
        const deltaMs = deltaPx * msPerPx;
        const cap = durationMs > 0 ? durationMs : Number.MAX_SAFE_INTEGER;
        setCurrentTimeMs(
          Math.max(0, Math.min(cap, dragStartMsRef.current + deltaMs))
        );
      },
      [msPerPx, durationMs, setCurrentTimeMs]
    );

    const handlePointerUp = useCallback(() => {
      setDragging(false);
    }, []);

    const handleKeyDown = useCallback(
      (e: React.KeyboardEvent<HTMLDivElement>) => {
        const frameMs = 1000 / Math.max(1, fps);
        const cap = durationMs > 0 ? durationMs : Number.MAX_SAFE_INTEGER;
        let next: number | null = null;
        if (e.key === "ArrowLeft") {
          next = currentTimeMs - frameMs * (e.shiftKey ? 10 : 1);
        } else if (e.key === "ArrowRight") {
          next = currentTimeMs + frameMs * (e.shiftKey ? 10 : 1);
        } else if (e.key === "Home") {
          next = 0;
        } else if (e.key === "End") {
          next = cap;
        }
        if (next != null) {
          e.preventDefault();
          setCurrentTimeMs(Math.max(0, Math.min(cap, next)));
        }
      },
      [currentTimeMs, durationMs, fps, setCurrentTimeMs]
    );

    return (
      <div
        css={hitAreaStyles(theme, dragging)}
        style={{ left: leftPx, height: heightPx }}
        data-testid="playhead"
        role="slider"
        tabIndex={0}
        aria-label="Playhead"
        aria-valuenow={Math.round(currentTimeMs)}
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
        <div css={handleStyles(theme, hovered, dragging)} aria-hidden />
      </div>
    );
  }
);

Playhead.displayName = "Playhead";
