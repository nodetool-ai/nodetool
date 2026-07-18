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
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";

import type { TimelineClip, TimelineTrack, ClipStatus } from "@nodetool-ai/timeline";
import { useTimelineStore } from "../../../stores/timeline/TimelineStore";
import { findClipById } from "../../../stores/timeline/clipLookup";
import { useTimelineHistoryBatch } from "../../../stores/timeline/useTimelineHistoryBatch";
import {
  useTimelineUIStore,
  useIsClipSelected
} from "../../../stores/timeline/TimelineUIStore";
import { useTimelinePlaybackStore } from "../../../stores/timeline/TimelinePlaybackStore";
import useWorkflowRunsStore from "../../../stores/WorkflowRunsStore";
import { useAssetStore } from "../../../stores/AssetStore";
import { getAssetUrl } from "../../../utils/assetHelpers";
import useErrorStore, { hasNodeError, nodeErrorToDisplayString } from "../../../stores/ErrorStore";
import { type NodeKey } from "../../../stores/nodeKey";
import {
  StatusIndicator,
  BORDER_RADIUS,
  SPACING,
  getSpacingPx,
  MagicGenerationFill,
  Z_INDEX
} from "../../ui_primitives";
import type { StatusType } from "../../ui_primitives";
import { deriveClipStatus } from "../status/clipStatusReducer";
import type { ClipErrorState } from "../status/clipStatusReducer";
import { useClipThumbnails } from "./useClipThumbnails";
import { useAudioPeaks } from "./useAudioPeaks";
import { samplePeaksWindow } from "./audioPeaks";
import { isCompatibleWithTrack } from "../dnd/assetToClipAdapter";
import { clipSurfaceTint, clipBorderTint } from "./trackVisuals";
import { ClipContextMenu } from "./ClipContextMenu";

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

const TRIM_HANDLE_WIDTH_PX = 8;
const MIN_CLIP_WIDTH_PX = 4;
const CLIP_RADIUS_PX = parseFloat(BORDER_RADIUS.md);
/** Width below which we suppress secondary chrome (duration label). */
const COMPACT_THRESHOLD_PX = 96;

// Status mapping (PRD §5.5)
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

const clipStyles = (
  theme: Theme,
  selected: boolean,
  locked: boolean,
  mediaType: TimelineClip["mediaType"]
) =>
  css({
    position: "absolute",
    top: 6,
    bottom: 6,
    borderRadius: CLIP_RADIUS_PX,
    overflow: "hidden",
    backgroundColor: theme.vars.palette.background.paper,
    backgroundImage: `linear-gradient(0deg, ${clipSurfaceTint(
      theme,
      mediaType
    )}, ${clipSurfaceTint(theme, mediaType)})`,
    border: selected
      ? `1.5px solid ${theme.vars.palette.secondary.main}`
      : `1px solid ${clipBorderTint(theme, mediaType)}`,
    boxShadow: selected
      ? `0 0 0 3px rgba(var(--palette-secondary-mainChannel) / 0.18), 0 4px 12px ${theme.vars.palette.c_scrim_soft}`
      : "none",
    cursor: locked ? "not-allowed" : "grab",
    "&:active": {
      cursor: locked ? "not-allowed" : "grabbing"
    },
    userSelect: "none",
    touchAction: "none",
    minWidth: MIN_CLIP_WIDTH_PX,
    boxSizing: "border-box"
  });

const clipHeaderRowStyles = css({
  position: "absolute",
  top: 0,
  left: 0,
  right: 0,
  height: 18,
  display: "flex",
  alignItems: "center",
  gap: getSpacingPx(SPACING.sm),
  padding: `0 ${getSpacingPx(SPACING.md)}`,
  pointerEvents: "none",
  zIndex: Z_INDEX.base + 4
});

