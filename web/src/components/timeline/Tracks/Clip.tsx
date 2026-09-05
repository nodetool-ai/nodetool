/**
 * Clip
 *
 * One timeline clip: reads its own store slice, derives status, wires the
 * drag and trim gestures (useClipDrag / useClipTrim) and the context menu,
 * and hands stable props to the memoized ClipBody that draws it.
 *
 * Performance: subscribes only to this clip's own state (id selector), its
 * track's lock flag (primitive selector), selection membership, and msPerPx.
 */

import React, { memo, useCallback, useMemo, useState } from "react";

import type { ClipStatus } from "@nodetool-ai/timeline";
import { useTimelineStore } from "../../../stores/timeline/TimelineStore";
import { findClipById } from "../../../stores/timeline/clipLookup";
import {
  useTimelineUIStore,
  useIsClipSelected
} from "../../../stores/timeline/TimelineUIStore";
import { useLongPress } from "../../../hooks/timeline/useLongPress";
import type { LongPressPoint } from "../../../hooks/timeline/useLongPress";
import useWorkflowRunsStore from "../../../stores/WorkflowRunsStore";
import useErrorStore, {
  hasNodeError,
  nodeErrorToDisplayString
} from "../../../stores/ErrorStore";
import { type NodeKey } from "../../../stores/nodeKey";
import { Toast } from "../../ui_primitives";
import { deriveClipStatus } from "../status/clipStatusReducer";
import type { ClipErrorState } from "../status/clipStatusReducer";
import { useClipSourceDuration } from "./useClipSourceDuration";
import { useClipDrag } from "./useClipDrag";
import { useClipTrim } from "./useClipTrim";
import { useTransitionHandle } from "./useTransitionHandle";
import { ClipBody, CLIP_STATUS_MAP, MIN_CLIP_WIDTH_PX } from "./ClipBody";
import { ClipContextMenu } from "./ClipContextMenu";
import { ReplaceOutputDialog } from "./ReplaceOutputDialog";

interface ClipProps {
  clipId: string;
}

export const Clip: React.FC<ClipProps> = memo(({ clipId }) => {
  // Selector: only this clip's fields. findClipById is O(1) via a WeakMap
  // index keyed on `clips` identity, shared across every mounted Clip — vs.
  // O(n) per clip per store publish (O(n²) aggregate during a drag).
  const clip = useTimelineStore((s) => findClipById(s.clips, clipId));
  // Primitive selector: re-renders only when this track's lock flag flips.
  const trackId = clip?.trackId;
  const trackLocked = useTimelineStore(
    (s) =>
      trackId !== undefined &&
      (s.tracks.find((t) => t.id === trackId)?.locked ?? false)
  );
  const interactionLocked = (clip?.locked ?? false) || trackLocked;

  const isSelected = useIsClipSelected(clipId);
  const msPerPx = useTimelineUIStore((s) => s.msPerPx);
  const activeTool = useTimelineUIStore((s) => s.activeTool);
  const selectedEdge = useTimelineUIStore((s) =>
    s.selectedEdit?.clipId === clipId ? s.selectedEdit.edge : null
  );

  const selectClip = useTimelineUIStore((s) => s.selectClip);
  const addToSelection = useTimelineUIStore((s) => s.addToSelection);
  const toggleSelection = useTimelineUIStore((s) => s.toggleSelection);

  const unlinkClip = useTimelineStore((s) => s.unlinkClip);
  const deleteSelected = useTimelineStore((s) => s.deleteSelected);

  // Source-duration cap for trim-end (audio decoded, video probed; nothing
  // for image/text/shape clips).
  const sourceDurationMs = useClipSourceDuration(clip);

  // Derived status (PRD §5.5).
  // Node-level errors from ErrorStore. Error keys are scoped per run
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
    () =>
      errorMessage !== null ? { hasError: true, message: errorMessage } : null,
    [errorMessage]
  );

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

  const [contextMenuPos, setContextMenuPos] = useState<{
    x: number;
    y: number;
  } | null>(null);

  // Touch equivalent of right-clicking the clip. Every clip action a phone can
  // reach — split, duplicate, delete, replace — lives in that menu, and a hold
  // doesn't produce a `contextmenu` event on touch.
  const clipLongPress = useLongPress(
    useCallback((point: LongPressPoint) => {
      setContextMenuPos({ x: point.clientX, y: point.clientY });
    }, [])
  );

  const { handleDragPointerDown, isDraggingRef } = useClipDrag({
    clip,
    clipId,
    msPerPx,
    activeTool,
    interactionLocked,
    longPress: clipLongPress
  });

  const {
    handleTrimStartPointerDown,
    handleTrimStartPointerMove,
    handleTrimEndPointerDown,
    handleTrimEndPointerMove,
    handleTrimPointerEnd
  } = useClipTrim({
    clip,
    msPerPx,
    activeTool,
    interactionLocked,
    sourceDurationMs
  });

  const {
    handleTransitionPointerDown,
    handleTransitionPointerMove,
    handleTransitionPointerEnd
  } = useTransitionHandle(clip, msPerPx, interactionLocked);

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
  // Raised by context-menu actions; they must outlive the menu's unmount.
  const [replaceAssetId, setReplaceAssetId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const handleCloseReplace = useCallback(() => setReplaceAssetId(null), []);
  const handleClearError = useCallback(() => setActionError(null), []);
  const handleUnlink = useCallback(
    () => unlinkClip(clipId),
    [unlinkClip, clipId]
  );
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
    [clipId, isDraggingRef, selectClip, addToSelection, toggleSelection]
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

  if (!clip) {
    return null;
  }

  // The clip renders inside the natively scrolling lanes container, so
  // lane-local coordinates are already content-space — no scroll offset.
  const leftPx = clip.startMs / msPerPx;
  const widthPx = Math.max(MIN_CLIP_WIDTH_PX, clip.durationMs / msPerPx);

  const statusInfo = CLIP_STATUS_MAP[derivedStatus];

  return (
    <>
      <ClipBody
        clip={clip}
        leftPx={leftPx}
        widthPx={widthPx}
        msPerPx={msPerPx}
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
        selectedEdge={selectedEdge}
        handleTransitionPointerDown={handleTransitionPointerDown}
        handleTransitionPointerMove={handleTransitionPointerMove}
        handleTransitionPointerEnd={handleTransitionPointerEnd}
        interactionLocked={interactionLocked}
      />
      {contextMenuPos && (
        <ClipContextMenu
          clipId={clipId}
          position={contextMenuPos}
          isLinked={Boolean(clip.linkId)}
          onUnlink={handleUnlink}
          onDelete={handleDelete}
          onClose={handleCloseContextMenu}
          onRequestReplace={setReplaceAssetId}
          onError={setActionError}
        />
      )}
      {replaceAssetId !== null && (
        <ReplaceOutputDialog
          clipId={clipId}
          initialAssetId={replaceAssetId}
          onClose={handleCloseReplace}
        />
      )}
      <Toast
        open={actionError !== null}
        message={actionError ?? ""}
        severity="error"
        onClose={handleClearError}
        vertical="top"
        horizontal="center"
      />
    </>
  );
});

Clip.displayName = "Clip";
