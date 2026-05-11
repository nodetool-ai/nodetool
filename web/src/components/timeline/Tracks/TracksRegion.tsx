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
 * Also registers window-level keyboard shortcuts for clip operations:
 *   Delete/Backspace → deleteSelected
 *   Ctrl+D           → duplicateSelected (places duplicate right after source)
 *   Ctrl+Shift+D     → duplicateSelected with extra 1 s gap after source
 *   S                → splitSelectedAtPlayhead
 *   V / C            → select / cut tool
 *   Ctrl+Z / Ctrl+Y  → undo / redo
 * Shortcuts are skipped when focus is in a text input or contenteditable.
 *
 * Zoom: scroll wheel on the lane area changes msPerPx.
 * Horizontal scroll: native overflow-x scroll on the scrollable panel.
 */

import React, { memo, useCallback, useEffect, useRef, useState } from "react";
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
import { AddTrackButton } from "./AddTrackButton";
import { TrackEffectsPanel } from "./TrackEffectsPanel";
import { FX_PANEL_HEIGHT_PX } from "./trackHeight";
import { ToolToggle } from "../ToolToggle";
import { FlexColumn, FlexRow } from "../../ui_primitives";
import { deserializeDragData } from "../../../lib/dragdrop";
import type { Asset } from "../../../stores/ApiTypes";
import { assetMediaType } from "../dnd/assetToClipAdapter";

// ── Constants ──────────────────────────────────────────────────────────────

const DEFAULT_TRACK_HEIGHT_PX = 64;
const ZOOM_SENSITIVITY = 0.001;
/** Extra gap (ms) inserted after the source clip when using Ctrl+Shift+D. */
const DUPLICATE_OFFSET_MS = 1000;

// ── Styles ─────────────────────────────────────────────────────────────────

const containerStyles = (theme: Theme) =>
  css({
    position: "relative",
    width: "100%",
    height: "100%",
    overflow: "hidden",
    backgroundColor: theme.vars.palette.background.default
  });

