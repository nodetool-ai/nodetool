/** @jsxImportSource @emotion/react */
/**
 * Clip
 *
 * Generic clip component — handles the "chrome":
 *   - Selection ring (highlighted border)
 *   - Drag region (move clip / change track)
 *   - Two trim handles (start/end edges)
 *   - Status badge slot (StatusIndicator)
 *
 * The clip body content (waveform, thumbnail, placeholder) is a future concern
 * handled by NOD-304/NOD-308 child renderers; this component only manages
 * geometry interactions.
 *
 * Performance: subscribes only to this clip's own state (id selector),
 * selection membership (id selector), and msPerPx.
 */

import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import LockIcon from "@mui/icons-material/Lock";

import type { TimelineClip, ClipStatus } from "@nodetool-ai/timeline";
import { useTimelineStore } from "../../../stores/timeline/TimelineStore";
import {
  useTimelineUIStore,
  useIsClipSelected
} from "../../../stores/timeline/TimelineUIStore";
import { useTimelinePlaybackStore } from "../../../stores/timeline/TimelinePlaybackStore";
import { useTimelineGenerationStore } from "../../../stores/timeline/TimelineGenerationStore";
import { useAssetStore } from "../../../stores/AssetStore";
import { getAssetUrl } from "../../../utils/assetHelpers";
import useErrorStore, { hasNodeError, nodeErrorToDisplayString } from "../../../stores/ErrorStore";
import { StatusIndicator } from "../../ui_primitives";
import type { StatusType } from "../../ui_primitives/StatusIndicator";
import { deriveClipStatus } from "../status/clipStatusReducer";
import type { ClipGenerationState, ClipErrorState } from "../status/clipStatusReducer";
import { useClipThumbnails } from "./useClipThumbnails";

// ── Constants ──────────────────────────────────────────────────────────────

const TRIM_HANDLE_WIDTH_PX = 8;
const SNAP_THRESHOLD_PX = 8;
const MIN_CLIP_WIDTH_PX = 4;

// ── Status mapping (PRD §5.5) ──────────────────────────────────────────────

const CLIP_STATUS_MAP: Record<ClipStatus, { status: StatusType; label: string; pulse: boolean }> = {
  draft: { status: "default", label: "Draft", pulse: false },
  queued: { status: "pending", label: "Queued", pulse: false },
  generating: { status: "pending", label: "Generating", pulse: true },
  generated: { status: "success", label: "Generated", pulse: false },
  stale: { status: "warning", label: "Stale", pulse: false },
  failed: { status: "error", label: "Failed", pulse: false },
  locked: { status: "info", label: "Locked", pulse: false },
  missing: { status: "error", label: "Missing", pulse: false }
};

// ── Styles ─────────────────────────────────────────────────────────────────

const clipStyles = (theme: Theme, selected: boolean, locked: boolean) =>
  css({
    position: "absolute",
    top: 4,
    bottom: 4,
    borderRadius: 4,
    overflow: "hidden",
    backgroundColor: theme.vars.palette.primary.dark,
    border: selected
      ? `2px solid ${theme.vars.palette.primary.light}`
      : `1px solid ${theme.vars.palette.primary.main}`,
    cursor: locked ? "not-allowed" : "grab",
    "&:active": {
      cursor: locked ? "not-allowed" : "grabbing"
    },
    userSelect: "none",
    touchAction: "none",
    minWidth: MIN_CLIP_WIDTH_PX,
    boxSizing: "border-box",
    display: "flex",
    flexDirection: "column",
    justifyContent: "flex-end",
    padding: "2px 4px"
  });

const clipNameStyles = (theme: Theme) =>
  css({
    fontSize: 11,
    color: theme.vars.palette.primary.contrastText,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    pointerEvents: "none",
    lineHeight: 1.2,
    position: "relative",
    zIndex: 1,
    textShadow: "0 1px 2px rgba(0,0,0,0.6)"
  });

const filmstripStyles = css({
  position: "absolute",
  inset: 0,
  display: "flex",
  pointerEvents: "none",
  zIndex: 0
});

