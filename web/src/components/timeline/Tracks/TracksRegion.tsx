/** @jsxImportSource @emotion/react */
/**
 * TracksRegion
 *
 * Composes the full multi-track surface:
 *   ┌──────────────────────────────────────────────────────┐
 *   │ [TimeRuler]  ← spans header + scrollable area        │
 *   │─────────────────────────────────────────────────────  │
 *   │ [TrackHeader] │  [TrackLane]  ← one row per track    │
 *   │ [TrackHeader] │  [TrackLane]                         │
 *   │ ...           │  ...                                 │
 *   │                                                      │
 *   │ [Playhead]   ← absolute-positioned over all lanes    │
 *   └──────────────────────────────────────────────────────┘
 *
 * Also renders global keyboard shortcuts for clip operations:
 *   Delete/Backspace → deleteSelected
 *   Ctrl+D           → duplicateSelected
 *   Ctrl+Shift+D     → duplicate + shift by clip duration
 *   Ctrl+S           → splitSelectedAtPlayhead
 *   Ctrl+Z / Ctrl+Y  → undo / redo
 *
 * Zoom: scroll wheel on the lane area changes msPerPx.
 * Horizontal scroll: native overflow-x scroll on the scrollable panel.
 */

import React, { memo, useCallback, useRef } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";

import { useTimelineStore, getTimelineTemporal } from "../../../stores/timeline/TimelineStore";
import { useTimelineUIStore } from "../../../stores/timeline/TimelineUIStore";
import { useTimelinePlaybackStore } from "../../../stores/timeline/TimelinePlaybackStore";
import { TRACK_HEADER_WIDTH_PX } from "./TrackHeader";
import { TrackHeader } from "./TrackHeader";
import { TrackLane } from "./TrackLane";
import { TimeRuler } from "./TimeRuler";
import { Playhead } from "./Playhead";
import { FlexColumn, FlexRow } from "../../ui_primitives";

// ── Constants ──────────────────────────────────────────────────────────────

const DEFAULT_TRACK_HEIGHT_PX = 64;
const ZOOM_SENSITIVITY = 0.001;
/** Offset applied to duplicated clips when using Ctrl+Shift+D (ms). */
const DUPLICATE_OFFSET_MS = 1000;

// ── Styles ─────────────────────────────────────────────────────────────────

const containerStyles = (theme: Theme) =>
  css({
    position: "relative",
    width: "100%",
    height: "100%",
    overflow: "hidden",
    backgroundColor: theme.vars.palette.background.default,
    outline: "none"
  });

const headerColumnStyles = css({
  flexShrink: 0,
  overflowY: "hidden",
  overflowX: "hidden"
});

const scrollableAreaStyles = css({
  flex: "1 1 auto",
  overflowX: "auto",
  overflowY: "hidden",
  position: "relative"
});

const lanesContainerStyles = css({
  position: "relative",
  // Will be set dynamically via style.width
});

// ── Component ──────────────────────────────────────────────────────────────

export interface TracksRegionProps {
  /** Height of the tracks area in pixels. */
  heightPx: number;
}