const toolbarStyles = (theme: Theme) =>
  css({
    height: 32,
    flexShrink: 0,
    padding: `0 ${theme.spacing(0.75)}`,
    borderBottom: `1px solid ${theme.vars.palette.divider}`,
    backgroundColor: theme.vars.palette.background.paper
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
    const setActiveTool = useTimelineUIStore((s) => s.setActiveTool);
    const setSelection = useTimelineUIStore((s) => s.setSelection);
    const deleteSelected = useTimelineStore((s) => s.deleteSelected);
    const duplicateSelected = useTimelineStore((s) => s.duplicateSelected);
    const splitSelectedAtPlayhead = useTimelineStore(
      (s) => s.splitSelectedAtPlayhead
    );
    const currentTimeMs = useTimelinePlaybackStore((s) => s.currentTimeMs);

    const addTrack = useTimelineStore((s) => s.addTrack);
    const addImportedClip = useTimelineStore((s) => s.addImportedClip);

    const scrollableRef = useRef<HTMLDivElement>(null);

    // ── Drop on empty area: auto-create a track of matching type ───────────

    const isAssetDrag = useCallback((e: React.DragEvent): boolean => {
      return (
        e.dataTransfer.types.includes("asset") ||
        e.dataTransfer.types.includes("selectedAssetIds")
      );
    }, []);

    const handleEmptyAreaDragOver = useCallback(
      (e: React.DragEvent<HTMLDivElement>) => {
        if (!isAssetDrag(e)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
      },
      [isAssetDrag]
    );

    const handleEmptyAreaDrop = useCallback(
      (e: React.DragEvent<HTMLDivElement>) => {
        if (!isAssetDrag(e)) return;
        e.preventDefault();
        e.stopPropagation();

        const dragData = deserializeDragData(e.dataTransfer);
        if (!dragData || dragData.type !== "asset") return;
        const asset = dragData.payload as Asset;

        const mediaType = assetMediaType(asset.content_type);
        if (!mediaType) return;

        const trackType: "video" | "audio" =
          mediaType === "audio" ? "audio" : "video";

        const rect = e.currentTarget.getBoundingClientRect();
        const dropX = e.clientX - rect.left;
        const startMs = Math.max(
          0,
          Math.round((dropX + scrollLeftPx) * msPerPx)
        );

        addTrack(trackType);
        const newTrack =
          useTimelineStore.getState().tracks.slice(-1)[0];
        if (!newTrack) return;
        addImportedClip(asset, newTrack.id, startMs);
      },
      [isAssetDrag, scrollLeftPx, msPerPx, addTrack, addImportedClip]
    );

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
    //
    // Attached at window level so the shortcuts work regardless of which
    // element has focus inside the timeline editor. (Clicking a clip doesn't
    // transfer focus to the tracks region, since Clip's pointerdown calls
    // preventDefault to suppress text selection — which also suppresses the
    // browser's default focus action.) Text inputs and contenteditable
    // regions are skipped so typing isn't hijacked.

    useEffect(() => {
      const isEditableTarget = (target: EventTarget | null): boolean =>
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        (target instanceof HTMLElement && target.isContentEditable);

      const handleKeyDown = (e: KeyboardEvent) => {
        if (isEditableTarget(e.target)) {
          return;
        }

        const isCtrl = e.ctrlKey || e.metaKey;

        // Delete / Backspace → delete selected
        if (
          (e.key === "Delete" || e.key === "Backspace") &&
          selectedClipIds.size > 0
        ) {
          e.preventDefault();
          deleteSelected(selectedClipIds);
          return;
        }

        // Ctrl+D → duplicate selected (placed right after each source)
        if (isCtrl && e.key === "d" && !e.shiftKey) {
          e.preventDefault();
          const newIds = duplicateSelected(selectedClipIds);
          if (newIds.length > 0) setSelection(newIds);
          return;
        }

        // Ctrl+Shift+D → duplicate with an extra 1 s gap after each source
        if (isCtrl && e.shiftKey && e.key === "D") {
          e.preventDefault();
          const newIds = duplicateSelected(selectedClipIds, DUPLICATE_OFFSET_MS);
          if (newIds.length > 0) setSelection(newIds);
          return;
        }

        // S → split at playhead (no modifier; avoid hijacking browser Ctrl+S)
        if (e.key === "s" && !isCtrl && !e.shiftKey && !e.altKey) {
          e.preventDefault();
          splitSelectedAtPlayhead(currentTimeMs, selectedClipIds);
          return;
        }

        // V → select tool, C → cut tool (FCP-style)
        if (
          (e.key === "v" || e.key === "c") &&
          !isCtrl &&
          !e.shiftKey &&
          !e.altKey
        ) {
          e.preventDefault();
          setActiveTool(e.key === "v" ? "select" : "cut");
          return;
        }

        // Ctrl+Z → undo
        if (isCtrl && !e.shiftKey && e.key === "z") {
          e.preventDefault();
          getTimelineTemporal().undo();
          return;
        }

        // Ctrl+Shift+Z / Ctrl+Y → redo
        if (
          (isCtrl && e.shiftKey && e.key === "Z") ||
          (isCtrl && e.key === "y")
        ) {
          e.preventDefault();
          getTimelineTemporal().redo();
        }
      };

      window.addEventListener("keydown", handleKeyDown);
      return () => window.removeEventListener("keydown", handleKeyDown);
    }, [
      selectedClipIds,
      deleteSelected,
      duplicateSelected,
      setSelection,
      splitSelectedAtPlayhead,
      currentTimeMs,
      setActiveTool
    ]);

    const expandedFxTrackId = useTimelineUIStore(
      (s) => s.expandedFxTrackId
    );

    const totalTracksHeight = tracks.reduce(
      (sum, t) =>
        sum +
        (t.heightPx ?? DEFAULT_TRACK_HEIGHT_PX) +
        (t.id === expandedFxTrackId ? FX_PANEL_HEIGHT_PX : 0),
      0
    );

    // The FX panel sticks to the left of the scroll viewport so it stays
    // visible while clips scroll horizontally. Its width matches the
    // scrollable area's visible width.
    const [fxPanelWidth, setFxPanelWidth] = useState(0);
    useEffect(() => {
      const el = scrollableRef.current;
      if (!el) return;
      const update = () => setFxPanelWidth(el.clientWidth);
      update();
      const ro = new ResizeObserver(update);
      ro.observe(el);
      return () => ro.disconnect();
    }, []);

    return (
      <div
        css={containerStyles(theme)}
        style={{ height: heightPx }}
        data-testid="tracks-region"
        aria-label="Tracks region"
      >
        {/* ── Tool toolbar (above the ruler) ──────────────────────────── */}
        <FlexRow
          align="center"
          justify="center"
          gap={0.5}
          css={toolbarStyles(theme)}
          data-testid="timeline-toolbar"
        >
          <ToolToggle />
        </FlexRow>

        {/* ── Ruler (spans full width) ─────────────────────────────────── */}
        <TimeRuler
          totalWidthPx={totalWidthPx}
          headerWidthPx={TRACK_HEADER_WIDTH_PX}
        />

        {/* ── Track rows ──────────────────────────────────────────────── */}
        <FlexRow
          sx={{
            height: lanesHeight,
            overflowY: "auto",
            overflowX: "hidden",
            alignItems: "flex-start"
          }}
          fullWidth
        >
          {/* Header column */}
          <div css={headerColumnStyles}>
            {tracks.map((track) => (
              <React.Fragment key={track.id}>
                <TrackHeader track={track} />
                {expandedFxTrackId === track.id && (
                  <div
                    style={{ height: FX_PANEL_HEIGHT_PX }}
                    aria-hidden="true"
                  />
                )}
              </React.Fragment>
            ))}
            <AddTrackButton />
          </div>

          {/* Scrollable lanes */}
          <div
            ref={scrollableRef}
            css={scrollableAreaStyles}
            onScroll={handleScroll}
            onWheel={handleWheel}
            onDragOver={handleEmptyAreaDragOver}
            onDrop={handleEmptyAreaDrop}
          >
            <div
              css={lanesContainerStyles}
              style={{ width: totalWidthPx, height: totalTracksHeight }}
            >
              {tracks.map((track) => (
                <React.Fragment key={track.id}>
                  <TrackLane track={track} />
                  {expandedFxTrackId === track.id && (
                    <div
                      style={{
                        position: "sticky",
                        left: 0,
                        width: fxPanelWidth,
                        height: FX_PANEL_HEIGHT_PX,
                        zIndex: 2
                      }}
                    >
                      <TrackEffectsPanel trackId={track.id} />
                    </div>
                  )}
                </React.Fragment>
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