const clipDotStyles = (accent: string) =>
  css({
    width: 6,
    height: 6,
    borderRadius: BORDER_RADIUS.circle,
    backgroundColor: accent,
    boxShadow: `0 0 0 1px var(--palette-c_scrim)`,
    flexShrink: 0
  });

const clipNameStyles = (theme: Theme) =>
  css({
    fontSize: "var(--fontSizeSmaller)",
    fontWeight: 500,
    letterSpacing: "-0.005em",
    color: theme.vars.palette.text.primary,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    pointerEvents: "none",
    lineHeight: 1.4,
    textShadow: `0 1px 2px ${theme.vars.palette.c_scrim}`,
    flex: "1 1 auto",
    minWidth: 0
  });

const clipDurationStyles = (theme: Theme) =>
  css({
    flexShrink: 0,
    fontFamily:
      "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace",
    fontSize: "var(--fontSizeSmaller)",
    fontWeight: 500,
    color: theme.vars.palette.text.secondary,
    letterSpacing: "0",
    textShadow: `0 1px 2px ${theme.vars.palette.c_scrim}`
  });

const filmstripStyles = css({
  position: "absolute",
  left: 6,
  right: 6,
  top: 20,
  bottom: 6,
  display: "flex",
  gap: getSpacingPx(SPACING.micro), // was 1px
  pointerEvents: "none",
  zIndex: 0,
  borderRadius: BORDER_RADIUS.xs,
  overflow: "hidden"
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

// Generating overlay for clips that are queued or actively generating —
// the shared "magic" wash + shimmer reused from the sketch editor, so a
// generating clip in the timeline reads identically to a generating layer
// on the canvas. Clips to the clip's rounded body.
const generatingOverlayStyles = css({
  position: "absolute",
  inset: 0,
  pointerEvents: "none",
  zIndex: Z_INDEX.base + 3,
  overflow: "hidden",
  borderRadius: CLIP_RADIUS_PX
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

  // Coalesce redraws into a single animation frame. During a drag/resize the
  // clip's widthPx changes on every pointermove (~60×/s); without this each
  // change forced a synchronous canvas re-render. We also skip redraws when the
  // width hasn't moved by at least a pixel, so sub-pixel jitter is a no-op.
  const rafIdRef = useRef<number | null>(null);
  const lastDrawnWidthRef = useRef<number>(-1);
  const lastInputsKeyRef = useRef<string>("");

  // Latest draw inputs, read inside the scheduled frame so it never goes stale.
  const drawInputsRef = useRef({
    peaks,
    durationMs,
    inPointMs,
    outPointMs,
    widthPx,
    successColor: theme.vars.palette.success.main
  });
  drawInputsRef.current = {
    peaks,
    durationMs,
    inPointMs,
    outPointMs,
    widthPx,
    successColor: theme.vars.palette.success.main
  };

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const {
      peaks: pk,
      durationMs: dur,
      inPointMs: inMs,
      outPointMs: outMs,
      widthPx: wPx,
      successColor
    } = drawInputsRef.current;

    const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
    const cssWidth = Math.max(1, Math.floor(wPx));
    const cssHeight = canvas.clientHeight || 32;
    canvas.width = cssWidth * dpr;
    canvas.height = cssHeight * dpr;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, cssWidth, cssHeight);

    if (!pk || !dur) return;

    // Visible audio window is the intersection of [inPointMs, outPointMs]
    // with the source [0, durationMs]. Anything beyond the source renders
    // as empty space rather than stretching the waveform.
    const visibleInMs = Math.max(0, Math.min(dur, inMs));
    const visibleOutMs = Math.max(visibleInMs, Math.min(dur, outMs));
    const clipSpanMs = Math.max(1, outMs - inMs);
    const visibleSpanMs = visibleOutMs - visibleInMs;
    const visibleWidthPx = cssWidth * (visibleSpanMs / clipSpanMs);

    const barCount = Math.max(1, Math.floor(visibleWidthPx / 2));
    const slice = samplePeaksWindow(
      pk,
      dur,
      visibleInMs,
      visibleOutMs,
      barCount
    );
    const mid = cssHeight / 2;
    ctx.fillStyle = successColor;
    for (let i = 0; i < slice.length; i += 1) {
      const amp = slice[i];
      const h = Math.max(1, amp * (cssHeight - 2));
      const x = (i / slice.length) * visibleWidthPx;
      const w = Math.max(1, visibleWidthPx / slice.length - 0.5);
      ctx.fillRect(x, mid - h / 2, w, h);
    }
  }, []);

  useEffect(() => {
    // Decide whether anything beyond a sub-pixel width change actually
    // happened. Width changes during a drag are gated to whole pixels (the
    // canvas can't show finer detail); other inputs force a redraw.
    const inputsKey = `${durationMs}|${inPointMs}|${outPointMs}|${url || ""}`;
    const otherInputsChanged = inputsKey !== lastInputsKeyRef.current;
    const widthChanged =
      Math.abs(Math.floor(widthPx) - lastDrawnWidthRef.current) >= 1;
    if (!otherInputsChanged && !widthChanged) return;

    if (rafIdRef.current !== null) return;
    rafIdRef.current = requestAnimationFrame(() => {
      rafIdRef.current = null;
      lastDrawnWidthRef.current = Math.floor(widthPx);
      lastInputsKeyRef.current = inputsKey;
      draw();
    });
    return () => {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
    };
  }, [peaks, durationMs, inPointMs, outPointMs, widthPx, draw]);

  return <canvas ref={canvasRef} css={waveformStyles} aria-hidden />;
};
WaveformCanvas.displayName = "WaveformCanvas";

