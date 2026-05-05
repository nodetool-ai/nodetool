/** @jsxImportSource @emotion/react */
/**
 * Playhead
 *
 * Single absolute-positioned vertical line spanning all track lanes.
 * - A drag handle sits in the ruler area (top of the line).
 * - Subscribes to `currentTimeMs` via a fine-grained selector so only
 *   the playhead re-renders on each frame — not the full track tree.
 * - Drag handle allows scrubbing by dragging left/right.
 */

import React, { memo, useCallback, useRef } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";

import { useTimelinePlaybackStore } from "../../../stores/timeline/TimelinePlaybackStore";
import { useTimelineUIStore } from "../../../stores/timeline/TimelineUIStore";

// ── Constants ──────────────────────────────────────────────────────────────

const HANDLE_SIZE_PX = 12;

// ── Styles ─────────────────────────────────────────────────────────────────

const lineStyles = (theme: Theme) =>
  css({
    position: "absolute",
    top: 0,
    bottom: 0,
    width: 2,
    backgroundColor: theme.vars.palette.primary.main,
    pointerEvents: "none",
    zIndex: 10,
    // The handle is the only interactive part
    "& .playhead-handle": {
      pointerEvents: "all"
    }
  });

const handleStyles = (theme: Theme) =>
  css({
    position: "absolute",
    top: -4,
    left: "50%",
    transform: "translateX(-50%)",
    width: HANDLE_SIZE_PX,
    height: HANDLE_SIZE_PX,
    borderRadius: "50%",
    backgroundColor: theme.vars.palette.primary.main,
    cursor: "ew-resize",
    touchAction: "none",
    "&:focus-visible": {
      outline: `2px solid ${theme.vars.palette.primary.main}`,
      outlineOffset: 2
    }
  });

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

    // Fine-grained selector — only re-render when position changes
    const currentTimeMs = useTimelinePlaybackStore((s) => s.currentTimeMs);
    const msPerPx = useTimelineUIStore((s) => s.msPerPx);
    const scrollLeftPx = useTimelineUIStore((s) => s.scrollLeftPx);
    const setCurrentTimeMs = useTimelinePlaybackStore(
      (s) => s.setCurrentTimeMs
    );

    const leftPx =
      trackAreaOffsetPx + currentTimeMs / msPerPx - scrollLeftPx;

    // ── Drag scrub ──────────────────────────────────────────────────────────

    const dragStartXRef = useRef(0);
    const dragStartMsRef = useRef(0);

    const handlePointerDown = useCallback(
      (e: React.PointerEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        dragStartXRef.current = e.clientX;
        dragStartMsRef.current = currentTimeMs;
      },
      [currentTimeMs]
    );

    const handlePointerMove = useCallback(
      (e: React.PointerEvent<HTMLDivElement>) => {
        if (e.buttons !== 1) {
          return;
        }
        const deltaPx = e.clientX - dragStartXRef.current;
        const deltaMs = deltaPx * msPerPx;
        setCurrentTimeMs(Math.max(0, dragStartMsRef.current + deltaMs));
      },
      [msPerPx, setCurrentTimeMs]
    );

    return (
      <div
        css={lineStyles(theme)}
        style={{ left: leftPx, height: heightPx }}
        data-testid="playhead"
        aria-hidden="true"
      >
        {/* Drag handle — interactive */}
        <div
          className="playhead-handle"
          css={handleStyles(theme)}
          tabIndex={0}
          role="slider"
          aria-label="Playhead"
          aria-valuenow={Math.round(currentTimeMs)}
          aria-valuemin={0}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
        />
      </div>
    );
  }
);

Playhead.displayName = "Playhead";
