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
 *   - Drop target for assets dragged from AssetExplorer (NOD-304)
 */

import React, { memo, useCallback, useRef, useState, useEffect } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";

import AddIcon from "@mui/icons-material/Add";

import type { TimelineTrack } from "@nodetool-ai/timeline";
import {
  useTimelineStore,
  useTimelineStoreApi
} from "../../../stores/timeline/TimelineStore";
import { useTimelineUIStore } from "../../../stores/timeline/TimelineUIStore";
import { useTimelinePlaybackStore } from "../../../stores/timeline/TimelinePlaybackStore";
import { useStoreWithEqualityFn } from "zustand/traditional";
import { Clip } from "./Clip";
import { ContextMenu, WarningBanner, MOTION, MenuItemPrimitive, Z_INDEX } from "../../ui_primitives";
import { AddClipMenu } from "../AddClipMenu";
import { deserializeDragData } from "../../../lib/dragdrop";
import type { Asset } from "../../../stores/ApiTypes";
import {
  assetMediaType,
  isCompatibleWithTrack
} from "../dnd/assetToClipAdapter";
import { useVideoAudioImport } from "../../../hooks/timeline/useVideoAudioImport";

const DEFAULT_TRACK_HEIGHT_PX = 64;
/** Duration (ms) the mismatch warning banner remains visible. */
const WARNING_DISMISS_MS = 3000;

const laneStyles = (
  theme: Theme,
  heightPx: number,
  visible: boolean,
  isRubberBanding: boolean,
  isDragOver: boolean,
  isDragReject: boolean
) =>
  css({
    position: "relative",
    width: "100%",
    height: heightPx,
    flexShrink: 0,
    backgroundColor: theme.vars.palette.background.default,
    opacity: visible ? 1 : 0.55,
    borderBottom: `1px solid ${
      isDragReject
        ? theme.vars.palette.error.main
        : isDragOver
          ? theme.vars.palette.primary.main
          : theme.vars.palette.divider
    }`,
    outline: isDragOver
      ? `2px solid ${theme.vars.palette.primary.main}`
      : isDragReject
        ? `2px solid ${theme.vars.palette.error.main}`
        : "none",
    outlineOffset: "-2px",
    overflow: "hidden",
    cursor: isRubberBanding ? "crosshair" : "default",
    transition: `opacity ${MOTION.fast}`
  });

const rubberBandStyles = (theme: Theme) =>
  css({
    position: "absolute",
    border: `1px solid ${theme.vars.palette.secondary.main}`,
    backgroundColor: `${theme.vars.palette.secondary.main}22`,
    pointerEvents: "none",
    zIndex: Z_INDEX.sticky
  });

interface RubberBandRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface TrackLaneProps {
  track: TimelineTrack;
}

