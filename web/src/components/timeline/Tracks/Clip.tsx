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

import type { ClipFadeShape, ClipStatus } from "@nodetool-ai/timeline";
import { parseClipFadeShape } from "@nodetool-ai/timeline";
import { useTimelineStore } from "../../../stores/timeline/TimelineStore";
import { findClipById } from "../../../stores/timeline/clipLookup";
import {
  useTimelineUIStore,
  useIsClipSelected
} from "../../../stores/timeline/TimelineUIStore";
import type { TimelineTool } from "../../../stores/timeline/TimelineUIStore";
import { useLongPress } from "../../../hooks/timeline/useLongPress";
import type { LongPressPoint } from "../../../hooks/timeline/useLongPress";
import useWorkflowRunsStore from "../../../stores/WorkflowRunsStore";
import useErrorStore, {
  hasNodeError,
  nodeErrorToDisplayString
} from "../../../stores/ErrorStore";
import { type NodeKey } from "../../../stores/nodeKey";
import { deriveClipStatus } from "../status/clipStatusReducer";
import type { ClipErrorState } from "../status/clipStatusReducer";
import { useClipSourceDuration } from "./useClipSourceDuration";
import { useClipDrag } from "./useClipDrag";
import { useClipTrim } from "./useClipTrim";
import { useClipSourceSlip } from "./useClipSourceSlip";
import { useTransitionHandle } from "./useTransitionHandle";
import { useClipFade, useSetClipFadeShape } from "./useClipFade";
import type { ClipFadeEdge } from "./useClipFade";
import { ClipFadeShapeMenu } from "./ClipFadeShapeMenu";
import {
  KEYFRAME_PROPERTIES,
  keyframeTimesMs as deriveKeyframeTimes,
  moveKeyframes
} from "@nodetool-ai/timeline";
import { useTimelinePlaybackStore } from "../../../stores/timeline/TimelinePlaybackStore";
import { ClipBody, CLIP_STATUS_MAP, MIN_CLIP_WIDTH_PX } from "./ClipBody";
import { ClipContextMenu } from "./ClipContextMenu";
import { SendToWorkflowMenu } from "../../workflows/SendToWorkflowMenu";
import type { WorkflowMediaItem } from "../../../hooks/handlers/useGenerationToCanvas";
import { ReplaceClipAssetDialog } from "./ReplaceClipAssetDialog";
import { TransformClipDialog } from "./TransformClipDialog";
import { useAlertNotifier } from "../../../hooks/useAlertNotifier";

interface ClipProps {
  clipId: string;
}

/** The body pointer for each tool; the select-style tools keep the grab. */
const TOOL_BODY_CURSOR: Record<TimelineTool, React.CSSProperties["cursor"]> = {
  select: undefined,
  trackSelect: "e-resize",
  trackSelectBackward: "w-resize",
  ripple: undefined,
  roll: undefined,
  rateStretch: undefined,
  cut: "crosshair",
  slip: "col-resize",
  slide: "ew-resize",
  hand: "grab",
  zoom: "zoom-in"
};