const filmstripCellStyles = (url: string, withDivider: boolean) =>
  css({
    flex: 1,
    height: "100%",
    backgroundImage: `url(${url})`,
    backgroundSize: "cover",
    backgroundPosition: "center",
    opacity: 0.7,
    borderRight: withDivider ? "1px solid rgba(0,0,0,0.2)" : "none"
  });

const trimHandleStyles = (
  theme: Theme,
  edge: "start" | "end",
  locked: boolean
) =>
  css({
    position: "absolute",
    top: 0,
    bottom: 0,
    width: TRIM_HANDLE_WIDTH_PX,
    [edge === "start" ? "left" : "right"]: 0,
    cursor: locked ? "not-allowed" : "ew-resize",
    backgroundColor: "rgba(255,255,255,0.2)",
    "&:hover": {
      backgroundColor: locked ? undefined : "rgba(255,255,255,0.4)"
    },
    zIndex: 2
  });

const statusBadgeStyles = css({
  position: "absolute",
  top: 3,
  right: 4,
  zIndex: 3,
  pointerEvents: "none"
});

const lockIconStyles = css({
  position: "absolute",
  top: 3,
  left: 4,
  zIndex: 3,
  pointerEvents: "none",
  opacity: 0.85,
  fontSize: 12,
  display: "flex",
  alignItems: "center"
});

// ── Component ──────────────────────────────────────────────────────────────

export interface ClipProps {
  clipId: string;
}

