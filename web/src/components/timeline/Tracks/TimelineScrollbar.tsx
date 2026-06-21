/** @jsxImportSource @emotion/react */
/**
 * TimelineScrollbar
 *
 * An always-visible horizontal scrollbar for the tracks area, CapCut-style:
 * a slim trough spanning the lanes with a draggable thumb whose size reflects
 * the visible fraction of the timeline. macOS overlay scrollbars hide
 * themselves, so this gives a persistent, mouse-friendly way to pan sideways.
 *
 * The DOM scroll position is the source of truth: dragging the thumb (or
 * clicking the trough) calls `onScrollTo`, which sets the lanes' scrollLeft;
 * that fires the lanes' onScroll, which updates `scrollLeftPx` and re-renders
 * the thumb. The thumb just visualizes and drives that one value.
 */

import React, { memo, useCallback, useRef } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { BORDER_RADIUS, MOTION } from "../../ui_primitives";

export const TIMELINE_SCROLLBAR_HEIGHT_PX = 14;
const MIN_THUMB_PX = 28;
const TROUGH_HEIGHT_PX = 8;

export interface ScrollThumb {
  /** Width of the thumb in px. */
  thumbWidth: number;
  /** Left offset of the thumb within the trough, in px. */
  thumbLeft: number;
  /** Max scrollLeft (content − viewport), clamped to ≥ 0. */
  maxScroll: number;
  /** Distance the thumb can travel (trackWidth − thumbWidth). */
  thumbTravel: number;
  /** Whether there is anything to scroll. */
  scrollable: boolean;
}

/**
 * Pure geometry for the scrollbar thumb. `trackWidth` is the trough's pixel
 * width (equal to the viewport width by construction).
 */
export function computeScrollThumb(
  contentWidthPx: number,
  viewportWidthPx: number,
  scrollLeftPx: number,
  trackWidth: number
): ScrollThumb {
  const maxScroll = Math.max(0, contentWidthPx - viewportWidthPx);
  const scrollable = maxScroll > 0 && viewportWidthPx > 0 && trackWidth > 0;
  if (!scrollable) {
    return {
      thumbWidth: Math.max(0, trackWidth),
      thumbLeft: 0,
      maxScroll: 0,
      thumbTravel: 0,
      scrollable: false
    };
  }
  const ratio = Math.min(1, viewportWidthPx / contentWidthPx);
  const thumbWidth = Math.max(MIN_THUMB_PX, Math.round(trackWidth * ratio));
  const thumbTravel = Math.max(0, trackWidth - thumbWidth);
  const clampedScroll = Math.min(maxScroll, Math.max(0, scrollLeftPx));
  const thumbLeft =
    thumbTravel > 0 ? (clampedScroll / maxScroll) * thumbTravel : 0;
  return { thumbWidth, thumbLeft, maxScroll, thumbTravel, scrollable };
}

const containerStyles = (theme: Theme) =>
  css({
    height: TIMELINE_SCROLLBAR_HEIGHT_PX,
    flexShrink: 0,
    display: "flex",
    alignItems: "center",
    borderTop: `1px solid ${theme.vars.palette.divider}`,
    backgroundColor: theme.vars.palette.background.paper,
    userSelect: "none"
  });

const troughStyles = css({
  position: "relative",
  flex: "1 1 auto",
  height: TROUGH_HEIGHT_PX,
  marginRight: 6,
  minWidth: 0
});

const thumbStyles = (theme: Theme, scrollable: boolean) =>
  css({
    position: "absolute",
    top: 0,
    height: TROUGH_HEIGHT_PX,
    borderRadius: BORDER_RADIUS.sm,
    backgroundColor: theme.vars.palette.action.disabled,
    cursor: scrollable ? "grab" : "default",
    transition: `background-color ${MOTION.fast}`,
    "&:hover": scrollable
      ? { backgroundColor: theme.vars.palette.text.secondary }
      : undefined,
    "&:active": scrollable
      ? { cursor: "grabbing", backgroundColor: theme.vars.palette.text.primary }
      : undefined
  });