// Static (no per-URL variant): backgroundImage is set via inline `style`
// instead, so a distinct thumbnail data URL per cell doesn't make emotion
// hash a multi-KB string and insert a permanent CSSOM rule per render.
const filmstripCellStyles = css({
  flex: 1,
  height: "100%",
  backgroundSize: "cover",
  backgroundPosition: "center",
  opacity: 0.78
});

const trimHandleStyles = (
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
    backgroundColor: "var(--palette-c_overlay_strong)",
    "&:hover": {
      backgroundColor: locked ? undefined : "var(--palette-c_overlay_strong)"
    },
    zIndex: Z_INDEX.base + 2
  });

const statusBadgeStyles = css({
  position: "absolute",
  bottom: 4,
  right: 6,
  zIndex: Z_INDEX.base + 3,
  pointerEvents: "none"
});

const lockIconStyles = css({
  position: "absolute",
  bottom: 4,
  left: 8,
  zIndex: Z_INDEX.base + 3,
  pointerEvents: "none",
  opacity: 0.85,
  fontSize: 12,
  display: "flex",
  alignItems: "center"
});

export interface ClipProps {
  clipId: string;
}

export const Clip: React.FC<ClipProps> = memo(({ clipId }) => {
  // Selector: only this clip's fields. findClipById is O(1) via a WeakMap
  // index keyed on `clips` identity, shared across every mounted Clip — vs.
  // O(n) per clip per store publish (O(n²) aggregate during a drag).
  const clip = useTimelineStore((s) => findClipById(s.clips, clipId));

  const isSelected = useIsClipSelected(clipId);
  const msPerPx = useTimelineUIStore((s) => s.msPerPx);

  const selectClip = useTimelineUIStore((s) => s.selectClip);
  const addToSelection = useTimelineUIStore((s) => s.addToSelection);
  const toggleSelection = useTimelineUIStore((s) => s.toggleSelection);

  const moveClip = useTimelineStore((s) => s.moveClip);
  const moveSelectedClips = useTimelineStore((s) => s.moveSelectedClips);
  const trimClipStart = useTimelineStore((s) => s.trimClipStart);
  const trimClipEnd = useTimelineStore((s) => s.trimClipEnd);
  const splitClipAtTime = useTimelineStore((s) => s.splitClipAtTime);
  const unlinkClip = useTimelineStore((s) => s.unlinkClip);
  const deleteSelected = useTimelineStore((s) => s.deleteSelected);
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

  // Derived status (PRD §5.5).
  // Node-level errors from ErrorStore. Error keys are now scoped per run
  // (`${wf}:${jobId}:${node}`), so restrict the scan to the workflow's focused
  // run; with no focused run there's no error to surface.
  //
  // The scan lives INSIDE the selector so it returns this clip's own derived
  // message (a primitive) rather than the whole `errors` record — every clip
  // subscribing to the full record re-renders (and re-scans all keys) on any
  // error anywhere; a primitive return only re-renders this clip when its own
  // derived error actually changes.
  const workflowId = clip?.workflowId;
  const focusedJobId = useWorkflowRunsStore((s) =>
    workflowId ? s.focusedJob[workflowId] : undefined
  );
  const errorMessage = useErrorStore((s) => {
    if (!workflowId || !focusedJobId) {
      return null;
    }
    const prefix = `${workflowId}:${focusedJobId}:`;
    for (const key of Object.keys(s.errors) as NodeKey[]) {
      if (key.startsWith(prefix) && hasNodeError(s.errors[key])) {
        return nodeErrorToDisplayString(s.errors[key]);
      }
    }
    return null;
  });
  const errorState: ClipErrorState | null = useMemo(
    () => (errorMessage !== null ? { hasError: true, message: errorMessage } : null),
    [errorMessage]
  );

  // Derive the displayed status badge.
  // For the "missing" check we trust clip.currentAssetId: if it's set,
  // the asset is assumed present unless the generation store knows otherwise.
  // A full async asset-existence check would require React Query per-clip,
  // which is handled separately by the PreviewCompositor.
  const derivedStatus: ClipStatus = useMemo(() => {
    if (!clip) {
      return "draft";
    }
    return deriveClipStatus(clip, errorState, true);
  }, [clip, errorState]);

  // Undo batching: drag/trim gestures mutate the store on every pointermove. To collapse a
  // whole gesture into a single undo entry we begin a batch on pointerdown,
  // mark() after each mutation (which pauses history once the pre-gesture
  // state has actually been checkpointed), and end() on pointerup. While
  // paused, the temporal middleware records nothing — so one undo step reverts the entire drag.
  const history = useTimelineHistoryBatch();

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
      history.begin();

      // Snapshot the snap candidates ONCE at gesture start. The set of clip
      // edges + second/playhead gridlines doesn't change during a drag (only
      // the dragged clip moves, and it's excluded), so rebuilding the Set on
      // every pointermove was pure waste. Captured here as a stable array.
      const dragStartState = useTimelineStore.getState();
      const dragStartPlayheadMs = useTimelinePlaybackStore
        .getState()
        .getTimeMs();
      const snapCandidatesSet = new Set<number>();
      snapCandidatesSet.add(dragStartPlayheadMs);
      for (let t = 0; t <= dragStartState.durationMs + 1000; t += 1000) {
        snapCandidatesSet.add(t);
      }
      for (const c of dragStartState.clips) {
        if (c.id !== clipId) {
          snapCandidatesSet.add(c.startMs);
          snapCandidatesSet.add(c.startMs + c.durationMs);
        }
      }
      const snapCandidates = Array.from(snapCandidatesSet);

      // Cross-track hit-test is sampled at most once per animation frame.
      // document.elementsFromPoint forces layout/style work, so calling it on
      // every pointermove (~60–120×/s) is costly; we coalesce to one sample
      // per frame using the latest pointer coordinates.
      let crossTrackTargetId: string | undefined;
      let lastPointer = { x: e.clientX, y: e.clientY };
      let hitTestRafId: number | null = null;
      const sampleCrossTrack = () => {
        hitTestRafId = null;
        const freshClip = useTimelineStore
          .getState()
          .clips.find((c) => c.id === clipId);
        if (!freshClip) return;
        const elements = document.elementsFromPoint(
          lastPointer.x,
          lastPointer.y
        );
        let foundLaneId: string | null = null;
        for (const el of elements) {
          if (!(el instanceof HTMLElement)) continue;
          const lane = el.closest<HTMLElement>("[data-testid^='track-lane-']");
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
            return;
          }
        }
        crossTrackTargetId = undefined;
      };

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

        const pointerMs = deltaPx * msPerPx;
        const alreadyAppliedMs = freshClip.startMs - dragStartMsRef.current;
        const adjustedDeltaMs = pointerMs - alreadyAppliedMs;

        const { selectedClipIds } = useTimelineUIStore.getState();
        const isMulti =
          selectedClipIds.has(freshClip.id) && selectedClipIds.size > 1;

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
          // Cross-track hit-test (single-clip drags only). Sampled at most once
          // per frame; we apply the latest known target immediately so the clip
          // still follows the cursor into a new lane.
          lastPointer = { x: ev.clientX, y: ev.clientY };
          if (hitTestRafId === null) {
            hitTestRafId = requestAnimationFrame(sampleCrossTrack);
          }
          moveClip(
            freshClip.id,
            adjustedDeltaMs,
            crossTrackTargetId,
            snapCandidates,
            msPerPx,
            disableSnap
          );
        }
        // First effective mutation recorded the pre-drag state; batch the rest.
        history.mark();
      };

      const onUpOrCancel = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUpOrCancel);
        window.removeEventListener("pointercancel", onUpOrCancel);
        if (hitTestRafId !== null) {
          cancelAnimationFrame(hitTestRafId);
          hitTestRafId = null;
        }
        history.end();
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
      moveSelectedClips,
      history
    ]
  );

  const [contextMenuPos, setContextMenuPos] = useState<{
    x: number;
    y: number;
  } | null>(null);

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      if (!clip) {
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      setContextMenuPos({ x: e.clientX, y: e.clientY });
    },
    [clip]
  );

  // Stable handler props for the memoized ClipBody — inline arrows here would
  // create a fresh function each render and defeat the React.memo on ClipBody.
  const handleCloseContextMenu = useCallback(() => setContextMenuPos(null), []);
  const handleUnlink = useCallback(() => unlinkClip(clipId), [unlinkClip, clipId]);
  const handleDelete = useCallback(
    () => deleteSelected(new Set([clipId])),
    [deleteSelected, clipId]
  );

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

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === "Enter" || e.key === " ") {
        e.stopPropagation();
        selectClip(clipId);
      }
    },
    [clipId, selectClip]
  );

  // Gesture-ownership flags: each trim handle's move handler only runs when
  // *its own* pointerdown started the gesture. Without this, dragging another
  // clip across the handle (with the primary button held) would fire the move
  // handler and corrupt this clip's geometry.
  const isTrimmingStartRef = useRef(false);
  const isTrimmingEndRef = useRef(false);

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
      isTrimmingStartRef.current = true;
      history.begin();
    },
    [clip, activeTool, history]
  );

  const handleTrimStartPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (
        !isTrimmingStartRef.current ||
        !clip ||
        clip.locked ||
        e.buttons !== 1
      ) {
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
      history.mark();
      trimStartRef.current.startX = e.clientX;
    },
    [clip, msPerPx, trimClipStart, history]
  );

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
      isTrimmingEndRef.current = true;
      history.begin();
    },
    [clip, activeTool, history]
  );

  const handleTrimEndPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (
        !isTrimmingEndRef.current ||
        !clip ||
        clip.locked ||
        e.buttons !== 1
      ) {
        return;
      }
      // Stop bubbling so the parent clip body's drag-pointermove handler
      // does not also fire and shift `startMs`. Without this the clip
      // appears to move and grow simultaneously.
      e.stopPropagation();
      const deltaPx = e.clientX - trimEndRef.current.startX;
      const deltaMs = deltaPx * msPerPx;
      trimClipEnd(clip.id, deltaMs, audioSourceDurationMs);
      history.mark();
      trimEndRef.current.startX = e.clientX;
    },
    [clip, msPerPx, trimClipEnd, audioSourceDurationMs, history]
  );

  // Shared end-of-trim handler (pointerup AND pointercancel): release the
  // gesture flags and resume undo tracking.
  const handleTrimPointerEnd = useCallback(() => {
    isTrimmingStartRef.current = false;
    isTrimmingEndRef.current = false;
    history.end();
  }, [history]);

  if (!clip) {
    return null;
  }

  // The clip renders inside the natively scrolling lanes container, so
  // lane-local coordinates are already content-space — no scroll offset.
  const leftPx = clip.startMs / msPerPx;
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
      handleKeyDown={handleKeyDown}
      handleContextMenu={handleContextMenu}
      handleTrimStartPointerDown={handleTrimStartPointerDown}
      handleTrimStartPointerMove={handleTrimStartPointerMove}
      handleTrimEndPointerDown={handleTrimEndPointerDown}
      handleTrimEndPointerMove={handleTrimEndPointerMove}
      handleTrimPointerEnd={handleTrimPointerEnd}
      cutMode={activeTool === "cut"}
      contextMenuPos={contextMenuPos}
      onCloseContextMenu={handleCloseContextMenu}
      onUnlink={handleUnlink}
      onDelete={handleDelete}
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
  handleKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => void;
  handleContextMenu: (e: React.MouseEvent<HTMLDivElement>) => void;
  handleTrimStartPointerDown: (e: React.PointerEvent<HTMLDivElement>) => void;
  handleTrimStartPointerMove: (e: React.PointerEvent<HTMLDivElement>) => void;
  handleTrimEndPointerDown: (e: React.PointerEvent<HTMLDivElement>) => void;
  handleTrimEndPointerMove: (e: React.PointerEvent<HTMLDivElement>) => void;
  handleTrimPointerEnd: () => void;
  cutMode: boolean;
  contextMenuPos: { x: number; y: number } | null;
  onCloseContextMenu: () => void;
  onUnlink: () => void;
  onDelete: () => void;
}

