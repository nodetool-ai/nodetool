/**
 * useAssembleTimeline
 *
 * The storyboard → timeline handoff: creates a persisted timeline sequence,
 * writes rendered shots as asset-backed clips (plus draft narration/music
 * clips), links the board to the sequence, and opens the timeline tab. The
 * pure document mapping lives in {@link buildTimelineDocument}.
 */

import { useCallback, useState } from "react";
import { trpcClient } from "../../trpc/client";
import { useStoryboardStore } from "../../stores/storyboard/StoryboardStore";
import { useWorkspaceTabsStore } from "../../stores/WorkspaceTabsStore";
import { buildTimelineDocument } from "../../components/storyboard/assembleTimeline";
import { newDocumentId } from "../../lib/newDocumentId";

export interface AssembleResult {
  sequenceId: string;
  clipCount: number;
  skippedShotIds: string[];
}

export interface UseAssembleTimelineResult {
  assemble: (boardId: string) => Promise<AssembleResult>;
  assembling: boolean;
  error: string | null;
}

export const useAssembleTimeline = (): UseAssembleTimelineResult => {
  const [assembling, setAssembling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const assemble = useCallback(
    async (boardId: string): Promise<AssembleResult> => {
      const board = useStoryboardStore.getState().getBoard(boardId);
      if (!board) {
        throw new Error(`No storyboard board "${boardId}".`);
      }
      const doc = buildTimelineDocument(board);
      const shotClips = doc.clips.filter((c) => c.storyboardShotId);
      if (shotClips.length === 0) {
        const message =
          "No rendered shots to assemble — generate and render clips first.";
        setError(message);
        throw new Error(message);
      }

      setError(null);
      setAssembling(true);
      try {
        const name = board.title.trim() || "Storyboard cut";
        const sequence = await trpcClient.timeline.create.mutate({
          id: newDocumentId(),
          name,
          projectId: "default"
        });
        await trpcClient.timeline.update.mutate({
          id: sequence.id,
          document: { tracks: doc.tracks, clips: doc.clips, markers: [] }
        });
        useStoryboardStore.getState().setTimelineLink(boardId, sequence.id);
        useWorkspaceTabsStore.getState().openTab({
          type: "timeline",
          ref: sequence.id,
          mode: "edit",
          title: name
        });
        return {
          sequenceId: sequence.id,
          clipCount: shotClips.length,
          skippedShotIds: doc.skippedShotIds
        };
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        throw err;
      } finally {
        setAssembling(false);
      }
    },
    []
  );

  return { assemble, assembling, error };
};

export default useAssembleTimeline;