export interface TimelineScrollbarProps {
  /** Total scrollable content width at the current zoom (px). */
  contentWidthPx: number;
  /** Visible viewport width of the lanes area (px). */
  viewportWidthPx: number;
  /** Current horizontal scroll offset (px). */
  scrollLeftPx: number;
  /** Left inset so the bar lines up with the lanes (track-header width). */
  leftInsetPx: number;
  /** Scroll the lanes to an absolute offset; the caller clamps via the DOM. */
  onScrollTo: (px: number) => void;
}

export const TimelineScrollbar: React.FC<TimelineScrollbarProps> = memo(
  ({ contentWidthPx, viewportWidthPx, scrollLeftPx, leftInsetPx, onScrollTo }) => {
    const theme = useTheme();
    const troughRef = useRef<HTMLDivElement>(null);
    const dragRef = useRef<{ startX: number; startScroll: number } | null>(null);

    const { thumbWidth, thumbLeft, maxScroll, thumbTravel, scrollable } =
      computeScrollThumb(
        contentWidthPx,
        viewportWidthPx,
        scrollLeftPx,
        viewportWidthPx
      );

    const handleThumbPointerDown = useCallback(
      (e: React.PointerEvent<HTMLDivElement>) => {
        if (!scrollable) return;
        e.preventDefault();
        e.stopPropagation();
        e.currentTarget.setPointerCapture(e.pointerId);
        dragRef.current = { startX: e.clientX, startScroll: scrollLeftPx };
      },
      [scrollable, scrollLeftPx]
    );

    const handleThumbPointerMove = useCallback(
      (e: React.PointerEvent<HTMLDivElement>) => {
        const drag = dragRef.current;
        if (!drag || thumbTravel <= 0) return;
        const deltaPx = e.clientX - drag.startX;
        const next = drag.startScroll + (deltaPx / thumbTravel) * maxScroll;
        onScrollTo(Math.min(maxScroll, Math.max(0, next)));
      },
      [thumbTravel, maxScroll, onScrollTo]
    );

    const handleThumbPointerUp = useCallback(
      (e: React.PointerEvent<HTMLDivElement>) => {
        dragRef.current = null;
        e.currentTarget.releasePointerCapture?.(e.pointerId);
      },
      []
    );

    // Click on the trough → jump so the thumb centers on the pointer.
    const handleTroughPointerDown = useCallback(
      (e: React.PointerEvent<HTMLDivElement>) => {
        if (!scrollable || !troughRef.current || thumbTravel <= 0) return;
        const rect = troughRef.current.getBoundingClientRect();
        const targetLeft = e.clientX - rect.left - thumbWidth / 2;
        const next = (targetLeft / thumbTravel) * maxScroll;
        onScrollTo(Math.min(maxScroll, Math.max(0, next)));
      },
      [scrollable, thumbWidth, thumbTravel, maxScroll, onScrollTo]
    );

    return (
      <div
        css={containerStyles(theme)}
        style={{ paddingLeft: leftInsetPx }}
        data-testid="timeline-scrollbar"
      >
        <div
          ref={troughRef}
          css={troughStyles}
          onPointerDown={handleTroughPointerDown}
        >
          <div
            css={thumbStyles(theme, scrollable)}
            style={{ width: thumbWidth, left: thumbLeft }}
            onPointerDown={handleThumbPointerDown}
            onPointerMove={handleThumbPointerMove}
            onPointerUp={handleThumbPointerUp}
            onPointerCancel={handleThumbPointerUp}
            role="scrollbar"
            aria-orientation="horizontal"
            aria-label="Scroll timeline horizontally"
            aria-valuemin={0}
            aria-valuemax={Math.round(maxScroll)}
            aria-valuenow={Math.round(Math.min(maxScroll, Math.max(0, scrollLeftPx)))}
            data-testid="timeline-scrollbar-thumb"
          />
        </div>
      </div>
    );
  }
);

TimelineScrollbar.displayName = "TimelineScrollbar";