const ClipBody: React.FC<ClipBodyProps> = memo(({
  clip,
  leftPx,
  widthPx,
  isSelected,
  derivedStatus,
  statusInfo,
  handleDragPointerDown,
  handleClick,
  handleKeyDown,
  handleContextMenu,
  handleTrimStartPointerDown,
  handleTrimStartPointerMove,
  handleTrimEndPointerDown,
  handleTrimEndPointerMove,
  handleTrimPointerEnd,
  cutMode,
  contextMenuPos,
  onCloseContextMenu,
  onUnlink,
  onDelete
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

  const accent = (() => {
    switch (clip.mediaType) {
      case "audio":
        return theme.vars.palette.success.main;
      case "overlay":
        return theme.vars.palette.secondary.main;
      case "image":
      case "video":
      default:
        return theme.vars.palette.info.main;
    }
  })();

  const showDuration = widthPx >= COMPACT_THRESHOLD_PX;
  const durationLabel = formatClipDuration(clip.durationMs);

  const positionStyle = useMemo(
    () => ({
      left: leftPx,
      width: widthPx,
      cursor: cutMode ? ("crosshair" as const) : undefined
    }),
    [leftPx, widthPx, cutMode]
  );

  const imageStyle = useMemo(
    () =>
      imageUrl
        ? {
            backgroundImage: `url(${imageUrl})`,
            backgroundSize: "cover" as const,
            backgroundPosition: "center" as const,
            opacity: 0.78
          }
        : undefined,
    [imageUrl]
  );

  return (
    <div
      css={clipStyles(theme, isSelected, clip.locked, clip.mediaType)}
      style={positionStyle}
      onPointerDown={handleDragPointerDown}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      onContextMenu={handleContextMenu}
      data-testid={`clip-${clipId}`}
      aria-selected={isSelected}
      role="option"
      tabIndex={0}
      aria-label={clip.name || `Clip ${clip.id}`}
    >
      {filmstripCells && (
        <div css={filmstripStyles}>
          {filmstripCells.map((cell, i) => (
            <div
              key={i}
              css={filmstripCellStyles}
              style={{ backgroundImage: `url(${cell.url})` }}
            />
          ))}
        </div>
      )}

      {imageUrl && <div css={filmstripStyles} style={imageStyle} />}

      {clip.mediaType === "audio" && (
        <WaveformCanvas
          url={audioUrl}
          inPointMs={clip.inPointMs ?? 0}
          outPointMs={(clip.inPointMs ?? 0) + clip.durationMs}
          widthPx={widthPx}
        />
      )}

      {/* Header strip: type dot · name · duration */}
      <div css={clipHeaderRowStyles}>
        <span css={clipDotStyles(accent)} aria-hidden />
        <span css={clipNameStyles(theme)}>{clip.name}</span>
        {showDuration && (
          <span css={clipDurationStyles(theme)}>{durationLabel}</span>
        )}
      </div>

      <div
        css={trimHandleStyles("start", clip.locked)}
        onPointerDown={handleTrimStartPointerDown}
        onPointerMove={handleTrimStartPointerMove}
        onPointerUp={handleTrimPointerEnd}
        onPointerCancel={handleTrimPointerEnd}
        aria-label="Trim clip start"
        data-testid={`clip-trim-start-${clipId}`}
      />

      <div
        css={trimHandleStyles("end", clip.locked)}
        onPointerDown={handleTrimEndPointerDown}
        onPointerMove={handleTrimEndPointerMove}
        onPointerUp={handleTrimPointerEnd}
        onPointerCancel={handleTrimPointerEnd}
        aria-label="Trim clip end"
        data-testid={`clip-trim-end-${clipId}`}
      />

      {clip.locked && (
        <div css={lockIconStyles}>
          <LockOutlinedIcon sx={{ fontSize: 12 }} aria-label="Clip locked" />
        </div>
      )}

      {(derivedStatus === "queued" || derivedStatus === "generating") && (
        <div
          css={generatingOverlayStyles}
          aria-hidden
          data-testid={`clip-generating-${clipId}`}
        >
          <MagicGenerationFill />
        </div>
      )}

      {/* The badge surfaces lifecycle state for generated clips. Once a
       *  clip has settled into "generated" it doesn't need a permanent green
       *  dot, and imported clips have no lifecycle at all — so we render
       *  only while something interesting is happening. */}
      {clip.sourceType === "generated" &&
        derivedStatus !== "draft" &&
        derivedStatus !== "generated" && (
          <div css={statusBadgeStyles}>
            <StatusIndicator
              status={statusInfo.status}
              pulse={statusInfo.pulse}
              tooltip={statusInfo.label}
              size="small"
            />
          </div>
        )}

      {contextMenuPos && (
        <ClipContextMenu
          position={contextMenuPos}
          isLinked={Boolean(clip.linkId)}
          onUnlink={onUnlink}
          onDelete={onDelete}
          onClose={onCloseContextMenu}
        />
      )}
    </div>
  );
});
ClipBody.displayName = "ClipBody";

/** "4.6s" for sub-minute, "1:23" for ≥1 min. Shown when clip width ≥ compact threshold. */
function formatClipDuration(durationMs: number): string {
  if (durationMs < 60_000) {
    const sec = durationMs / 1000;
    return sec < 10 ? `${sec.toFixed(1)}s` : `${Math.round(sec)}s`;
  }
  const totalSec = Math.round(durationMs / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

Clip.displayName = "Clip";