const NON_SELECTING_TOOLS: ReadonlySet<TimelineTool> = new Set<TimelineTool>([
  "trackSelect",
  "trackSelectBackward",
  "hand",
  "zoom"
]);

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
  const openPianoRoll = useTimelineUIStore((s) => s.openPianoRoll);
  const addToSelection = useTimelineUIStore((s) => s.addToSelection);
  const toggleSelection = useTimelineUIStore((s) => s.toggleSelection);

  const unlinkClip = useTimelineStore((s) => s.unlinkClip);
  const deleteSelected = useTimelineStore((s) => s.deleteSelected);

  // Source-duration cap for trim-end (audio decoded, video probed; nothing
  // for image/text/shape clips).
  const sourceDurationMs = useClipSourceDuration(clip);
  const sourceSlipRef = useClipSourceSlip({
    clip,
    interactionLocked,
    msPerPx,
    sourceDurationMs
  });

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
    longPress: clipLongPress,
    sourceDurationMs
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

  // Right-clicking a fade handle picks the curve that edge ramps along.
  const [fadeShapeMenu, setFadeShapeMenu] = useState<{
    edge: ClipFadeEdge;
    x: number;
    y: number;
  } | null>(null);
  const handleRequestFadeShapeMenu = useCallback(
    (edge: ClipFadeEdge, x: number, y: number) =>
      setFadeShapeMenu({ edge, x, y }),
    []
  );
  const handleCloseFadeShapeMenu = useCallback(() => setFadeShapeMenu(null), []);
  const setFadeShape = useSetClipFadeShape();
  const handleSelectFadeShape = useCallback(
    (shape: ClipFadeShape) => {
      if (fadeShapeMenu) setFadeShape(clipId, fadeShapeMenu.edge, shape);
    },
    [clipId, fadeShapeMenu, setFadeShape]
  );
  const fade = useClipFade({
    clip,
    msPerPx,
    interactionLocked,
    onRequestShapeMenu: handleRequestFadeShapeMenu
  });

  const keyframeTimes = useMemo(
    () => (clip ? deriveKeyframeTimes(clip) : []),
    [clip]
  );
  const seek = useTimelinePlaybackStore((s) => s.seek);
  const handleKeyframeClick = useCallback(
    (relMs: number) => {
      if (clip) seek(clip.startMs + relMs);
    },
    [clip, seek]
  );
  const editClipKeyframes = useTimelineStore((s) => s.editClipKeyframes);
  const fps = useTimelineStore((s) => s.fps);
  const handleKeyframeMove = useCallback(
    (fromMs: number, toMs: number) => {
      if (!clip) return;
      // Land on a frame of the sequence, inside the clip.
      const frameMs = 1000 / Math.max(1, fps);
      const abs = Math.round((clip.startMs + toMs) / frameMs) * frameMs;
      const rel = Math.max(0, Math.min(clip.durationMs, abs - clip.startMs));
      editClipKeyframes(clip.id, (c) => ({
        animations: moveKeyframes(c, KEYFRAME_PROPERTIES, fromMs, rel)
      }));
      seek(clip.startMs + rel);
    },
    [clip, editClipKeyframes, fps, seek]
  );

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
  // The context menu closes when an item is picked, so the workflow picker it
  // opens is held here, where it outlives that menu.
  const [workflowSend, setWorkflowSend] = useState<{
    items: WorkflowMediaItem[];
    position: { x: number; y: number };
  } | null>(null);
  const handleSendToWorkflow = useCallback(
    (items: WorkflowMediaItem[], position: { x: number; y: number }) =>
      setWorkflowSend({ items, position }),
    []
  );
  const handleCloseWorkflowSend = useCallback(() => setWorkflowSend(null), []);
  // Raised by context-menu actions; they must outlive the menu's unmount.
  const [replaceOpen, setReplaceOpen] = useState(false);
  const reportActionError = useAlertNotifier("error");
  const handleOpenReplace = useCallback(() => setReplaceOpen(true), []);
  const handleCloseReplace = useCallback(() => setReplaceOpen(false), []);
  const [transformOpen, setTransformOpen] = useState(false);
  const handleOpenTransform = useCallback(() => setTransformOpen(true), []);
  const handleCloseTransform = useCallback(() => setTransformOpen(false), []);
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
      // A track-select tool chose the selection on pointerdown, and Hand
      // and Zoom do not select.
      if (
        NON_SELECTING_TOOLS.has(useTimelineUIStore.getState().activeTool)
      ) {
        return;
      }
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

  // A midi clip's content is notes, and the way a DAW opens them is a
  // double-click on the clip. Every other clip opens in the inspector.
  const handleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      selectClip(clipId);
      if (clip?.mediaType === "midi") {
        openPianoRoll(clipId);
        return;
      }
      const { panelTab, codePanelDirty, setPanelTab } =
        useTimelineUIStore.getState();
      // Unsaved code stays on screen. This matters on phones, where the sheet
      // shows one tab at a time and switching would hide the edit. The desktop
      // dock keeps the Code panel mounted, so it holds the edit either way.
      // Only the tab switcher asks to leave it.
      if (panelTab === "code" && codePanelDirty) {
        return;
      }
      // The desktop dock opens the Inspector in answer to the request.
      setPanelTab("inspector");
    },
    [clip?.mediaType, clipId, openPianoRoll, selectClip]
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
        handleDoubleClick={handleDoubleClick}
        handleKeyDown={handleKeyDown}
        handleContextMenu={handleContextMenu}
        rootRef={sourceSlipRef}
        handleTrimStartPointerDown={handleTrimStartPointerDown}
        handleTrimStartPointerMove={handleTrimStartPointerMove}
        handleTrimEndPointerDown={handleTrimEndPointerDown}
        handleTrimEndPointerMove={handleTrimEndPointerMove}
        handleTrimPointerEnd={handleTrimPointerEnd}
        bodyCursor={TOOL_BODY_CURSOR[activeTool]}
        selectedEdge={selectedEdge}
        handleTransitionPointerDown={handleTransitionPointerDown}
        handleTransitionPointerMove={handleTransitionPointerMove}
        handleTransitionPointerEnd={handleTransitionPointerEnd}
        fade={fade}
        keyframeTimesMs={keyframeTimes}
        onKeyframeClick={handleKeyframeClick}
        onKeyframeMove={handleKeyframeMove}
        interactionLocked={interactionLocked}
      />
      {contextMenuPos && (
        <ClipContextMenu
          clipId={clipId}
          position={contextMenuPos}
          isLinked={Boolean(clip.linkId)}
          onUnlink={handleUnlink}
          onDelete={handleDelete}
          onSendToWorkflow={handleSendToWorkflow}
          onClose={handleCloseContextMenu}
          onRequestReplace={handleOpenReplace}
          onRequestTransform={handleOpenTransform}
          onError={reportActionError}
        />
      )}
      {workflowSend && (
        <SendToWorkflowMenu
          items={workflowSend.items}
          position={workflowSend.position}
          onClose={handleCloseWorkflowSend}
        />
      )}
      {fadeShapeMenu && (
        <ClipFadeShapeMenu
          edge={fadeShapeMenu.edge}
          current={parseClipFadeShape(
            fadeShapeMenu.edge === "in" ? clip.fadeInShape : clip.fadeOutShape
          )}
          position={{ x: fadeShapeMenu.x, y: fadeShapeMenu.y }}
          onSelect={handleSelectFadeShape}
          onClose={handleCloseFadeShapeMenu}
        />
      )}
      {replaceOpen && (
        <ReplaceClipAssetDialog
          clipId={clipId}
          onClose={handleCloseReplace}
        />
      )}
      {transformOpen && (
        <TransformClipDialog
          clipId={clipId}
          onClose={handleCloseTransform}
        />
      )}
    </>
  );
});

Clip.displayName = "Clip";
