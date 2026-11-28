/**
 * useClipMenuActions
 *
 * Every operation the clip right-click menu offers: split, duplicate,
 * regenerate-as-copy, lock, replace-output, open-in-node-editor, detect beats.
 *
 * Called from `ClipContextMenu`, which mounts only while the menu is open —
 * a clip lane can hold hundreds of clips, so none of these subscriptions
 * (or react-router's `useNavigate`) should exist per clip at rest. The two
 * outcomes that must outlive the menu — the replace-output dialog and a
 * failure message — are reported upward via callbacks.
 */

import { useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { captureMediaEditSourceContext } from "@nodetool-ai/timeline";

import {
  useTimelineStore,
  useTimelineStoreApi
} from "../../../stores/timeline/TimelineStore";
import { useTimelineUIStore } from "../../../stores/timeline/TimelineUIStore";
import { useTimelinePlaybackStoreApi } from "../../../stores/timeline/TimelinePlaybackStore";
import { findClipById } from "../../../stores/timeline/clipLookup";
import { getTimelineAgentHandler } from "../timelineAgentBridge";
import {
  canDetectClipBeats,
  useDetectClipBeats
} from "../../../hooks/timeline/useDetectClipBeats";

export interface ClipMenuActions {
  /** Generated clips can be re-rolled into a sibling take. */
  isGenerated: boolean;
  locked: boolean;
  canOpenInNodeEditor: boolean;
  /** A midi clip's notes are editable in the clip-editor panel. */
  isMidi: boolean;
  /**
   * Whether "Replace clip…" applies. An `adjustment` clip draws no media of
   * its own, so there is nothing to replace.
   */
  canReplace: boolean;
  canEditVideo: boolean;
  /** Audio and video clips can set the tempo from their own beat. */
  canDetectBeats: boolean;

  /** MIDI only: `crossing: "split"` also continues a crossing note on the right (D46). */
  splitAtPlayhead: (crossing?: "shorten" | "split") => void;
  duplicate: () => void;
  /** CE4: act on the time span of the selection, on every track. */
  insertSilence: () => void;
  deleteSection: () => void;
  duplicateSection: () => void;
  editNotes: () => void;
  regenerateAsCopy: () => void;
  toggleLock: () => void;
  openReplace: () => void;
  openInNodeEditor: () => void;
  openAiEdit: () => void;
  detectBeats: () => void;
}

export interface ClipMenuActionCallbacks {
  /** Opens the replacement asset picker, which the menu itself cannot host. */
  onRequestReplace: () => void;
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
  const openPianoRoll = useTimelineUIStore((s) => s.openPianoRoll);
  const setPanelTab = useTimelineUIStore((s) => s.setPanelTab);
  const playbackApi = useTimelinePlaybackStoreApi();
  const timelineApi = useTimelineStoreApi();

  const splitAtPlayhead = useCallback((crossing?: "shorten" | "split") => {
    const current = findClipById(timelineApi.getState().clips, clipId);
    if (!current) return;
    const at = playbackApi.getState().getTimeMs();
    if (at > current.startMs && at < current.startMs + current.durationMs) {
      splitClipAtTime(clipId, at, crossing);
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

  // The section is the time span of the selection (or of this clip alone).
  const runSection = useCallback(
    (op: "insert_time" | "delete_time" | "duplicate_range") => {
      const state = timelineApi.getState();
      const picked = useTimelineUIStore.getState().selectedClipIds;
      const ids = picked.has(clipId) ? [...picked] : [clipId];
      const spans = ids.flatMap((id) => {
        const c = findClipById(state.clips, id);
        return c ? [c] : [];
      });
      if (spans.length === 0 || !state.sequenceId) return;
      const fromMs = Math.min(...spans.map((c) => c.startMs));
      const toMs = Math.max(...spans.map((c) => c.startMs + c.durationMs));
      const args =
        op === "insert_time"
          ? { atMs: fromMs, ms: toMs - fromMs }
          : { fromMs, toMs };
      const fail = (err: unknown): void =>
        onError(err instanceof Error ? err.message : "Section edit failed");
      try {
        // The handler lookup throws when the editor has no handler for the sequence.
        getTimelineAgentHandler(state.sequenceId)
          .applyOp({ op, ...args } as never)
          .catch(fail);
      } catch (err) {
        fail(err);
      }
    },
    [clipId, onError, timelineApi]
  );
  const insertSilence = useCallback(() => runSection("insert_time"), [runSection]);
  const deleteSection = useCallback(() => runSection("delete_time"), [runSection]);
  const duplicateSection = useCallback(
    () => runSection("duplicate_range"),
    [runSection]
  );

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

  const openReplace = onRequestReplace;

  const editNotes = useCallback(() => {
    selectClip(clipId);
    openPianoRoll(clipId);
  }, [clipId, openPianoRoll, selectClip]);

  const openInNodeEditor = useCallback(() => {
    if (!clip?.workflowId || !sequenceId) return;
    navigate(`/editor/${clip.workflowId}?from=timeline:${sequenceId}:${clipId}`);
  }, [clip?.workflowId, clipId, navigate, sequenceId]);

  // AI edit lives in the AI panel, which the desktop dock opens on request.
  const openAiEdit = useCallback(() => {
    selectClip(clipId);
    setPanelTab("ai");
  }, [clipId, selectClip, setPanelTab]);

  const detectClipBeats = useDetectClipBeats();
  const detectBeats = useCallback(() => {
    void detectClipBeats(clipId);
  }, [clipId, detectClipBeats]);

  const canEditVideo = useMemo(
    () =>
      clip !== undefined &&
      sequenceId !== null &&
      captureMediaEditSourceContext(sequenceId, clip).ok,
    [clip, sequenceId]
  );

  const canDetectBeats = canDetectClipBeats(clip);

  return useMemo(
    () => ({
      isGenerated: clip?.sourceType === "generated",
      locked: Boolean(clip?.locked),
      canOpenInNodeEditor: Boolean(clip?.workflowId && sequenceId),
      isMidi: clip?.mediaType === "midi",
      canReplace: clip?.mediaType !== "adjustment",
      canEditVideo,
      canDetectBeats,
      splitAtPlayhead,
      duplicate,
      insertSilence,
      deleteSection,
      duplicateSection,
      editNotes,
      regenerateAsCopy,
      toggleLock,
      openReplace,
      openInNodeEditor,
      openAiEdit,
      detectBeats
    }),
    [
      clip?.sourceType,
      clip?.locked,
      clip?.mediaType,
      clip?.workflowId,
      sequenceId,
      splitAtPlayhead,
      duplicate,
      insertSilence,
      deleteSection,
      duplicateSection,
      editNotes,
      regenerateAsCopy,
      toggleLock,
      openReplace,
      openInNodeEditor,
      openAiEdit,
      detectBeats,
      canEditVideo,
      canDetectBeats
    ]
  );
}
