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
 */

import React, { memo, useCallback, useRef, useState } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";

import { useTimelinePlaybackStore } from "../../../stores/timeline/TimelinePlaybackStore";
import { useTimelineStore } from "../../../stores/timeline/TimelineStore";
import { useTimelineUIStore } from "../../../stores/timeline/TimelineUIStore";
import { formatTimecode } from "../Inspector/InspectorPrimitives";

// ── Constants ──────────────────────────────────────────────────────────────

const LINE_WIDTH_PX = 1.5;
const HIT_AREA_WIDTH_PX = 16;
const PILL_HEIGHT_PX = 20;

// ── Styles ─────────────────────────────────────────────────────────────────

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
    width: HIT_AREA_WIDTH_PX,
    transform: `translateX(-${HIT_AREA_WIDTH_PX / 2}px)`,
    cursor: dragging ? "grabbing" : "ew-resize",
    touchAction: "none",
    pointerEvents: "auto",
    zIndex: 10,
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
    padding: "0 8px",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: PILL_HEIGHT_PX / 2,
    backgroundColor: theme.vars.palette.secondary.main,
    color: "rgba(8, 9, 10, 0.92)",
    fontFamily:
      "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace",
    fontSize: 10,
    fontWeight: 600,
    letterSpacing: "0",
    whiteSpace: "nowrap",
    boxShadow:
      dragging || hovered
        ? `0 0 0 3px ${theme.vars.palette.secondary.main}33, 0 4px 12px rgba(0,0,0,0.4)`
        : "0 2px 6px rgba(0,0,0,0.35)",
    transition: "box-shadow 120ms",
    pointerEvents: "none"
  });

// ── Helpers ────────────────────────────────────────────────────────────────

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
    // at that moment.
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
        <div
          css={pillStyles(theme, dragging, hovered)}
          aria-hidden
          data-testid="playhead-pill"
        >
          {formatTimecode(currentTimeMs, fps)}
        </div>
      </div>
    );
  }
);

Playhead.displayName = "Playhead";