export const TrackLane: React.FC<TrackLaneProps> = memo(({ track }) => {
  const theme = useTheme();

  // Get only the clip IDs for this track (stable list of ids)
  const timelineStore = useTimelineStoreApi();
  const clipIds = useStoreWithEqualityFn(
    timelineStore,
    (s) =>
      s.clips
        .filter((c) => c.trackId === track.id)
        .map((c) => c.id),
    // Shallow-compare the resulting string array
    (a: string[], b: string[]) =>
      a.length === b.length && a.every((id, i) => id === b[i])
  );

  const msPerPx = useTimelineUIStore((s) => s.msPerPx);
  const clearSelection = useTimelineUIStore((s) => s.clearSelection);
  const seek = useTimelinePlaybackStore((s) => s.seek);
  const setSelection = useTimelineUIStore((s) => s.setSelection);
  const addImportedClip = useTimelineStore((s) => s.addImportedClip);
  const importVideoWithAudio = useVideoAudioImport();

  const heightPx = track.heightPx ?? DEFAULT_TRACK_HEIGHT_PX;

  const isRubberBandingRef = useRef(false);
  const rbStartRef = useRef({ x: 0, y: 0 });
  /** Selection snapshot taken at pointerdown when Shift is held (union mode). */
  const rbBaseSelectionRef = useRef<Set<string> | null>(null);
  /** This track's clips snapshotted at pointerdown — the clip list doesn't
   *  change during a rubber-band gesture, so we avoid filtering the full clip
   *  array twice on every pointermove. */
  const rbTrackClipsRef = useRef<
    Array<{ id: string; startMs: number; durationMs: number }>
  >([]);
  /** Coalesces selection updates to one per animation frame. */
  const rbLastAppliedRef = useRef<{ startMs: number; endMs: number } | null>(
    null
  );
  /** Lane's bounding rect, captured once at pointerdown. The lane can't move
   *  during a captured rubber-band gesture, so pointermove reuses this instead
   *  of calling getBoundingClientRect() (forces layout) on every move. */
  const rbLaneRectRef = useRef<DOMRect | null>(null);
  const [rubberBand, setRubberBand] = React.useState<RubberBandRect | null>(
    null
  );

  const [isDragOver, setIsDragOver] = useState(false);
  const [isDragReject, setIsDragReject] = useState(false);
  const [dropWarning, setDropWarning] = useState<string | null>(null);
  const warningTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [contextMenuPos, setContextMenuPos] = useState<{
    x: number;
    y: number;
    startMs: number;
  } | null>(null);
  const [addClipState, setAddClipState] = useState<{
    x: number;
    y: number;
    startMs: number;
  } | null>(null);
  const [addClipAnchorEl, setAddClipAnchorEl] = useState<HTMLElement | null>(
    null
  );

  // Clear any pending warning timer / scheduled selection frame on unmount
  useEffect(() => {
    return () => {
      if (warningTimerRef.current !== null) {
        clearTimeout(warningTimerRef.current);
      }
    };
  }, []);

  const showWarning = useCallback((message: string, isReject = false) => {
    setDropWarning(message);
    setIsDragReject(isReject);
    if (warningTimerRef.current !== null) {
      clearTimeout(warningTimerRef.current);
    }
    warningTimerRef.current = setTimeout(() => {
      setDropWarning(null);
      setIsDragReject(false);
      warningTimerRef.current = null;
    }, WARNING_DISMISS_MS);
  }, []);

  /**
   * Returns true if the dataTransfer looks like an asset drag (single or multi).
   * The legacy "asset" key is only set by single-asset drags; "selectedAssetIds"
   * is set by multi-asset drags. We intentionally do NOT check DRAG_DATA_MIME
   * alone because that MIME type is shared with create-node and other drag types.
   */
  const isAssetDrag = useCallback((e: React.DragEvent): boolean => {
    // Check for both the unified MIME type and the legacy "asset" key.
    // useAssetActions sets both for backward compatibility: serializeDragData
    // writes DRAG_DATA_MIME, and a separate line writes the legacy "asset" key.
    return (
      e.dataTransfer.types.includes("asset") ||
      e.dataTransfer.types.includes("selectedAssetIds")
    );
  }, []);

  const handleAssetDragOver = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      if (!isAssetDrag(e)) {
        return;
      }
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
      setIsDragOver(true);
    },
    [isAssetDrag]
  );

  const handleAssetDragLeave = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      // Only clear when leaving the lane itself (not a child element).
      // relatedTarget is null or an Element, both of which are Nodes.
      if (!(e.relatedTarget instanceof Node) || !e.currentTarget.contains(e.relatedTarget)) {
        setIsDragOver(false);
        setIsDragReject(false);
      }
    },
    []
  );

  const handleAssetDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      setIsDragOver(false);
      setIsDragReject(false);

      if (!isAssetDrag(e)) {
        return;
      }

      e.preventDefault();
      e.stopPropagation();

      const dragData = deserializeDragData(e.dataTransfer);
      if (!dragData) {
        return;
      }

      // Multi-asset drags are not supported for clip creation — guide the user.
      if (dragData.type === "assets-multiple") {
        showWarning("Drop one asset at a time onto a track.", true);
        return;
      }

      // Resolve asset: only single-asset drags are supported for clip creation
      let asset: Asset | null = null;
      if (dragData.type === "asset") {
        asset = dragData.payload as Asset;
      }

      if (!asset) {
        return;
      }

      const mediaType = assetMediaType(asset.content_type);
      if (!mediaType) {
        showWarning(`Cannot import "${asset.name}": unsupported media type.`);
        return;
      }

      if (!isCompatibleWithTrack(mediaType, track.type)) {
        const expected =
          mediaType === "audio" ? "an audio" : "a video or overlay";
        showWarning(
          `Cannot drop ${mediaType} asset onto this ${track.type} track — use ${expected} track.`,
          true
        );
        return;
      }

      // The lane lives inside the scrolling lanes container, so lane-local
      // coordinates are already content-space — no scroll offset needed.
      const rect = e.currentTarget.getBoundingClientRect();
      const dropX = e.clientX - rect.left;
      const startMs = Math.max(0, Math.round(dropX * msPerPx));

      // Video dropped on a video track: also create a linked audio clip from
      // the video's audio track. Everything else imports as a single clip.
      if (mediaType === "video" && track.type === "video") {
        void importVideoWithAudio(asset, track.id, startMs);
      } else {
        addImportedClip(asset, track.id, startMs);
      }
    },
    [
      isAssetDrag,
      track.type,
      track.id,
      msPerPx,
      addImportedClip,
      importVideoWithAudio,
      showWarning
    ]
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
        rbBaseSelectionRef.current = null;
      } else {
        // Shift+band: remember the existing selection so the band's contents
        // can be unioned with it instead of replacing it.
        rbBaseSelectionRef.current = new Set(
          useTimelineUIStore.getState().selectedClipIds
        );
      }

      // Snapshot this track's clips once — they don't move during the band
      // gesture, so the hit-test on pointermove reads from this list instead of
      // re-filtering the global clip array each frame.
      rbTrackClipsRef.current = useTimelineStore
        .getState()
        .clips.filter((c) => c.trackId === track.id)
        .map((c) => ({
          id: c.id,
          startMs: c.startMs,
          durationMs: c.durationMs
        }));

      e.currentTarget.setPointerCapture(e.pointerId);
      const rect = e.currentTarget.getBoundingClientRect();
      rbLaneRectRef.current = rect;
      const localX = e.clientX - rect.left;
      rbStartRef.current = {
        x: localX,
        y: e.clientY - rect.top
      };
      isRubberBandingRef.current = true;

      // Move the playhead to the clicked position. The lane is inside the
      // scrolling container, so localX is already content-space.
      const timeMs = Math.round(localX * msPerPx);
      seek(timeMs);
    },
    [clearSelection, msPerPx, seek, track.id]
  );

  // Apply the rubber-band selection for the given content-space range. Deduped
  // by range: pointer events that don't change the band (sub-pixel jitter, the
  // browser already coalesces moves to ~one per frame) skip the O(n) overlap
  // filter and the setSelection call entirely.
  const applyRubberBandSelection = useCallback(
    (startMs: number, endMs: number) => {
      const last = rbLastAppliedRef.current;
      if (last && last.startMs === startMs && last.endMs === endMs) {
        return;
      }
      rbLastAppliedRef.current = { startMs, endMs };

      const selected = rbTrackClipsRef.current
        .filter((c) => {
          const clipEnd = c.startMs + c.durationMs;
          return clipEnd > startMs && c.startMs < endMs;
        })
        .map((c) => c.id);

      // Shift+band unions with the selection snapshotted at pointerdown;
      // a plain band replaces the selection.
      const base = rbBaseSelectionRef.current;
      setSelection(base ? [...new Set([...base, ...selected])] : selected);
    },
    [setSelection]
  );

  const handleLanePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!isRubberBandingRef.current || e.buttons !== 1) {
        return;
      }
      const rect = rbLaneRectRef.current;
      if (!rect) {
        return;
      }
      const curX = e.clientX - rect.left;
      const curY = e.clientY - rect.top;

      const left = Math.min(rbStartRef.current.x, curX);
      const top = Math.min(rbStartRef.current.y, curY);
      const width = Math.abs(curX - rbStartRef.current.x);
      const height = Math.abs(curY - rbStartRef.current.y);

      setRubberBand({ left, top, width, height });

      // Compute which clips overlap the rubber-band. The lane renders inside
      // the scrolling lanes container, so lane-local coordinates are already
      // content-space — no scroll offset.
      const rbStartMs = left * msPerPx;
      applyRubberBandSelection(rbStartMs, rbStartMs + width * msPerPx);
    },
    [msPerPx, applyRubberBandSelection]
  );

  const handleLanePointerUp = useCallback(() => {
    isRubberBandingRef.current = false;
    rbBaseSelectionRef.current = null;
    rbLastAppliedRef.current = null;
    rbTrackClipsRef.current = [];
    rbLaneRectRef.current = null;
    setRubberBand(null);
  }, []);

  const handleLaneContextMenu = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      // Only on empty lane space — let clips handle their own context menu.
      if (e.target !== e.currentTarget) {
        return;
      }
      if (track.locked) {
        return;
      }
      e.preventDefault();
      const rect = e.currentTarget.getBoundingClientRect();
      const dropX = e.clientX - rect.left;
      const startMs = Math.max(0, Math.round(dropX * msPerPx));
      setContextMenuPos({ x: e.clientX, y: e.clientY, startMs });
    },
    [track.locked, msPerPx]
  );

  const handleAddClipFromMenu = useCallback(() => {
    if (!contextMenuPos) {
      return;
    }
    setAddClipState({
      x: contextMenuPos.x,
      y: contextMenuPos.y,
      startMs: contextMenuPos.startMs
    });
    setContextMenuPos(null);
  }, [contextMenuPos]);

  const handleAddClipClose = useCallback(() => {
    setAddClipState(null);
    setAddClipAnchorEl(null);
  }, []);

  return (
    <div
      css={laneStyles(theme, heightPx, track.visible, rubberBand !== null, isDragOver, isDragReject)}
      data-testid={`track-lane-${track.id}`}
      onPointerDown={handleLanePointerDown}
      onPointerMove={handleLanePointerMove}
      onPointerUp={handleLanePointerUp}
      onPointerCancel={handleLanePointerUp}
      onDragOver={handleAssetDragOver}
      onDragLeave={handleAssetDragLeave}
      onDrop={handleAssetDrop}
      onContextMenu={handleLaneContextMenu}
      role="listbox"
      tabIndex={0}
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

      {/* Right-click context menu (lane background) */}
      <ContextMenu
        open={contextMenuPos !== null}
        position={
          contextMenuPos
            ? { x: contextMenuPos.x, y: contextMenuPos.y }
            : null
        }
        onClose={() => setContextMenuPos(null)}
        compact
      >
        <MenuItemPrimitive
          label="Add generated clip here…"
          icon={<AddIcon fontSize="small" />}
          onClick={handleAddClipFromMenu}
          compact
        />
      </ContextMenu>

      {/* Invisible anchor for AddClipMenu, positioned at click location */}
      {addClipState && (
        <div
          ref={setAddClipAnchorEl}
          style={{
            position: "fixed",
            top: addClipState.y,
            left: addClipState.x,
            width: 1,
            height: 1,
            pointerEvents: "none"
          }}
          aria-hidden="true"
        />
      )}

      {/* AddClipMenu — workflow picker */}
      {addClipState && addClipAnchorEl && (
        <AddClipMenu
          trackId={track.id}
          startMs={addClipState.startMs}
          trackType={track.type}
          anchorEl={addClipAnchorEl}
          onClose={handleAddClipClose}
        />
      )}

      {/* Mismatch / error warning banner (auto-dismissed) */}
      {dropWarning && (
        <div
          style={{
            position: "absolute",
            bottom: 4,
            left: 4,
            right: 4,
            zIndex: Z_INDEX.sticky + 10,
            pointerEvents: "none"
          }}
          aria-live="polite"
        >
          <WarningBanner
            message={dropWarning}
            variant="warning"
            compact
          />
        </div>
      )}
    </div>
  );
});

TrackLane.displayName = "TrackLane";
