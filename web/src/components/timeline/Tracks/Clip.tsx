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

import type { TimelineClip, TimelineTrack, ClipStatus } from "@nodetool-ai/timeline";
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
import { useAudioPeaks } from "./useAudioPeaks";
import { samplePeaksWindow } from "./audioPeaks";
import { isCompatibleWithTrack } from "../dnd/assetToClipAdapter";

/** Clip-side wrapper: TimelineClip.mediaType also includes "overlay";
 *  treat those as video-track-compatible. */
function isClipCompatibleWithTrack(
  clipMediaType: TimelineClip["mediaType"],
  trackType: TimelineTrack["type"]
): boolean {
  if (clipMediaType === "overlay") {
    return trackType === "video" || trackType === "overlay";
  }
  return isCompatibleWithTrack(clipMediaType, trackType);
}

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

const waveformStyles = css({
  position: "absolute",
  inset: 0,
  pointerEvents: "none",
  zIndex: 0,
  display: "block",
  width: "100%",
  height: "100%"
});

interface WaveformCanvasProps {
  url: string | undefined;
  inPointMs: number;
  outPointMs: number;
  widthPx: number;
}

/** Draws audio peaks on a canvas, sized to the clip's pixel width. */
const WaveformCanvas: React.FC<WaveformCanvasProps> = ({
  url,
  inPointMs,
  outPointMs,
  widthPx
}) => {
  const theme = useTheme();
  const { peaks, durationMs } = useAudioPeaks(url);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
    const cssWidth = Math.max(1, Math.floor(widthPx));
    const cssHeight = canvas.clientHeight || 32;
    canvas.width = cssWidth * dpr;
    canvas.height = cssHeight * dpr;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, cssWidth, cssHeight);

    if (!peaks || !durationMs) return;

    // Visible audio window is the intersection of [inPointMs, outPointMs]
    // with the source [0, durationMs]. Anything beyond the source renders
    // as empty space rather than stretching the waveform.
    const visibleInMs = Math.max(0, Math.min(durationMs, inPointMs));
    const visibleOutMs = Math.max(visibleInMs, Math.min(durationMs, outPointMs));
    const clipSpanMs = Math.max(1, outPointMs - inPointMs);
    const visibleSpanMs = visibleOutMs - visibleInMs;
    const visibleWidthPx = cssWidth * (visibleSpanMs / clipSpanMs);

    const barCount = Math.max(1, Math.floor(visibleWidthPx / 2));
    const slice = samplePeaksWindow(
      peaks,
      durationMs,
      visibleInMs,
      visibleOutMs,
      barCount
    );
    const mid = cssHeight / 2;
    ctx.fillStyle = theme.vars.palette.primary.main;
    for (let i = 0; i < slice.length; i += 1) {
      const amp = slice[i];
      const h = Math.max(1, amp * (cssHeight - 2));
      const x = (i / slice.length) * visibleWidthPx;
      const w = Math.max(1, visibleWidthPx / slice.length - 0.5);
      ctx.fillRect(x, mid - h / 2, w, h);
    }
  }, [peaks, durationMs, inPointMs, outPointMs, widthPx, theme]);

  return <canvas ref={canvasRef} css={waveformStyles} aria-hidden />;
};
WaveformCanvas.displayName = "WaveformCanvas";

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
  const splitClipAtTime = useTimelineStore((s) => s.splitClipAtTime);
  const activeTool = useTimelineUIStore((s) => s.activeTool);

  // Source-duration cap for trim-end. Only enforced for audio clips —
  // extending past the source has no sensible result (the playback engine
  // stops at outPointMs and the waveform visually stretches).
  //
  // We resolve the URL here and decode the buffer via useAudioPeaks so the
  // cap reflects the *actual* decoded duration rather than asset metadata
  // (which can be null for some assets). The result is cached per URL.
  const getAssetFromStore = useAssetStore((s) => s.get);
  const [resolvedAudioUrl, setResolvedAudioUrl] = useState<string | undefined>(
    undefined
  );
  useEffect(() => {
    if (clip?.mediaType !== "audio" || !clip.currentAssetId) {
      setResolvedAudioUrl(undefined);
      return;
    }
    let cancelled = false;
    getAssetFromStore(clip.currentAssetId)
      .then((asset) => {
        if (!cancelled) setResolvedAudioUrl(getAssetUrl(asset) ?? undefined);
      })
      .catch(() => {
        // Asset unavailable — leave cap unset; trim falls back to free behavior.
      });
    return () => {
      cancelled = true;
    };
  }, [clip?.mediaType, clip?.currentAssetId, getAssetFromStore]);

  const { durationMs: decodedAudioDurationMs } = useAudioPeaks(resolvedAudioUrl);
  const audioSourceDurationMs =
    clip?.mediaType === "audio" && decodedAudioDurationMs
      ? decodedAudioDurationMs
      : undefined;

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
      // Cut tool: split the clip at the pointer's ms position instead of
      // initiating a drag. Skip primary-button check so pen/touch also work.
      if (activeTool === "cut" && e.button === 0) {
        e.preventDefault();
        e.stopPropagation();
        const rect = e.currentTarget.getBoundingClientRect();
        const localPx = e.clientX - rect.left;
        const atMs = clip.startMs + localPx * msPerPx;
        // Refuse no-op splits at the clip boundaries.
        if (atMs > clip.startMs && atMs < clip.startMs + clip.durationMs) {
          splitClipAtTime(clip.id, atMs);
        }
        return;
      }
      e.preventDefault();
      e.stopPropagation();

      // We use window-level pointer listeners (not setPointerCapture on this
      // element) because moveClip(id, _, toTrackId) re-parents the clip into
      // a different TrackLane mid-drag, which would unmount the captured
      // element and abort the gesture. Window listeners survive remounts.
      dragStartXRef.current = e.clientX;
      dragStartMsRef.current = clip.startMs;
      isDraggingRef.current = false;

      const onMove = (ev: PointerEvent) => {
        if (ev.buttons !== 1) return;
        const freshClip = useTimelineStore
          .getState()
          .clips.find((c) => c.id === clipId);
        if (!freshClip || freshClip.locked) return;

        const deltaPx = ev.clientX - dragStartXRef.current;
        if (!isDraggingRef.current && Math.abs(deltaPx) < 3) {
          return;
        }
        isDraggingRef.current = true;
        const disableSnap = ev.altKey;

        const { clips: allClips, durationMs } = useTimelineStore.getState();
        const { currentTimeMs } = useTimelinePlaybackStore.getState();
        const snapCandidatesSet = new Set<number>();
        snapCandidatesSet.add(currentTimeMs);
        for (let t = 0; t <= durationMs + 1000; t += 1000) {
          snapCandidatesSet.add(t);
        }
        for (const c of allClips) {
          if (c.id !== freshClip.id) {
            snapCandidatesSet.add(c.startMs);
            snapCandidatesSet.add(c.startMs + c.durationMs);
          }
        }
        const snapCandidates = Array.from(snapCandidatesSet);

        const pointerMs = deltaPx * msPerPx;
        const alreadyAppliedMs = freshClip.startMs - dragStartMsRef.current;
        const adjustedDeltaMs = pointerMs - alreadyAppliedMs;

        const { selectedClipIds } = useTimelineUIStore.getState();
        const isMulti =
          selectedClipIds.has(freshClip.id) && selectedClipIds.size > 1;

        // Cross-track hit-test (single-clip drags only). Commit the track
        // change immediately so the clip visually follows the cursor into
        // the new lane.
        let crossTrackTargetId: string | undefined;
        if (!isMulti) {
          const elements = document.elementsFromPoint(ev.clientX, ev.clientY);
          let foundLaneId: string | null = null;
          for (const el of elements) {
            if (!(el instanceof HTMLElement)) continue;
            const lane = el.closest<HTMLElement>(
              "[data-testid^='track-lane-']"
            );
            if (lane) {
              foundLaneId =
                lane.dataset.testid?.slice("track-lane-".length) ?? null;
              break;
            }
          }
          if (foundLaneId && foundLaneId !== freshClip.trackId) {
            const targetTrack = useTimelineStore
              .getState()
              .tracks.find((t) => t.id === foundLaneId);
            if (
              targetTrack &&
              !targetTrack.locked &&
              isClipCompatibleWithTrack(freshClip.mediaType, targetTrack.type)
            ) {
              crossTrackTargetId = targetTrack.id;
            }
          }
        }

        if (isMulti) {
          moveSelectedClips(
            freshClip.id,
            selectedClipIds,
            adjustedDeltaMs,
            undefined,
            snapCandidates,
            msPerPx,
            disableSnap
          );
        } else {
          moveClip(
            freshClip.id,
            adjustedDeltaMs,
            crossTrackTargetId,
            snapCandidates,
            msPerPx,
            disableSnap
          );
        }
      };

      const onUpOrCancel = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUpOrCancel);
        window.removeEventListener("pointercancel", onUpOrCancel);
        // Defer dragging flag reset so the synthetic click that follows
        // pointerup is still suppressed by handleClick.
        const wasDragging = isDraggingRef.current;
        if (wasDragging) {
          setTimeout(() => {
            isDraggingRef.current = false;
          }, 0);
        } else {
          isDraggingRef.current = false;
        }
      };

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUpOrCancel);
      window.addEventListener("pointercancel", onUpOrCancel);
    },
    [
      clip,
      activeTool,
      msPerPx,
      splitClipAtTime,
      clipId,
      moveClip,
      moveSelectedClips
    ]
  );

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
      // In cut mode, let the event bubble up so the clip body splits instead.
      if (activeTool === "cut") {
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      e.currentTarget.setPointerCapture(e.pointerId);
      trimStartRef.current = { startX: e.clientX, startMs: clip.startMs };
    },
    [clip, activeTool]
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
      // In cut mode, let the event bubble up so the clip body splits instead.
      if (activeTool === "cut") {
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
    [clip, activeTool]
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
      trimClipEnd(clip.id, deltaMs, audioSourceDurationMs);
      trimEndRef.current.startX = e.clientX;
    },
    [clip, msPerPx, trimClipEnd, audioSourceDurationMs]
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
      handleClick={handleClick}
      handleTrimStartPointerDown={handleTrimStartPointerDown}
      handleTrimStartPointerMove={handleTrimStartPointerMove}
      handleTrimEndPointerDown={handleTrimEndPointerDown}
      handleTrimEndPointerMove={handleTrimEndPointerMove}
      cutMode={activeTool === "cut"}
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
  handleClick: (e: React.MouseEvent<HTMLDivElement>) => void;
  handleTrimStartPointerDown: (e: React.PointerEvent<HTMLDivElement>) => void;
  handleTrimStartPointerMove: (e: React.PointerEvent<HTMLDivElement>) => void;
  handleTrimEndPointerDown: (e: React.PointerEvent<HTMLDivElement>) => void;
  handleTrimEndPointerMove: (e: React.PointerEvent<HTMLDivElement>) => void;
  cutMode: boolean;
}

