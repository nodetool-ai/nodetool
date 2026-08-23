/** @jsxImportSource @emotion/react */
/**
 * TrackHeader
 *
 * Left-hand strip showing track metadata and controls:
 *   - Type glyph + name + index chip (V1, A1, …) on the top row
 *   - Visibility / lock / mute / solo / fx / delete row beneath
 *   - Height resize handle at the bottom edge
 */

import React, { memo, useCallback, useMemo, useRef, useState } from "react";
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
  useTimelineStoreApi
} from "../../../stores/timeline/TimelineStore";
import { useTimelineHistoryBatch } from "../../../stores/timeline/useTimelineHistoryBatch";
import {
  useTimelineUIStore,
  useTimelineUIStoreApi
} from "../../../stores/timeline/TimelineUIStore";
import {
  computeReorderedTrackIds,
  type TrackDropPosition
} from "./trackReorder";
import { Tooltip, MOTION, BORDER_RADIUS, FONT_SIZE_SANS, FONT_SIZE_MONO, FONT_WEIGHT, SPACING, getSpacingPx, Z_INDEX } from "../../ui_primitives";
import { DEFAULT_TRACK_HEIGHT_PX as SHARED_DEFAULT_TRACK_HEIGHT_PX } from "./trackHeight";
import {
  trackTypeMeta,
  trackTypeAccent
} from "./trackVisuals";
import ConfirmDialog from "../../dialogs/ConfirmDialog";

export const TRACK_HEADER_WIDTH_PX = 192;
/**
 * Phone header width. 192px is half a 390px viewport — the lanes get less room
 * than the labels. 132px is the narrowest that still fits the full control row
 * (five 24px buttons + padding) once the reorder grip is dropped.
 */
export const MOBILE_TRACK_HEADER_WIDTH_PX = 132;
/**
 * The header width is read by four separate style blocks across three files
 * (this header, the script lane header, the TRACKS label, the lane offsets).
 * TracksRegion sets this custom property on its container so all of them
 * follow one value without threading a prop through every layer.
 */
export const TRACK_HEADER_WIDTH_VAR = "--timeline-track-header-width";
export const trackHeaderWidthCss = `var(${TRACK_HEADER_WIDTH_VAR}, ${TRACK_HEADER_WIDTH_PX}px)`;
/**
 * Private drag MIME for track-reorder drags. Distinct from the asset-drop
 * types ("asset" / "selectedAssetIds") so the lane/empty-area asset-drop
 * handlers never react to a track being reordered.
 */
const TRACK_DRAG_MIME = "application/x-nodetool-timeline-track";
const MIN_TRACK_HEIGHT_PX = 48;
const MAX_TRACK_HEIGHT_PX = 300;
const DEFAULT_TRACK_HEIGHT_PX = SHARED_DEFAULT_TRACK_HEIGHT_PX;
const RESIZE_HANDLE_HEIGHT_PX = 6;

const headerStyles = (theme: Theme, heightPx: number, compact: boolean) =>
  css({
    position: "relative",
    width: trackHeaderWidthCss,
    height: heightPx,
    flexShrink: 0,
    display: "flex",
    flexDirection: "column",
    justifyContent: "space-between",
    padding: compact
      ? `${getSpacingPx(SPACING.xs)} ${getSpacingPx(SPACING.sm)}`
      : `${getSpacingPx(SPACING.lg)} ${getSpacingPx(SPACING.lg)} ${getSpacingPx(SPACING.lg)}`,
    backgroundColor: theme.vars.palette.background.default,
    borderBottom: `1px solid ${theme.vars.palette.divider}`,
    overflow: "hidden",
    userSelect: "none"
  });

const topRowStyles = css({
  display: "flex",
  flexDirection: "row",
  alignItems: "center",
  gap: getSpacingPx(SPACING.md),
  minWidth: 0
});