export const TracksRegion: React.FC<TracksRegionProps> = memo(
  ({ heightPx }) => {
    const theme = useTheme();

    const tracks = useTimelineStore((s) => s.tracks);
    const durationMs = useTimelineStore((s) => s.durationMs);

    const msPerPx = useTimelineUIStore((s) => s.msPerPx);
    const scrollLeftPx = useTimelineUIStore((s) => s.scrollLeftPx);
    const setScrollLeftPx = useTimelineUIStore((s) => s.setScrollLeftPx);
    const setZoom = useTimelineUIStore((s) => s.setZoom);

    const selectedClipIds = useTimelineUIStore((s) => s.selectedClipIds);
    const deleteSelected = useTimelineStore((s) => s.deleteSelected);
    const duplicateSelected = useTimelineStore((s) => s.duplicateSelected);
    const splitSelectedAtPlayhead = useTimelineStore(
      (s) => s.splitSelectedAtPlayhead
    );
    const currentTimeMs = useTimelinePlaybackStore((s) => s.currentTimeMs);

    const scrollableRef = useRef<HTMLDivElement>(null);

    // Total scrollable width = max of durationMs or visible area
    const totalWidthPx = Math.max(
      durationMs / msPerPx + 200,
      1000
    );

    // Track area height minus ruler
    const RULER_HEIGHT = 28;
    const lanesHeight = heightPx - RULER_HEIGHT;

    // ── Scroll sync ────────────────────────────────────────────────────────

    const handleScroll = useCallback(
      (e: React.UIEvent<HTMLDivElement>) => {
        setScrollLeftPx(e.currentTarget.scrollLeft);
      },
      [setScrollLeftPx]
    );

    // ── Zoom (wheel) ────────────────────────────────────────────────────────

    const handleWheel = useCallback(
      (e: React.WheelEvent<HTMLDivElement>) => {
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          const factor = 1 + e.deltaY * ZOOM_SENSITIVITY;
          setZoom(msPerPx * factor);
        }
      },
      [msPerPx, setZoom]
    );

    // ── Keyboard shortcuts ─────────────────────────────────────────────────

    const handleKeyDown = useCallback(
      (e: React.KeyboardEvent<HTMLDivElement>) => {
        const isCtrl = e.ctrlKey || e.metaKey;

        // Delete / Backspace → delete selected
        if (
          (e.key === "Delete" || e.key === "Backspace") &&
          selectedClipIds.size > 0
        ) {
          e.preventDefault();
          deleteSelected(selectedClipIds);
        }

        // Ctrl+D → duplicate selected (same position)
        if (isCtrl && e.key === "d" && !e.shiftKey) {
          e.preventDefault();
          duplicateSelected(selectedClipIds);
        }

        // Ctrl+Shift+D → duplicate + shift by a fixed offset (1 s)
        if (isCtrl && e.shiftKey && e.key === "D") {
          e.preventDefault();
          duplicateSelected(selectedClipIds, DUPLICATE_OFFSET_MS);
        }

        // S → split at playhead (no modifier; avoid hijacking browser Ctrl+S)
        if (e.key === "s" && !isCtrl && !e.shiftKey && !e.altKey) {
          // Don't fire when focus is inside a text input (e.g. track name editor)
          if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
            return;
          }
          e.preventDefault();
          splitSelectedAtPlayhead(currentTimeMs, selectedClipIds);
        }

        // Ctrl+Z → undo
        if (isCtrl && !e.shiftKey && e.key === "z") {
          e.preventDefault();
          getTimelineTemporal().undo();
        }

        // Ctrl+Shift+Z / Ctrl+Y → redo
        if (
          (isCtrl && e.shiftKey && e.key === "Z") ||
          (isCtrl && e.key === "y")
        ) {
          e.preventDefault();
          getTimelineTemporal().redo();
        }
      },
      [
        selectedClipIds,
        deleteSelected,
        duplicateSelected,
        splitSelectedAtPlayhead,
        currentTimeMs
      ]
    );

    const totalTracksHeight = tracks.reduce(
      (sum, t) => sum + (t.heightPx ?? DEFAULT_TRACK_HEIGHT_PX),
      0
    );

    return (
      <div
        css={containerStyles(theme)}
        style={{ height: heightPx }}
        tabIndex={0}
        onKeyDown={handleKeyDown}
        data-testid="tracks-region"
        aria-label="Tracks region"
      >
        {/* ── Ruler (spans full width) ─────────────────────────────────── */}
        <TimeRuler
          totalWidthPx={totalWidthPx}
          headerWidthPx={TRACK_HEADER_WIDTH_PX}
        />

        {/* ── Track rows ──────────────────────────────────────────────── */}
        <FlexRow
          sx={{ height: lanesHeight, overflow: "hidden" }}
          fullWidth
        >
          {/* Header column */}
          <div css={headerColumnStyles}>
            {tracks.map((track) => (
              <TrackHeader key={track.id} track={track} />
            ))}
          </div>

          {/* Scrollable lanes */}
          <div
            ref={scrollableRef}
            css={scrollableAreaStyles}
            onScroll={handleScroll}
            onWheel={handleWheel}
          >
            <div
              css={lanesContainerStyles}
              style={{ width: totalWidthPx, height: totalTracksHeight }}
            >
              {tracks.map((track) => (
                <TrackLane key={track.id} track={track} />
              ))}
            </div>

            {/* Playhead overlaid on the lanes */}
            <Playhead heightPx={lanesHeight} trackAreaOffsetPx={0} />
          </div>
        </FlexRow>
      </div>
    );
  }
);

TracksRegion.displayName = "TracksRegion";
