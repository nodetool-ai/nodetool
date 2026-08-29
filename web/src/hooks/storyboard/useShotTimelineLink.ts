/**
 * useShotTimelineLink
 *
 * Where a shot lands in the cut. `buildStoryboardTimeline` stamps every clip
 * it lays down with `storyboardBoardId`/`storyboardShotId`, so the mapping is
 * read back off the assembled sequence rather than recomputed — a cut the user
 * has since trimmed or re-ordered reports where the clip *is*, not where an
 * assemble would put it again.
 *
 * The board names its sequence (`board.timelineId`), and the persisted
 * document is what gets read: a timeline's live stores belong to its own
 * editor instance and only exist while its tab is open.
 */

import { useCallback, useMemo } from "react";
import type { TimelineClip } from "@nodetool-ai/timeline";

import { trpc } from "../../trpc/client";
import { useStoryboardStore } from "../../stores/storyboard/StoryboardStore";
import { useWorkspaceTabsStore } from "../../stores/WorkspaceTabsStore";
import { requestDocumentFocus } from "../../stores/DocumentFocusStore";

/** The clip a shot owns in the assembled cut, and how to go look at it. */
export interface ShotTimelineLink {
  timelineId: string;
  clipId: string;
  startMs: number;
  /** "Cut v2 at 00:12" — the sequence and where the shot sits in it. */
  label: string;
  /** Open the timeline's tab with the clip selected. */
  open: () => void;
}

/** 12_000 → "00:12". */
const timecode = (ms: number): string => {
  const total = Math.max(0, Math.round(ms / 1000));
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
};

/**
 * The shot's own clip: the video one. A jointly assembled cut stamps the shot
 * keys onto the voiceover clips covering it too, and those belong to the
 * script's lines — the audio twin carries no line either, so both keys matter.
 */
const shotClipOf = (
  clips: TimelineClip[],
  boardId: string,
  shotId: string
): TimelineClip | undefined =>
  clips.find(
    (clip) =>
      clip.storyboardShotId === shotId &&
      clip.storyboardBoardId === boardId &&
      clip.mediaType === "video" &&
      !clip.scriptLineId
  );

export const useShotTimelineLink = (
  boardId: string,
  shotId: string
): ShotTimelineLink | null => {
  const timelineId = useStoryboardStore(
    (state) => state.boards[boardId]?.timelineId ?? null
  );
  const { data } = trpc.timeline.get.useQuery(
    { id: timelineId ?? "" },
    { enabled: !!timelineId, staleTime: 30_000, retry: false }
  );

  const clip = useMemo(() => {
    if (!data) {
      return undefined;
    }
    // SAFETY: `timeline.get` types the document as the passthrough zod mirror
    // of the store's `TimelineClip` — the same payload, structurally described.
    return shotClipOf(data.clips as TimelineClip[], boardId, shotId);
  }, [data, boardId, shotId]);

  const open = useCallback(() => {
    if (!timelineId || !clip) {
      return;
    }
    requestDocumentFocus({
      type: "timeline",
      ref: timelineId,
      clipId: clip.id
    });
    useWorkspaceTabsStore.getState().openTab({
      type: "timeline",
      ref: timelineId,
      mode: "edit",
      title: data?.name
    });
  }, [timelineId, clip, data?.name]);

  return useMemo(() => {
    if (!timelineId || !clip) {
      return null;
    }
    const name = data?.name?.trim() || "Timeline";
    return {
      timelineId,
      clipId: clip.id,
      startMs: clip.startMs,
      label: `${name} at ${timecode(clip.startMs)}`,
      open
    };
  }, [timelineId, clip, data?.name, open]);
};

export default useShotTimelineLink;
