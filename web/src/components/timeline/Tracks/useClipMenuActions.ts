/**
 * useClipMenuActions
 *
 * Every operation the clip right-click menu offers: split, duplicate,
 * regenerate-as-copy, lock, replace-output, open-in-node-editor.
 *
 * Called from `ClipContextMenu`, which mounts only while the menu is open —
 * a clip lane can hold hundreds of clips, so none of these subscriptions
 * (or react-router's `useNavigate`) should exist per clip at rest. The two
 * outcomes that must outlive the menu — the replace-output dialog and a
 * failure message — are reported upward via callbacks.
 */

import { useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";

import {
  useTimelineStore,
  useTimelineStoreApi
} from "../../../stores/timeline/TimelineStore";
import { useTimelineUIStore } from "../../../stores/timeline/TimelineUIStore";
import { useTimelinePlaybackStoreApi } from "../../../stores/timeline/TimelinePlaybackStore";
import { findClipById } from "../../../stores/timeline/clipLookup";

export interface ClipMenuActions {
  /** Generated clips can be re-rolled into a sibling take. */
  isGenerated: boolean;
  locked: boolean;
  canOpenInNodeEditor: boolean;

  splitAtPlayhead: () => void;
  duplicate: () => void;
  regenerateAsCopy: () => void;
  toggleLock: () => void;
  openReplace: () => void;
  openInNodeEditor: () => void;
}

export interface ClipMenuActionCallbacks {
  /** Opens the replace-output dialog, which the menu itself cannot host. */
  onRequestReplace: (currentAssetId: string) => void;
  onError: (message: string) => void;
}

export function useClipMenuActions(
  clipId: string,
  { onRequestReplace, onError }: ClipMenuActionCallbacks
): ClipMenuActions {
  const navigate = useNavigate();

  const clip = useTimelineStore((s) => findClipById(s.clips, clipId));
  const sequenceId = useTimelineStore((s) => s.sequenceId);

  const duplicateClip = useTimelineStore((s) => s.duplicateClip);
  const regenerateAsCopyAction = useTimelineStore((s) => s.regenerateAsCopy);
  const setClipLocked = useTimelineStore((s) => s.setClipLocked);
  const splitClipAtTime = useTimelineStore((s) => s.splitClipAtTime);
  const selectClip = useTimelineUIStore((s) => s.selectClip);
  const playbackApi = useTimelinePlaybackStoreApi();
  const timelineApi = useTimelineStoreApi();

  const splitAtPlayhead = useCallback(() => {
    const current = findClipById(timelineApi.getState().clips, clipId);
    if (!current) return;
    const at = playbackApi.getState().getTimeMs();
    if (at > current.startMs && at < current.startMs + current.durationMs) {
      splitClipAtTime(clipId, at);
    } else {
      onError("Move the playhead inside the clip to split it.");
    }
  }, [clipId, onError, playbackApi, splitClipAtTime, timelineApi]);

  const duplicate = useCallback(() => {
    duplicateClip(clipId, 0)
      .then((newClipId) => selectClip(newClipId))
      .catch((err: unknown) =>
        onError(
          err instanceof Error ? err.message : "Failed to duplicate clip"
        )
      );
  }, [clipId, duplicateClip, onError, selectClip]);

  const regenerateAsCopy = useCallback(() => {
    try {
      selectClip(regenerateAsCopyAction(clipId, 0));
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed to create copy");
    }
  }, [clipId, onError, regenerateAsCopyAction, selectClip]);

  const toggleLock = useCallback(() => {
    if (!clip) return;
    setClipLocked(clipId, !clip.locked);
  }, [clip, clipId, setClipLocked]);

  const openReplace = useCallback(
    () => onRequestReplace(clip?.currentAssetId ?? ""),
    [clip?.currentAssetId, onRequestReplace]
  );

  const openInNodeEditor = useCallback(() => {
    if (!clip?.workflowId || !sequenceId) return;
    navigate(`/editor/${clip.workflowId}?from=timeline:${sequenceId}:${clipId}`);
  }, [clip?.workflowId, clipId, navigate, sequenceId]);

  return useMemo(
    () => ({
      isGenerated: clip?.sourceType === "generated",
      locked: Boolean(clip?.locked),
      canOpenInNodeEditor: Boolean(clip?.workflowId && sequenceId),
      splitAtPlayhead,
      duplicate,
      regenerateAsCopy,
      toggleLock,
      openReplace,
      openInNodeEditor
    }),
    [
      clip?.sourceType,
      clip?.locked,
      clip?.workflowId,
      sequenceId,
      splitAtPlayhead,
      duplicate,
      regenerateAsCopy,
      toggleLock,
      openReplace,
      openInNodeEditor
    ]
  );
}