const dragHandleStyles = (theme: Theme) =>
  css({
    flexShrink: 0,
    width: 16,
    marginLeft: `-${getSpacingPx(SPACING.sm)}`,
    marginRight: `-${getSpacingPx(SPACING.micro)}`,
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
    zIndex: Z_INDEX.base + 3,
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
  gap: getSpacingPx(SPACING.sm)
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
    padding: `0 ${getSpacingPx(SPACING.sm)}`,
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

const controlsRowStyles = (compact: boolean) =>
  css({
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
    gap: getSpacingPx(compact ? SPACING.none : SPACING.micro),
    // align icon edges flush with the type glyph
    marginLeft: compact ? 0 : `-${getSpacingPx(SPACING.xs)}`,
    // An audio track carries six controls (visible, lock, mute, solo, fx,
    // delete), which is more than a 132px header fits. Scroll the row rather
    // than clip it — the header's `overflow: hidden` would otherwise drop
    // delete and the effects chain with no way to reach them on a phone.
    ...(compact
      ? {
          overflowX: "auto" as const,
          scrollbarWidth: "none" as const,
          "&::-webkit-scrollbar": { display: "none" },
          "& > *": { flexShrink: 0 }
        }
      : null)
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

interface TrackHeaderProps {
  track: TimelineTrack;
  /** Pre-computed 1-based index within the track's type group. */
  typedIndex: number;
  /**
   * Phone layout: tighter padding, and the type glyph and reorder grip give up
   * their space to the name. The grip is no loss — it drives HTML5 drag-and-
   * drop, which doesn't fire from touch — and the index chip (V1 / A1) already
   * carries the type the glyph was showing.
   */
  compact?: boolean;
}

export const TrackHeader: React.FC<TrackHeaderProps> = memo(({ track, typedIndex, compact = false }) => {
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

  const dragStartYRef = useRef(0);
  const dragStartHeightRef = useRef(heightPx);
  // Gesture-ownership flag: the move handler only runs when this handle's
  // pointerdown started the gesture (not when another drag passes over it).
  const isResizingRef = useRef(false);

  const timelineStoreApi = useTimelineStoreApi();

  // Undo batching: begin on pointerdown, mark() after each mutation (pauses
  // history once the pre-resize state is checkpointed), end() on pointerup, so
  // the whole resize collapses into one undo entry.
  const history = useTimelineHistoryBatch();

  const handleResizePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      e.currentTarget.setPointerCapture(e.pointerId);
      dragStartYRef.current = e.clientY;
      dragStartHeightRef.current = heightPx;
      isResizingRef.current = true;
      history.begin();
    },
    [heightPx, history]
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
      // First effective mutation recorded the pre-resize state; batch the rest.
      history.mark();
    },
    [setTrackHeight, track.id, history]
  );

  const handleResizePointerEnd = useCallback(() => {
    isResizingRef.current = false;
    history.end();
  }, [history]);

  const isAudioTrack = track.type === "audio";
  const supportsEffects =
    track.type === "audio" || track.type === "video";
  const effectsCount = track.effects?.length ?? 0;
  const hasActiveEffects =
    track.effects?.some((e) => e.enabled) ?? false;

  const fxExpanded = useTimelineUIStore(
    (s) => s.expandedFxTrackId === track.id
  );
  const toggleExpandedFx = useTimelineUIStore((s) => s.toggleExpandedFx);
  const handleFxToggle = useCallback(() => {
    toggleExpandedFx(track.id);
  }, [toggleExpandedFx, track.id]);

  // Drag-reorder: the grip is the HTML5 drag source; the whole header is the drop target.
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

  // A resize drag re-renders this per pointermove, one header per track. Only
  // the root style reads heightPx; the six icon buttons share two variants.
  const headerCss = useMemo(
    () => headerStyles(theme, heightPx, compact),
    [theme, heightPx, compact]
  );
  const dropIndicatorCss = useMemo(
    () => (dropEdge ? dropIndicatorStyles(theme, dropEdge) : undefined),
    [theme, dropEdge]
  );
  const dragHandleCss = useMemo(() => dragHandleStyles(theme), [theme]);
  const typeGlyphCss = useMemo(
    () => typeGlyphStyles(theme, accent),
    [theme, accent]
  );
  const nameInputCss = useMemo(() => nameInputStyles(theme), [theme]);
  const indexChipCss = useMemo(() => indexChipStyles(theme), [theme]);
  const controlsRowCss = useMemo(() => controlsRowStyles(compact), [compact]);
  const iconButtonOnCss = useMemo(() => iconButtonStyles(theme, true), [theme]);
  const iconButtonOffCss = useMemo(
    () => iconButtonStyles(theme, false),
    [theme]
  );
  const resizeHandleCss = useMemo(() => resizeHandleStyles(theme), [theme]);

  return (
    <>
    <div
      ref={headerRef}
      css={headerCss}
      data-testid={`track-header-${track.id}`}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {dropEdge && (
        <div
          css={dropIndicatorCss}
          data-testid={`track-drop-indicator-${track.id}-${dropEdge}`}
          aria-hidden
        />
      )}
      {/* Top row: drag handle · type glyph · name · index chip */}
      <div css={topRowStyles}>
        {!compact && (
          <>
            <div
              css={dragHandleCss}
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
              css={typeGlyphCss}
              aria-hidden
              title={meta.label}
            >
              <TypeIcon />
            </div>
          </>
        )}
        <div css={nameWrapStyles}>
          <input
            ref={inputRef}
            css={nameInputCss}
            value={editingName ? localName : track.name}
            readOnly={!editingName}
            onChange={(e) => setLocalName(e.target.value)}
            onDoubleClick={handleNameDoubleClick}
            onBlur={commitName}
            onKeyDown={handleNameKeyDown}
            aria-label={`Track name: ${track.name}`}
          />
          <span
            css={indexChipCss}
            aria-label={`${meta.label} track ${typedIndex}`}
            title={`${meta.label} ${typedIndex}`}
          >
            {meta.prefix}
            {typedIndex}
          </span>
        </div>
      </div>

      {/* Controls row */}
      <div
        css={controlsRowCss}
        className={compact ? "timeline-track-controls" : undefined}
      >
        <Tooltip title={track.visible ? "Hide track" : "Show track"}>
          <button
            type="button"
            css={track.visible ? iconButtonOnCss : iconButtonOffCss}
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
            css={track.locked ? iconButtonOffCss : iconButtonOnCss}
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
                css={track.muted ? iconButtonOffCss : iconButtonOnCss}
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
                css={track.solo ? iconButtonOnCss : iconButtonOffCss}
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
              css={hasActiveEffects || fxExpanded ? iconButtonOnCss : iconButtonOffCss}
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
            css={iconButtonOnCss}
            onClick={() => setConfirmRemoveOpen(true)}
            aria-label="Remove track"
          >
            <DeleteOutlineOutlinedIcon />
          </button>
        </Tooltip>
      </div>

      {/* Height resize handle */}
      <div
        css={resizeHandleCss}
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
