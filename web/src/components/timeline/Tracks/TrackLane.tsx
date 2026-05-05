/** @jsxImportSource @emotion/react */
/**
 * TrackLane
 *
 * Horizontal strip for a single track. Renders all clips belonging to the
 * track as absolute-positioned children:
 *   left  = clip.startMs / msPerPx
 *   width = clip.durationMs / msPerPx
 *
 * Supports:
 *   - Click on empty space → clear selection
 *   - Rubber-band selection (pointer drag on empty space)
 *   - Drop target for clips dragged from other tracks
 */

import React, { memo, useCallback, useRef } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";

import type { TimelineTrack } from "@nodetool-ai/timeline";
import { useTimelineStore } from "../../../stores/timeline/TimelineStore";
import { useTimelineUIStore } from "../../../stores/timeline/TimelineUIStore";
import { Clip } from "./Clip";

// ── Constants ──────────────────────────────────────────────────────────────

const DEFAULT_TRACK_HEIGHT_PX = 64;

// ── Styles ─────────────────────────────────────────────────────────────────

const laneStyles = (
  theme: Theme,
  heightPx: number,
  visible: boolean,
  isRubberBanding: boolean
) =>
  css({
    position: "relative",
    width: "100%",
    height: heightPx,
    flexShrink: 0,
    backgroundColor: visible
      ? theme.vars.palette.background.default
      : theme.vars.palette.action.disabledBackground,
    borderBottom: `1px solid ${theme.vars.palette.divider}`,
    overflow: "hidden",
    cursor: isRubberBanding ? "crosshair" : "default",
    // Subtle alternating stripe
    "&:nth-of-type(even)": {
      backgroundColor: visible
        ? theme.vars.palette.background.paper
        : theme.vars.palette.action.disabledBackground
    }
  });

const rubberBandStyles = (theme: Theme) =>
  css({
    position: "absolute",
    border: `1px solid ${theme.vars.palette.primary.main}`,
    backgroundColor: `${theme.vars.palette.primary.main}22`,
    pointerEvents: "none",
    zIndex: 20
  });

// ── Rubber-band selection helper ───────────────────────────────────────────

interface RubberBandRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

// ── Component ──────────────────────────────────────────────────────────────

export interface TrackLaneProps {
  track: TimelineTrack;
}

export const TrackLane: React.FC<TrackLaneProps> = memo(({ track }) => {
  const theme = useTheme();

  // Get only the clip IDs for this track (stable list of ids)
  const clipIds = useTimelineStore(
    (s) =>
      s.clips
        .filter((c) => c.trackId === track.id)
        .map((c) => c.id),
    // Shallow-compare the resulting string array
    (a, b) => a.length === b.length && a.every((id, i) => id === b[i])
  );

  const msPerPx = useTimelineUIStore((s) => s.msPerPx);
  const clearSelection = useTimelineUIStore((s) => s.clearSelection);
  const setSelection = useTimelineUIStore((s) => s.setSelection);
  const allClips = useTimelineStore((s) =>
    s.clips.filter((c) => c.trackId === track.id)
  );

  const heightPx = track.heightPx ?? DEFAULT_TRACK_HEIGHT_PX;

  // ── Rubber-band state ───────────────────────────────────────────────────

  const isRubberBandingRef = useRef(false);
  const rbStartRef = useRef({ x: 0, y: 0 });
  const [rubberBand, setRubberBand] = React.useState<RubberBandRect | null>(
    null
  );

  const handleLanePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      // Only respond to primary button on the lane itself (not clips)
      if (e.target !== e.currentTarget) {
        return;
      }
      if (e.button !== 0) {
        return;
      }

      if (!e.shiftKey) {
        clearSelection();
      }

      e.currentTarget.setPointerCapture(e.pointerId);
      const rect = e.currentTarget.getBoundingClientRect();
      rbStartRef.current = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
      };
      isRubberBandingRef.current = true;
    },
    [clearSelection]
  );

  const handleLanePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!isRubberBandingRef.current || e.buttons !== 1) {
        return;
      }
      const rect = e.currentTarget.getBoundingClientRect();
      const curX = e.clientX - rect.left;
      const curY = e.clientY - rect.top;

      const left = Math.min(rbStartRef.current.x, curX);
      const top = Math.min(rbStartRef.current.y, curY);
      const width = Math.abs(curX - rbStartRef.current.x);
      const height = Math.abs(curY - rbStartRef.current.y);

      setRubberBand({ left, top, width, height });

      // Compute which clips overlap the rubber-band
      const rbStartMs = (left + e.currentTarget.scrollLeft) * msPerPx;
      const rbEndMs = rbStartMs + width * msPerPx;

      const selected = allClips
        .filter((c) => {
          const clipStart = c.startMs;
          const clipEnd = c.startMs + c.durationMs;
          return clipEnd > rbStartMs && clipStart < rbEndMs;
        })
        .map((c) => c.id);

      setSelection(selected);
    },
    [msPerPx, allClips, setSelection]
  );

  const handleLanePointerUp = useCallback(() => {
    isRubberBandingRef.current = false;
    setRubberBand(null);
  }, []);

  return (
    <div
      css={laneStyles(theme, heightPx, track.visible, isRubberBandingRef.current)}
      data-testid={`track-lane-${track.id}`}
      onPointerDown={handleLanePointerDown}
      onPointerMove={handleLanePointerMove}
      onPointerUp={handleLanePointerUp}
      role="listbox"
      aria-label={`Track: ${track.name}`}
      aria-multiselectable="true"
    >
      {clipIds.map((id) => (
        <Clip key={id} clipId={id} />
      ))}

      {/* Rubber-band selection rect */}
      {rubberBand && (
        <div
          css={rubberBandStyles(theme)}
          style={{
            left: rubberBand.left,
            top: rubberBand.top,
            width: rubberBand.width,
            height: rubberBand.height
          }}
          aria-hidden="true"
        />
      )}
    </div>
  );
});

TrackLane.displayName = "TrackLane";