export const Clip: React.FC<ClipProps> = memo(({ clipId }) => {
  const theme = useTheme();

  // Selector: only this clip's fields
  const clip = useTimelineStore(
    (s) => s.clips.find((c) => c.id === clipId) as TimelineClip | undefined
  );

  const isSelected = useIsClipSelected(clipId);
  const msPerPx = useTimelineUIStore((s) => s.msPerPx);
  const scrollLeftPx = useTimelineUIStore((s) => s.scrollLeftPx);

  const selectClip = useTimelineUIStore((s) => s.selectClip);
  const addToSelection = useTimelineUIStore((s) => s.addToSelection);
  const toggleSelection = useTimelineUIStore((s) => s.toggleSelection);

  const moveClip = useTimelineStore((s) => s.moveClip);
  const moveSelectedClips = useTimelineStore((s) => s.moveSelectedClips);
  const trimClipStart = useTimelineStore((s) => s.trimClipStart);
  const trimClipEnd = useTimelineStore((s) => s.trimClipEnd);

  // ── Derived status (PRD §5.5) ────────────────────────────────────────────

  // Generation state from TimelineGenerationStore (queued/running/failed job).
  const rawJobState = useTimelineGenerationStore(
    (s) => s.clipJobs[clipId] ?? null
  );
  const generationState: ClipGenerationState | null = useMemo(() => {
    if (!rawJobState || rawJobState.status === "completed") {
      return null;
    }
    return { status: rawJobState.status as ClipGenerationState["status"] };
  }, [rawJobState]);

  // Node-level errors from ErrorStore, keyed by the clip's workflowId.
  const workflowId = clip?.workflowId;
  const errorEntries = useErrorStore((s) => s.errors);
  const errorState: ClipErrorState | null = useMemo(() => {
    if (!workflowId) {
      return null;
    }
    const prefix = `${workflowId}:`;
    for (const key of Object.keys(errorEntries)) {
      if (key.startsWith(prefix) && hasNodeError(errorEntries[key])) {
        return {
          hasError: true,
          message: nodeErrorToDisplayString(errorEntries[key])
        };
      }
    }
    return null;
  }, [workflowId, errorEntries]);

  // Derive the displayed status badge.
  // For the "missing" check we trust clip.currentAssetId: if it's set,
  // the asset is assumed present unless the generation store knows otherwise.
  // A full async asset-existence check would require React Query per-clip,
  // which is handled separately by the PreviewCompositor.
  const derivedStatus: ClipStatus = useMemo(() => {
    if (!clip) {
      return "draft";
    }
    return deriveClipStatus(clip, generationState, errorState, true);
  }, [clip, generationState, errorState]);

  // ── Drag (move) ─────────────────────────────────────────────────────────

  const dragStartXRef = useRef(0);
  const dragStartMsRef = useRef(0);
  const isDraggingRef = useRef(false);

  const handleDragPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!clip || clip.locked) {
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      e.currentTarget.setPointerCapture(e.pointerId);
      dragStartXRef.current = e.clientX;
      dragStartMsRef.current = clip.startMs;
      isDraggingRef.current = false;
    },
    [clip]
  );

  const handleDragPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!clip || clip.locked || e.buttons !== 1) {
        return;
      }
      const deltaPx = e.clientX - dragStartXRef.current;
      if (!isDraggingRef.current && Math.abs(deltaPx) < 3) {
        return;
      }
      isDraggingRef.current = true;
      const disableSnap = e.altKey;

      // Build snap candidates lazily — avoids subscribing to allClips/currentTimeMs
      // in render, which would re-render every Clip on any clip state change.
      const { clips: allClips, durationMs } = useTimelineStore.getState();
      const { currentTimeMs } = useTimelinePlaybackStore.getState();
      const snapCandidatesSet = new Set<number>();
      snapCandidatesSet.add(currentTimeMs);
      for (let t = 0; t <= durationMs + 1000; t += 1000) {
        snapCandidatesSet.add(t);
      }
      for (const c of allClips) {
        if (c.id !== clip.id) {
          snapCandidatesSet.add(c.startMs);
          snapCandidatesSet.add(c.startMs + c.durationMs);
        }
      }
      const snapCandidates = Array.from(snapCandidatesSet);

      // Compute a position-independent delta: how many ms the pointer has moved
      // from drag-start, minus any drift already applied to clip.startMs by
      // previous frames. This avoids accumulating floating-point error across
      // many intermediate PointerMove events.
      const pointerMs = deltaPx * msPerPx;
      const alreadyAppliedMs = clip.startMs - dragStartMsRef.current;
      const adjustedDeltaMs = pointerMs - alreadyAppliedMs;

      // Read selection lazily to avoid re-subscribing the entire Clip on selection changes.
      const { selectedClipIds } = useTimelineUIStore.getState();

      if (isSelected && selectedClipIds.size > 1) {
        moveSelectedClips(
          clip.id,
          selectedClipIds,
          adjustedDeltaMs,
          undefined,
          snapCandidates,
          msPerPx,
          disableSnap
        );
      } else {
        moveClip(
          clip.id,
          adjustedDeltaMs,
          undefined,
          snapCandidates,
          msPerPx,
          disableSnap
        );
      }
    },
    [
      clip,
      msPerPx,
      isSelected,
      moveClip,
      moveSelectedClips
    ]
  );

  const handleDragPointerUp = useCallback(() => {
    isDraggingRef.current = false;
  }, []);

  // ── Click (selection) ───────────────────────────────────────────────────

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      if (isDraggingRef.current) {
        return;
      }
      e.stopPropagation();
      if (e.shiftKey) {
        addToSelection(clipId);
      } else if (e.ctrlKey || e.metaKey) {
        toggleSelection(clipId);
      } else {
        selectClip(clipId);
      }
    },
    [clipId, selectClip, addToSelection, toggleSelection]
  );

  // ── Trim start ──────────────────────────────────────────────────────────

  const trimStartRef = useRef({ startX: 0, startMs: 0 });

  const handleTrimStartPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!clip || clip.locked) {
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      e.currentTarget.setPointerCapture(e.pointerId);
      trimStartRef.current = { startX: e.clientX, startMs: clip.startMs };
    },
    [clip]
  );

  const handleTrimStartPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!clip || clip.locked || e.buttons !== 1) {
        return;
      }
      // Stop bubbling so the parent clip body's drag-pointermove handler
      // does not also fire and shift `startMs`. Without this the clip
      // appears to move and shrink simultaneously.
      e.stopPropagation();
      const deltaPx = e.clientX - trimStartRef.current.startX;
      const deltaMs = deltaPx * msPerPx;
      // trimClip(edge="start", deltaMs) convention (from packages/timeline/src/trimClip.ts):
      //   nextStartMs   = clip.startMs  - deltaMs   (positive = move start right = shrink)
      //   nextDurationMs = clip.durationMs + deltaMs  (positive = grow from start)
      // So: pointer moving right (+deltaPx) should shrink the clip from the start.
      // We negate so that dragging the handle right correctly shrinks the clip start.
      trimClipStart(clip.id, -deltaMs);
      trimStartRef.current.startX = e.clientX;
    },
    [clip, msPerPx, trimClipStart]
  );

  // ── Trim end ────────────────────────────────────────────────────────────

  const trimEndRef = useRef({ startX: 0, startMs: 0, startDuration: 0 });

  const handleTrimEndPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!clip || clip.locked) {
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      e.currentTarget.setPointerCapture(e.pointerId);
      trimEndRef.current = {
        startX: e.clientX,
        startMs: clip.startMs,
        startDuration: clip.durationMs
      };
    },
    [clip]
  );

  const handleTrimEndPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!clip || clip.locked || e.buttons !== 1) {
        return;
      }
      // Stop bubbling so the parent clip body's drag-pointermove handler
      // does not also fire and shift `startMs`. Without this the clip
      // appears to move and grow simultaneously.
      e.stopPropagation();
      const deltaPx = e.clientX - trimEndRef.current.startX;
      const deltaMs = deltaPx * msPerPx;
      trimClipEnd(clip.id, deltaMs);
      trimEndRef.current.startX = e.clientX;
    },
    [clip, msPerPx, trimClipEnd]
  );

  if (!clip) {
    return null;
  }

  const leftPx = clip.startMs / msPerPx - scrollLeftPx;
  const widthPx = Math.max(MIN_CLIP_WIDTH_PX, clip.durationMs / msPerPx);

  const statusInfo = CLIP_STATUS_MAP[derivedStatus];

  return (
    <ClipBody
      clip={clip}
      leftPx={leftPx}
      widthPx={widthPx}
      isSelected={isSelected}
      derivedStatus={derivedStatus}
      statusInfo={statusInfo}
      handleDragPointerDown={handleDragPointerDown}
      handleDragPointerMove={handleDragPointerMove}
      handleDragPointerUp={handleDragPointerUp}
      handleClick={handleClick}
      handleTrimStartPointerDown={handleTrimStartPointerDown}
      handleTrimStartPointerMove={handleTrimStartPointerMove}
      handleTrimEndPointerDown={handleTrimEndPointerDown}
      handleTrimEndPointerMove={handleTrimEndPointerMove}
    />
  );
});