const ClipBody: React.FC<ClipBodyProps> = ({
  clip,
  leftPx,
  widthPx,
  isSelected,
  derivedStatus,
  statusInfo,
  handleDragPointerDown,
  handleClick,
  handleTrimStartPointerDown,
  handleTrimStartPointerMove,
  handleTrimEndPointerDown,
  handleTrimEndPointerMove,
  cutMode
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
  const audioAssetId =
    clip.mediaType === "audio" ? clip.currentAssetId : undefined;

  const getAsset = useAssetStore((s) => s.get);
  const [videoUrl, setVideoUrl] = useState<string | undefined>(undefined);
  const [imageUrl, setImageUrl] = useState<string | undefined>(undefined);
  const [audioUrl, setAudioUrl] = useState<string | undefined>(undefined);

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

  useEffect(() => {
    let cancelled = false;
    if (!audioAssetId) {
      setAudioUrl(undefined);
      return;
    }
    getAsset(audioAssetId)
      .then((asset) => {
        if (!cancelled) setAudioUrl(getAssetUrl(asset) ?? undefined);
      })
      .catch(() => {
        // Asset unavailable — leave url undefined; clip renders without waveform.
      });
    return () => {
      cancelled = true;
    };
  }, [audioAssetId, getAsset]);

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
      style={{ left: leftPx, width: widthPx, cursor: cutMode ? "crosshair" : undefined }}
      onPointerDown={handleDragPointerDown}
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

      {clip.mediaType === "audio" && (
        <WaveformCanvas
          url={audioUrl}
          inPointMs={clip.inPointMs ?? 0}
          outPointMs={(clip.inPointMs ?? 0) + clip.durationMs}
          widthPx={widthPx}
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
