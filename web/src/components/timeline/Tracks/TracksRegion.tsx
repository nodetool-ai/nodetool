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
 *   ← / →            → nudge selected clips one frame (Shift: 1 s)
 *   Ctrl+C / X / V   → copy / cut / paste clips (paste lands at the playhead)
 *   Ctrl+D           → duplicateSelected (places duplicate right after source)
 *   Ctrl+Shift+D     → duplicateSelected with extra 1 s gap after source
 *   S                → splitSelectedAtPlayhead
 *   V / C            → select / cut tool
 *   Ctrl+Z / Ctrl+Y  → undo / redo
 * Shortcuts are skipped when focus is in a text input or contenteditable.
 *
 * Zoom: Ctrl+wheel on the lane area changes msPerPx, anchored at the cursor.
 * Horizontal scroll: native overflow-x scroll on the scrollable panel.
 */

import React, { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";

import {
  useTimelineStore,
  useTimelineStoreApi,
  getTimelineTemporal
} from "../../../stores/timeline/TimelineStore";
import {
  useTimelineUIStore,
  MIN_MS_PER_PX,
  MAX_MS_PER_PX
} from "../../../stores/timeline/TimelineUIStore";
import { useTimelinePlaybackStoreApi } from "../../../stores/timeline/TimelinePlaybackStore";
import {
  buildPastedClips,
  copyClipsToClipboard,
  hasClipboardClips
} from "../../../stores/timeline/clipboardOps";
import { TRACK_HEADER_WIDTH_PX } from "./TrackHeader";
import { TrackHeader } from "./TrackHeader";
import { TrackLane } from "./TrackLane";
import { TimeRuler } from "./TimeRuler";
import { Playhead } from "./Playhead";
import { AddTrackButton } from "./AddTrackButton";
import { TrackEffectsPanel } from "./TrackEffectsPanel";
import {
  ScriptLane,
  ScriptLaneHeader,
  SCRIPT_LANE_HEIGHT_PX
} from "./ScriptLane";
import { FX_PANEL_HEIGHT_PX } from "./trackHeight";
import { ToolToggle } from "../ToolToggle";
import { FlexRow, FONT_SIZE_MONO, FONT_WEIGHT, BORDER_RADIUS } from "../../ui_primitives";
import { deserializeDragData } from "../../../lib/dragdrop";
import type { Asset } from "../../../stores/ApiTypes";
import { assetMediaType } from "../dnd/assetToClipAdapter";
import { buildTypedIndexMap } from "./trackVisuals";

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
    height: 36,
    flexShrink: 0,
    padding: "0 12px 0 8px",
    borderBottom: `1px solid ${theme.vars.palette.divider}`,
    backgroundColor: theme.vars.palette.background.paper
  });

const tracksSectionHeaderStyles = (theme: Theme) =>
  css({
    width: TRACK_HEADER_WIDTH_PX,
    height: 28,
    flexShrink: 0,
    display: "flex",
    alignItems: "center",
    gap: 6,
    padding: "0 12px",
    backgroundColor: theme.vars.palette.background.paper,
    borderBottom: `1px solid ${theme.vars.palette.divider}`,
    color: theme.vars.palette.text.secondary,
    fontSize: FONT_SIZE_MONO.caption,
    fontWeight: FONT_WEIGHT.semibold,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    userSelect: "none"
  });

const trackCountChipStyles = (theme: Theme) =>
  css({
    marginLeft: "auto",
    minWidth: 18,
    height: 16,
    padding: theme.spacing(0, 1.5),
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: BORDER_RADIUS.sm,
    backgroundColor: theme.vars.palette.action.hover,
    color: theme.vars.palette.text.secondary,
    fontFamily:
      "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace",
    fontSize: FONT_SIZE_MONO.caption,
    fontWeight: FONT_WEIGHT.semibold,
    letterSpacing: "0"
  });