interface ClipBodyProps {
  clip: TimelineClip;
  leftPx: number;
  widthPx: number;
  isSelected: boolean;
  derivedStatus: ClipStatus;
  statusInfo: typeof CLIP_STATUS_MAP[ClipStatus];
  handleDragPointerDown: (e: React.PointerEvent<HTMLDivElement>) => void;
  handleDragPointerMove: (e: React.PointerEvent<HTMLDivElement>) => void;
  handleDragPointerUp: (e: React.PointerEvent<HTMLDivElement>) => void;
  handleClick: (e: React.MouseEvent<HTMLDivElement>) => void;
  handleTrimStartPointerDown: (e: React.PointerEvent<HTMLDivElement>) => void;
  handleTrimStartPointerMove: (e: React.PointerEvent<HTMLDivElement>) => void;
  handleTrimEndPointerDown: (e: React.PointerEvent<HTMLDivElement>) => void;
  handleTrimEndPointerMove: (e: React.PointerEvent<HTMLDivElement>) => void;
}

const ClipBody: React.FC<ClipBodyProps> = ({
  clip,
  leftPx,
  widthPx,
  isSelected,
  derivedStatus,
  statusInfo,
  handleDragPointerDown,
  handleDragPointerMove,
  handleDragPointerUp,
  handleClick,
  handleTrimStartPointerDown,
  handleTrimStartPointerMove,
  handleTrimEndPointerDown,
  handleTrimEndPointerMove
}) => {
  const theme = useTheme();
  const clipId = clip.id;

  // Resolve asset URL for thumbnail extraction. Only video clips trigger
  // a fetch — image clips are handled below with a single backgroundImage.
  const assetIdForThumb =
    clip.mediaType === "video" || clip.mediaType === "overlay"
      ? clip.currentAssetId
      : undefined;
  const imageAssetId =
    clip.mediaType === "image" ? clip.currentAssetId : undefined;

  const getAsset = useAssetStore((s) => s.get);
  const [videoUrl, setVideoUrl] = useState<string | undefined>(undefined);
  const [imageUrl, setImageUrl] = useState<string | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    if (!assetIdForThumb) {
      setVideoUrl(undefined);
      return;
    }
    getAsset(assetIdForThumb)
      .then((asset) => {
        if (!cancelled) setVideoUrl(getAssetUrl(asset) ?? undefined);
      })
      .catch(() => {
        // Asset unavailable — leave url undefined; clip renders without filmstrip.
      });
    return () => {
      cancelled = true;
    };
  }, [assetIdForThumb, getAsset]);

  useEffect(() => {
    let cancelled = false;
    if (!imageAssetId) {
      setImageUrl(undefined);
      return;
    }
    getAsset(imageAssetId)
      .then((asset) => {
        if (!cancelled) setImageUrl(getAssetUrl(asset) ?? undefined);
      })
      .catch(() => {
        // ignored
      });
    return () => {
      cancelled = true;
    };
  }, [imageAssetId, getAsset]);

  const thumbnails = useClipThumbnails(videoUrl);
  // openreel uses ~60px per cell; matches their visual density.
  const cellCount = Math.max(1, Math.floor(widthPx / 60));

  const filmstripCells = useMemo(() => {
    if (!thumbnails || thumbnails.length === 0) return null;
    const cells: { url: string }[] = [];
    for (let i = 0; i < cellCount; i++) {
      const progress = cellCount === 1 ? 0 : i / (cellCount - 1);
      const idx = Math.min(
        Math.floor(progress * thumbnails.length),
        thumbnails.length - 1
      );
      cells.push({ url: thumbnails[idx].dataUrl });
    }
    return cells;
  }, [thumbnails, cellCount]);

  return (
    <div
      css={clipStyles(theme, isSelected, clip.locked)}
      style={{ left: leftPx, width: widthPx }}
      onPointerDown={handleDragPointerDown}
      onPointerMove={handleDragPointerMove}
      onPointerUp={handleDragPointerUp}
      onClick={handleClick}
      data-testid={`clip-${clipId}`}
      aria-selected={isSelected}
      role="option"
      aria-label={clip.name || `Clip ${clip.id}`}
    >
      {filmstripCells && (
        <div css={filmstripStyles}>
          {filmstripCells.map((cell, i) => (
            <div
              key={i}
              css={filmstripCellStyles(cell.url, i < filmstripCells.length - 1)}
            />
          ))}
        </div>
      )}

      {imageUrl && (
        <div
          css={filmstripStyles}
          style={{
            backgroundImage: `url(${imageUrl})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
            opacity: 0.7
          }}
        />
      )}

      <div
        css={trimHandleStyles(theme, "start", clip.locked)}
        onPointerDown={handleTrimStartPointerDown}
        onPointerMove={handleTrimStartPointerMove}
        aria-label="Trim clip start"
        data-testid={`clip-trim-start-${clipId}`}
      />

      <div
        css={trimHandleStyles(theme, "end", clip.locked)}
        onPointerDown={handleTrimEndPointerDown}
        onPointerMove={handleTrimEndPointerMove}
        aria-label="Trim clip end"
        data-testid={`clip-trim-end-${clipId}`}
      />

      {clip.locked && (
        <div css={lockIconStyles}>
          <LockIcon sx={{ fontSize: 12 }} aria-label="Clip locked" />
        </div>
      )}

      {derivedStatus !== "draft" && (
        <div css={statusBadgeStyles}>
          <StatusIndicator
            status={statusInfo.status}
            pulse={statusInfo.pulse}
            tooltip={statusInfo.label}
            size="small"
          />
        </div>
      )}

      <div css={clipNameStyles(theme)}>{clip.name}</div>
    </div>
  );
};

Clip.displayName = "Clip";
