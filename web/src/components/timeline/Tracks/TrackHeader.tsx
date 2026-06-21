/** @jsxImportSource @emotion/react */
/**
 * TrackHeader
 *
 * Left-hand strip showing track metadata and controls:
 *   - Type glyph + name + index chip (V1, A1, …) on the top row
 *   - Visibility / lock / mute / solo / fx / delete row beneath
 *   - Height resize handle at the bottom edge
 */

import React, { memo, useCallback, useEffect, useRef, useState } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import VisibilityOutlinedIcon from "@mui/icons-material/VisibilityOutlined";
import VisibilityOffOutlinedIcon from "@mui/icons-material/VisibilityOffOutlined";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import LockOpenOutlinedIcon from "@mui/icons-material/LockOpenOutlined";
import VolumeOffOutlinedIcon from "@mui/icons-material/VolumeOffOutlined";
import VolumeUpOutlinedIcon from "@mui/icons-material/VolumeUpOutlined";
import DeleteOutlineOutlinedIcon from "@mui/icons-material/DeleteOutlineOutlined";
import GraphicEqOutlinedIcon from "@mui/icons-material/GraphicEqOutlined";
import DragIndicatorIcon from "@mui/icons-material/DragIndicator";

import type { TimelineTrack } from "@nodetool-ai/timeline";
import {
  useTimelineStore,
  useTimelineStoreApi,
  timelineTemporalOf
} from "../../../stores/timeline/TimelineStore";
import {
  useTimelineUIStore,
  useTimelineUIStoreApi
} from "../../../stores/timeline/TimelineUIStore";
import {
  computeReorderedTrackIds,
  type TrackDropPosition
} from "./trackReorder";
import { Tooltip, MOTION, BORDER_RADIUS, FONT_SIZE_SANS, FONT_SIZE_MONO, FONT_WEIGHT } from "../../ui_primitives";
import {
  DEFAULT_TRACK_HEIGHT_PX as SHARED_DEFAULT_TRACK_HEIGHT_PX,
  FX_PANEL_HEIGHT_PX
} from "./trackHeight";
import {
  trackTypeMeta,
  trackTypeAccent
} from "./trackVisuals";
import ConfirmDialog from "../../dialogs/ConfirmDialog";

// ── Constants ──────────────────────────────────────────────────────────────

export const TRACK_HEADER_WIDTH_PX = 192;
/**
 * Private drag MIME for track-reorder drags. Distinct from the asset-drop
 * types ("asset" / "selectedAssetIds") so the lane/empty-area asset-drop
 * handlers never react to a track being reordered.
 */
export const TRACK_DRAG_MIME = "application/x-nodetool-timeline-track";
const MIN_TRACK_HEIGHT_PX = 48;
const MAX_TRACK_HEIGHT_PX = 300;
const DEFAULT_TRACK_HEIGHT_PX = SHARED_DEFAULT_TRACK_HEIGHT_PX;
const RESIZE_HANDLE_HEIGHT_PX = 6;

// ── Styles ─────────────────────────────────────────────────────────────────

const headerStyles = (theme: Theme, heightPx: number) =>
  css({
    position: "relative",
    width: TRACK_HEADER_WIDTH_PX,
    height: heightPx,
    flexShrink: 0,
    display: "flex",
    flexDirection: "column",
    justifyContent: "space-between",
    padding: "12px 12px 12px",
    backgroundColor: theme.vars.palette.background.default,
    borderBottom: `1px solid ${theme.vars.palette.divider}`,
    overflow: "hidden",
    userSelect: "none"
  });

const topRowStyles = css({
  display: "flex",
  flexDirection: "row",
  alignItems: "center",
  gap: 8,
  minWidth: 0
});

const dragHandleStyles = (theme: Theme) =>
  css({
    flexShrink: 0,
    width: 16,
    marginLeft: -6,
    marginRight: -2,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "grab",
    color: theme.vars.palette.text.disabled,
    transition: `color ${MOTION.fast}`,
    "&:hover": {
      color: theme.vars.palette.text.secondary
    },
    "&:active": {
      cursor: "grabbing"
    },
    "& svg": {
      fontSize: 16
    }
  });