const headerColumnStyles = (theme: Theme) =>
  css({
    flexShrink: 0,
    overflowY: "hidden",
    overflowX: "hidden",
    borderRight: `1px solid ${theme.vars.palette.divider}`
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
    const moveSelectedClips = useTimelineStore((s) => s.moveSelectedClips);
    const addClips = useTimelineStore((s) => s.addClips);
    // Store handles for values read only inside event handlers (playhead
    // time, fps, clip list). Subscribing reactively to currentTimeMs here
    // would re-render every lane ~60×/s during playback.
    const docStore = useTimelineStoreApi();
    const playbackStore = useTimelinePlaybackStoreApi();

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

        const rect = scrollableRef.current?.getBoundingClientRect();
        if (!rect) return;
        const dropX = Math.max(0, e.clientX - rect.left);
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

    // Track area height minus toolbar + ruler
    const TOOLBAR_HEIGHT = 36;
    const RULER_HEIGHT = 28;
    const lanesHeight = Math.max(0, heightPx - TOOLBAR_HEIGHT - RULER_HEIGHT);

    // ── Scroll sync ────────────────────────────────────────────────────────

    const handleScroll = useCallback(
      (e: React.UIEvent<HTMLDivElement>) => {
        setScrollLeftPx(e.currentTarget.scrollLeft);
      },
      [setScrollLeftPx]
    );

    // ── Zoom (wheel) ────────────────────────────────────────────────────────
    //
    // Attached as a native non-passive listener: React's onWheel is passive,
    // so preventDefault() inside it can't stop the browser's pinch-zoom.

    // Anchor zoom at the cursor: remember which timeline time sat under the
    // pointer, then restore it to the same viewport x once the lanes have
    // re-rendered at the new scale (layout effect below — scrollLeft set
    // before re-render would clamp against the old content width).
    const zoomAnchorRef = useRef<{ timeMs: number; cursorPx: number } | null>(
      null
    );

    useEffect(() => {
      const el = scrollableRef.current;
      if (!el) return;
      const onWheel = (e: WheelEvent) => {
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          const factor = 1 + e.deltaY * ZOOM_SENSITIVITY;
          const next = Math.min(
            MAX_MS_PER_PX,
            Math.max(MIN_MS_PER_PX, msPerPx * factor)
          );
          if (next === msPerPx) return;
          const cursorPx = e.clientX - el.getBoundingClientRect().left;
          zoomAnchorRef.current = {
            timeMs: (el.scrollLeft + cursorPx) * msPerPx,
            cursorPx
          };
          setZoom(next);
        }
      };
      el.addEventListener("wheel", onWheel, { passive: false });
      return () => el.removeEventListener("wheel", onWheel);
    }, [msPerPx, setZoom]);

    useLayoutEffect(() => {
      const el = scrollableRef.current;
      const anchor = zoomAnchorRef.current;
      if (!el || !anchor) return;
      zoomAnchorRef.current = null;
      el.scrollLeft = Math.max(0, anchor.timeMs / msPerPx - anchor.cursorPx);
    }, [msPerPx]);

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
        // Another timeline surface (e.g. the focused preview's frame-step
        // arrows) already consumed this key.
        if (e.defaultPrevented) {
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

        // ←/→ → nudge selected clips by one frame (Shift: 1 s)
        if (
          (e.key === "ArrowLeft" || e.key === "ArrowRight") &&
          !isCtrl &&
          !e.altKey &&
          selectedClipIds.size > 0
        ) {
          e.preventDefault();
          const fps = docStore.getState().fps;
          const stepMs = e.shiftKey ? 1000 : Math.round(1000 / Math.max(1, fps));
          const deltaMs = e.key === "ArrowLeft" ? -stepMs : stepMs;
          const primaryId: string = selectedClipIds.values().next().value!;
          moveSelectedClips(primaryId, selectedClipIds, deltaMs);
          return;
        }

        // Ctrl+C / Ctrl+X → copy (cut) selected clips
        if (isCtrl && (e.key === "c" || e.key === "x") && selectedClipIds.size > 0) {
          e.preventDefault();
          const clips = docStore
            .getState()
            .clips.filter((c) => selectedClipIds.has(c.id));
          copyClipsToClipboard(clips);
          if (e.key === "x") {
            deleteSelected(selectedClipIds);
          }
          return;
        }

        // Ctrl+V → paste at playhead (earliest clip lands on the playhead,
        // the rest keep their relative offsets)
        if (isCtrl && e.key === "v" && hasClipboardClips()) {
          e.preventDefault();
          const pasted = buildPastedClips(
            docStore.getState().tracks,
            playbackStore.getState().currentTimeMs
          );
          if (pasted.length > 0) {
            addClips(pasted);
            setSelection(pasted.map((c) => c.id));
          }
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
          splitSelectedAtPlayhead(
            playbackStore.getState().currentTimeMs,
            selectedClipIds
          );
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
      moveSelectedClips,
      addClips,
      docStore,
      playbackStore,
      setActiveTool
    ]);

    const expandedFxTrackId = useTimelineUIStore(
      (s) => s.expandedFxTrackId
    );

    // Precompute per-type index map (O(n)) to avoid O(n²) per-header lookups.
    const typedIndexMap = useMemo(() => buildTypedIndexMap(tracks), [tracks]);

    const totalTracksHeight =
      tracks.reduce(
        (sum, t) =>
          sum +
          (t.heightPx ?? DEFAULT_TRACK_HEIGHT_PX) +
          (t.id === expandedFxTrackId ? FX_PANEL_HEIGHT_PX : 0),
        0
      ) + SCRIPT_LANE_HEIGHT_PX;

    // The script lane sits just above the first audio track (between video and
    // audio, Descript-style); if there's no audio track it goes last.
    const scriptBeforeTrackId =
      tracks.find((t) => t.type === "audio")?.id ?? null;

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
          gap={0.5}
          css={toolbarStyles(theme)}
          data-testid="timeline-toolbar"
        >
          <ToolToggle />
          <div style={{ flex: "1 1 auto" }} />
          <AddTrackButton />
        </FlexRow>

        {/* ── Sub-header: TRACKS label + ruler ────────────────────────── */}
        <FlexRow align="stretch" fullWidth>
          <div css={tracksSectionHeaderStyles(theme)}>
            <span>Tracks</span>
            <span
              css={trackCountChipStyles(theme)}
              aria-label={`${tracks.length} tracks`}
            >
              {tracks.length}
            </span>
          </div>
          <div style={{ flex: "1 1 auto", minWidth: 0 }}>
            <TimeRuler totalWidthPx={totalWidthPx} headerWidthPx={0} />
          </div>
        </FlexRow>

        {/* ── Track rows ──────────────────────────────────────────────── */}
        <FlexRow
          sx={{
            height: lanesHeight,
            overflowY: "auto",
            overflowX: "hidden",
            alignItems: "flex-start"
          }}
          fullWidth
          onDragOver={handleEmptyAreaDragOver}
          onDrop={handleEmptyAreaDrop}
        >
          {/* Header column */}
          <div css={headerColumnStyles(theme)}>
            {tracks.map((track) => (
              <React.Fragment key={track.id}>
                {track.id === scriptBeforeTrackId && <ScriptLaneHeader />}
                <TrackHeader track={track} typedIndex={typedIndexMap.get(track.id) ?? 1} />
                {expandedFxTrackId === track.id && (
                  <div
                    style={{ height: FX_PANEL_HEIGHT_PX }}
                    aria-hidden="true"
                  />
                )}
              </React.Fragment>
            ))}
            {scriptBeforeTrackId === null && <ScriptLaneHeader />}
          </div>

          {/* Scrollable lanes */}
          <div
            ref={scrollableRef}
            css={scrollableAreaStyles}
            onScroll={handleScroll}
          >
            <div
              css={lanesContainerStyles}
              style={{ minWidth: totalWidthPx, width: "100%", height: totalTracksHeight }}
            >
              {tracks.map((track) => (
                <React.Fragment key={track.id}>
                  {track.id === scriptBeforeTrackId && (
                    <ScriptLane />
                  )}
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
              {scriptBeforeTrackId === null && (
                <ScriptLane />
              )}
            </div>
          </div>
        </FlexRow>

        {/* Playhead overlay: spans ruler + lanes so the pill sits in the
         *  ruler. Positioned at the TracksRegion level so it isn't clipped
         *  by the scrollable area's overflow-y. The wrapper is
         *  pointer-events:none so it doesn't swallow clicks on the ruler or
         *  lanes; the Playhead's hit-area opts back into pointer events. */}
        <div
          style={{
            position: "absolute",
            top: TOOLBAR_HEIGHT,
            bottom: 0,
            left: TRACK_HEADER_WIDTH_PX,
            right: 0,
            pointerEvents: "none",
            overflow: "hidden"
          }}
        >
          <Playhead
            heightPx={RULER_HEIGHT + lanesHeight}
            trackAreaOffsetPx={0}
          />
        </div>
      </div>
    );
  }
);

TracksRegion.displayName = "TracksRegion";