/** Horizontal insertion line shown at the top or bottom edge during a drag. */
const dropIndicatorStyles = (theme: Theme, edge: TrackDropPosition) =>
  css({
    position: "absolute",
    left: 0,
    right: 0,
    [edge === "before" ? "top" : "bottom"]: 0,
    height: 2,
    backgroundColor: theme.vars.palette.primary.main,
    zIndex: 3,
    pointerEvents: "none"
  });

const typeGlyphStyles = (theme: Theme, accent: string) =>
  css({
    width: 26,
    height: 26,
    flexShrink: 0,
    borderRadius: BORDER_RADIUS.md,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.vars.palette.background.paper,
    border: `1px solid ${theme.vars.palette.divider}`,
    color: accent,
    "& svg": {
      fontSize: 15
    }
  });

const nameWrapStyles = css({
  flex: "1 1 auto",
  minWidth: 0,
  display: "flex",
  flexDirection: "row",
  alignItems: "center",
  gap: 6
});

const nameInputStyles = (theme: Theme) =>
  css({
    border: "none",
    background: "transparent",
    color: theme.vars.palette.text.primary,
    fontSize: FONT_SIZE_SANS.label,
    fontWeight: FONT_WEIGHT.medium,
    letterSpacing: "-0.005em",
    fontFamily: theme.typography.fontFamily,
    minWidth: 0,
    flex: "0 1 auto",
    padding: 0,
    outline: "none",
    cursor: "default",
    textOverflow: "ellipsis",
    overflow: "hidden",
    whiteSpace: "nowrap",
    "&:focus": {
      cursor: "text",
      color: theme.vars.palette.text.primary
    }
  });

const indexChipStyles = (theme: Theme) =>
  css({
    flexShrink: 0,
    height: 18,
    padding: "0 6px",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: BORDER_RADIUS.sm,
    border: `1px solid ${theme.vars.palette.divider}`,
    fontFamily:
      "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace",
    fontSize: FONT_SIZE_MONO.caption,
    fontWeight: FONT_WEIGHT.semibold,
    letterSpacing: "0.04em",
    color: theme.vars.palette.text.secondary,
    backgroundColor: "transparent"
  });

const controlsRowStyles = css({
  display: "flex",
  flexDirection: "row",
  alignItems: "center",
  gap: 2,
  marginLeft: -4 // align icon edges flush with the type glyph
});

const iconButtonStyles = (theme: Theme, active = true) =>
  css({
    width: 24,
    height: 22,
    background: "transparent",
    border: "1px solid transparent",
    padding: 0,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: active
      ? theme.vars.palette.text.secondary
      : theme.vars.palette.text.disabled,
    borderRadius: BORDER_RADIUS.md,
    transition: `background-color ${MOTION.fast}, color ${MOTION.fast}, border-color ${MOTION.fast}`,
    "&:hover": {
      backgroundColor: theme.vars.palette.action.hover,
      color: theme.vars.palette.text.primary,
      borderColor: theme.vars.palette.divider
    },
    "&:focus-visible": {
      outline: "none",
      borderColor: theme.vars.palette.primary.main
    },
    "& svg": {
      fontSize: 14
    }
  });

const resizeHandleStyles = (theme: Theme) =>
  css({
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: RESIZE_HANDLE_HEIGHT_PX,
    cursor: "ns-resize",
    backgroundColor: "transparent",
    "&:hover": {
      backgroundColor: theme.vars.palette.primary.main,
      opacity: 0.3
    }
  });

// ── Component ──────────────────────────────────────────────────────────────

export interface TrackHeaderProps {
  track: TimelineTrack;
  /** Pre-computed 1-based index within the track's type group. */
  typedIndex: number;
}

export const TrackHeader: React.FC<TrackHeaderProps> = memo(({ track, typedIndex }) => {
  const theme = useTheme();

  const setTrackVisible = useTimelineStore((s) => s.setTrackVisible);
  const setTrackLocked = useTimelineStore((s) => s.setTrackLocked);
  const setTrackMuted = useTimelineStore((s) => s.setTrackMuted);
  const setTrackSolo = useTimelineStore((s) => s.setTrackSolo);
  const setTrackHeight = useTimelineStore((s) => s.setTrackHeight);
  const setTrackName = useTimelineStore((s) => s.setTrackName);
  const removeTrack = useTimelineStore((s) => s.removeTrack);
  const reorderTracks = useTimelineStore((s) => s.reorderTracks);

  const heightPx = track.heightPx ?? DEFAULT_TRACK_HEIGHT_PX;
  const meta = trackTypeMeta(track.type);
  const accent = trackTypeAccent(theme, track.type);
  const TypeIcon = meta.Icon;

  // ── Inline name edit ────────────────────────────────────────────────────

  const [editingName, setEditingName] = useState(false);
  const [localName, setLocalName] = useState(track.name);
  const [confirmRemoveOpen, setConfirmRemoveOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleNameDoubleClick = useCallback(() => {
    setEditingName(true);
    setLocalName(track.name);
    setTimeout(() => inputRef.current?.select(), 0);
  }, [track.name]);

  const commitName = useCallback(() => {
    // Blur fires even when the input is read-only (not in edit mode) — don't
    // commit the stale localName from a previous edit session in that case.
    if (!editingName) {
      return;
    }
    setEditingName(false);
    if (localName.trim()) {
      setTrackName(track.id, localName.trim());
    }
  }, [editingName, localName, setTrackName, track.id]);

  const handleNameKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        commitName();
      }
      if (e.key === "Escape") {
        setEditingName(false);
        setLocalName(track.name);
      }
    },
    [commitName, track.name]
  );

  // ── Height resize handle ────────────────────────────────────────────────

  const dragStartYRef = useRef(0);
  const dragStartHeightRef = useRef(heightPx);
  // Gesture-ownership flag: the move handler only runs when this handle's
  // pointerdown started the gesture (not when another drag passes over it).
  const isResizingRef = useRef(false);

  // Undo batching: record the pre-resize state with the first mutation, then
  // pause history so the whole resize collapses into one undo entry.
  const timelineStoreApi = useTimelineStoreApi();
  const historyPausedRef = useRef(false);

  const resumeHistory = useCallback(() => {
    if (historyPausedRef.current) {
      historyPausedRef.current = false;
      timelineTemporalOf(timelineStoreApi).resume();
    }
  }, [timelineStoreApi]);

  // Safety net: never leave history paused if the header unmounts mid-resize.
  useEffect(() => resumeHistory, [resumeHistory]);

  const handleResizePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      e.currentTarget.setPointerCapture(e.pointerId);
      dragStartYRef.current = e.clientY;
      dragStartHeightRef.current = heightPx;
      isResizingRef.current = true;
    },
    [heightPx]
  );

  const handleResizePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!isResizingRef.current || e.buttons !== 1) {
        return;
      }
      const deltaY = e.clientY - dragStartYRef.current;
      const newHeight = Math.min(
        MAX_TRACK_HEIGHT_PX,
        Math.max(MIN_TRACK_HEIGHT_PX, dragStartHeightRef.current + deltaY)
      );
      setTrackHeight(track.id, newHeight);
      // First mutation recorded the pre-resize state; batch the rest.
      if (!historyPausedRef.current) {
        timelineTemporalOf(timelineStoreApi).pause();
        historyPausedRef.current = true;
      }
    },
    [setTrackHeight, track.id, timelineStoreApi]
  );

  const handleResizePointerEnd = useCallback(() => {
    isResizingRef.current = false;
    resumeHistory();
  }, [resumeHistory]);

  const isAudioTrack = track.type === "audio";
  const supportsEffects =
    track.type === "audio" || track.type === "video";
  const effectsCount = track.effects?.length ?? 0;
  const hasActiveEffects =
    track.effects?.some((e) => e.enabled) ?? false;

  // ── Inline FX panel toggle ──────────────────────────────────────────────

  const fxExpanded = useTimelineUIStore(
    (s) => s.expandedFxTrackId === track.id
  );
  const toggleExpandedFx = useTimelineUIStore((s) => s.toggleExpandedFx);
  const handleFxToggle = useCallback(() => {
    toggleExpandedFx(track.id);
  }, [toggleExpandedFx, track.id]);

  // ── Drag-reorder ──────────────────────────────────────────────────────────
  //
  // The grip is the HTML5 drag source; the whole header is the drop target.
  // Reordering is constrained to same-type tracks (see trackReorder). The drop
  // target / indicator state lives in the UI store so sibling headers can show
  // the insertion line; the per-header selector returns the edge only for the
  // hovered row, so other headers don't re-render on every dragover.

  const headerRef = useRef<HTMLDivElement>(null);
  const uiStoreApi = useTimelineUIStoreApi();
  const beginTrackDrag = useTimelineUIStore((s) => s.beginTrackDrag);
  const setTrackDropTarget = useTimelineUIStore((s) => s.setTrackDropTarget);
  const endTrackDrag = useTimelineUIStore((s) => s.endTrackDrag);
  const dropEdge = useTimelineUIStore((s) =>
    s.trackDropTarget?.trackId === track.id ? s.trackDropTarget.position : null
  );

  const handleDragStart = useCallback(
    (e: React.DragEvent) => {
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData(TRACK_DRAG_MIME, track.id);
      if (headerRef.current) {
        e.dataTransfer.setDragImage(headerRef.current, 12, 12);
      }
      beginTrackDrag(track.id);
    },
    [beginTrackDrag, track.id]
  );

  const handleDragEnd = useCallback(() => {
    endTrackDrag();
  }, [endTrackDrag]);

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      const draggingId = uiStoreApi.getState().draggingTrackId;
      if (!draggingId || draggingId === track.id) {
        return;
      }
      const dragged = timelineStoreApi
        .getState()
        .tracks.find((t) => t.id === draggingId);
      // Only accept same-type drops; a cross-type hover shows no indicator.
      if (!dragged || dragged.type !== track.type) {
        if (uiStoreApi.getState().trackDropTarget?.trackId === track.id) {
          setTrackDropTarget(null);
        }
        return;
      }
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      const rect = e.currentTarget.getBoundingClientRect();
      const position: TrackDropPosition =
        e.clientY < rect.top + rect.height / 2 ? "before" : "after";
      const current = uiStoreApi.getState().trackDropTarget;
      if (current?.trackId !== track.id || current.position !== position) {
        setTrackDropTarget({ trackId: track.id, position });
      }
    },
    [uiStoreApi, timelineStoreApi, setTrackDropTarget, track.id, track.type]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      const draggingId = uiStoreApi.getState().draggingTrackId;
      const position = uiStoreApi.getState().trackDropTarget?.position;
      endTrackDrag();
      if (!draggingId || !position) {
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      const ordered = computeReorderedTrackIds(
        timelineStoreApi.getState().tracks,
        draggingId,
        track.id,
        position
      );
      if (ordered) {
        reorderTracks(ordered);
      }
    },
    [uiStoreApi, timelineStoreApi, endTrackDrag, reorderTracks, track.id]
  );

  return (
    <>
    <div
      ref={headerRef}
      css={headerStyles(theme, heightPx)}
      data-testid={`track-header-${track.id}`}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {dropEdge && (
        <div
          css={dropIndicatorStyles(theme, dropEdge)}
          data-testid={`track-drop-indicator-${track.id}-${dropEdge}`}
          aria-hidden
        />
      )}
      {/* Top row: drag handle · type glyph · name · index chip */}
      <div css={topRowStyles}>
        <div
          css={dragHandleStyles(theme)}
          draggable
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          aria-label={`Reorder ${track.name}`}
          role="button"
          tabIndex={-1}
          title="Drag to reorder track"
          data-testid={`track-drag-handle-${track.id}`}
        >
          <DragIndicatorIcon />
        </div>
        <div
          css={typeGlyphStyles(theme, accent)}
          aria-hidden
          title={meta.label}
        >
          <TypeIcon />
        </div>
        <div css={nameWrapStyles}>
          <input
            ref={inputRef}
            css={nameInputStyles(theme)}
            value={editingName ? localName : track.name}
            readOnly={!editingName}
            onChange={(e) => setLocalName(e.target.value)}
            onDoubleClick={handleNameDoubleClick}
            onBlur={commitName}
            onKeyDown={handleNameKeyDown}
            aria-label={`Track name: ${track.name}`}
          />
          <span
            css={indexChipStyles(theme)}
            aria-label={`${meta.label} track ${typedIndex}`}
            title={`${meta.label} ${typedIndex}`}
          >
            {meta.prefix}
            {typedIndex}
          </span>
        </div>
      </div>

      {/* Controls row */}
      <div css={controlsRowStyles}>
        <Tooltip title={track.visible ? "Hide track" : "Show track"}>
          <button
            type="button"
            css={iconButtonStyles(theme, track.visible)}
            onClick={() => setTrackVisible(track.id, !track.visible)}
            aria-label={track.visible ? "Hide track" : "Show track"}
            aria-pressed={!track.visible}
          >
            {track.visible ? (
              <VisibilityOutlinedIcon />
            ) : (
              <VisibilityOffOutlinedIcon />
            )}
          </button>
        </Tooltip>

        <Tooltip title={track.locked ? "Unlock track" : "Lock track"}>
          <button
            type="button"
            css={iconButtonStyles(theme, !track.locked)}
            onClick={() => setTrackLocked(track.id, !track.locked)}
            aria-label={track.locked ? "Unlock track" : "Lock track"}
            aria-pressed={track.locked}
          >
            {track.locked ? <LockOutlinedIcon /> : <LockOpenOutlinedIcon />}
          </button>
        </Tooltip>

        {isAudioTrack && (
          <>
            <Tooltip title={track.muted ? "Unmute" : "Mute"} key="mute">
              <button
                type="button"
                css={iconButtonStyles(theme, !track.muted)}
                onClick={() => setTrackMuted(track.id, !track.muted)}
                aria-label={track.muted ? "Unmute" : "Mute"}
                aria-pressed={!!track.muted}
              >
                {track.muted ? <VolumeOffOutlinedIcon /> : <VolumeUpOutlinedIcon />}
              </button>
            </Tooltip>

            <Tooltip title={track.solo ? "Unsolo" : "Solo"}>
              <button
                type="button"
                css={iconButtonStyles(theme, !!track.solo)}
                onClick={() => setTrackSolo(track.id, !track.solo)}
                aria-label={track.solo ? "Unsolo" : "Solo"}
                aria-pressed={!!track.solo}
              >
                <span
                  style={{
                    fontSize: theme.fontSizeSmaller,
                    fontWeight: 600,
                    letterSpacing: "0.04em"
                  }}
                >
                  S
                </span>
              </button>
            </Tooltip>
          </>
        )}

        {supportsEffects && (
          <Tooltip
            title={
              effectsCount === 0
                ? "Effects chain (empty)"
                : `Effects chain (${effectsCount})`
            }
          >
            <button
              type="button"
              css={iconButtonStyles(theme, hasActiveEffects || fxExpanded)}
              onClick={handleFxToggle}
              aria-label={fxExpanded ? "Hide effects chain" : "Show effects chain"}
              aria-pressed={fxExpanded}
              data-testid={`track-fx-${track.id}`}
            >
              <GraphicEqOutlinedIcon />
            </button>
          </Tooltip>
        )}

        <Tooltip title="Remove track">
          <button
            type="button"
            css={iconButtonStyles(theme, true)}
            onClick={() => setConfirmRemoveOpen(true)}
            aria-label="Remove track"
          >
            <DeleteOutlineOutlinedIcon />
          </button>
        </Tooltip>
      </div>

      {/* Height resize handle */}
      <div
        css={resizeHandleStyles(theme)}
        onPointerDown={handleResizePointerDown}
        onPointerMove={handleResizePointerMove}
        onPointerUp={handleResizePointerEnd}
        onPointerCancel={handleResizePointerEnd}
        aria-label="Resize track height"
        role="separator"
        aria-orientation="horizontal"
      />
    </div>
    <ConfirmDialog
      open={confirmRemoveOpen}
      onClose={() => setConfirmRemoveOpen(false)}
      onConfirm={() => removeTrack(track.id)}
      title="Remove track"
      content={`Remove track "${track.name}" and all its clips?`}
      confirmText="Remove"
      cancelText="Cancel"
    />
    </>
  );
});

TrackHeader.displayName = "TrackHeader";
