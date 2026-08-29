/**
 * useAssembleScriptTimeline
 *
 * The script → timeline handoff: projects the current takes into a persisted
 * voiceover sequence, links the script to it, and opens the timeline tab. When
 * the script links a storyboard, the board's shots are cut in with the words —
 * one video track of rendered shots, each line's take inside the shot that
 * covers it. When the script is already linked (re-assemble after structural
 * drift), it rewrites what it owns in the linked sequence in place instead of
 * creating a new one, preserving any other tracks the editor added. The pure
 * document mapping lives in {@link buildScriptTimelineDocument}.
 */

import { useCallback, useState } from "react";
import { trpcClient } from "../../trpc/client";
import { useScriptStore } from "../../stores/script/ScriptStore";
import {
  useWorkspaceTabsStore,
  creationProjectId
} from "../../stores/WorkspaceTabsStore";
import { buildScriptTimelineDocument } from "../../components/script/assembleScriptTimeline";
import type { TimelineClip } from "@nodetool-ai/timeline";
import { loadLinkedBoard } from "../../lib/linkedAssembly";
import {
  mergeIntoSequence,
  stampBoardProvenance
} from "../../lib/assembledSequenceMerge";
import { newDocumentId } from "../../lib/newDocumentId";

interface AssembleScriptResult {
  sequenceId: string;
  clipCount: number;
  skippedLineIds: string[];
  /** Shots left out of the cut; empty when the script links no storyboard. */
  skippedShotIds: string[];
  /** True when an existing linked sequence was rewritten rather than created. */
  reassembled: boolean;
}

interface UseAssembleScriptTimelineResult {
  assemble: (scriptId: string) => Promise<AssembleScriptResult>;
  assembling: boolean;
  error: string | null;
}

export const useAssembleScriptTimeline =
  (): UseAssembleScriptTimelineResult => {
    const [assembling, setAssembling] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const assemble = useCallback(
      async (scriptId: string): Promise<AssembleScriptResult> => {
        const script = useScriptStore.getState().getScript(scriptId);
        if (!script) {
          throw new Error(`No script "${scriptId}".`);
        }
        // A linked board that cannot be read leaves the script assembling the
        // way an unlinked one does — a deleted board must not break assemble.
        const board = script.storyboardId
          ? await loadLinkedBoard(script.storyboardId)
          : null;
        const doc = buildScriptTimelineDocument(script, board);
        const lineClips = doc.clips.filter((clip) => clip.scriptLineId);
        if (lineClips.length === 0) {
          const message =
            "No voiced lines to assemble — voice at least one line first.";
          setError(message);
          throw new Error(message);
        }

        setError(null);
        setAssembling(true);
        try {
          const name = script.title.trim() || "Script voiceover";
          const clips = board
            ? stampBoardProvenance(doc.clips, board.boardId)
            : doc.clips;
          const existingId = script.timelineId;

          if (existingId) {
            // Re-assemble: replace what these documents put in the sequence,
            // keep every other track and clip the editor added.
            const sequence = await trpcClient.timeline.get.query({
              id: existingId
            });
            const merged = mergeIntoSequence(
              { tracks: doc.tracks, clips },
              {
                tracks: sequence.tracks,
                clips: sequence.clips as TimelineClip[]
              },
              { scriptId, boardId: board?.boardId ?? null }
            );
            await trpcClient.timeline.update.mutate({
              id: existingId,
              baseUpdatedAt: sequence.updatedAt,
              document: { ...merged, markers: sequence.markers ?? [] }
            });
            useWorkspaceTabsStore.getState().openTab({
              type: "timeline",
              ref: existingId,
              mode: "edit",
              title: name
            });
            return {
              sequenceId: existingId,
              clipCount: lineClips.length,
              skippedLineIds: doc.skippedLineIds,
              skippedShotIds: doc.skippedShotIds,
              reassembled: true
            };
          }

          const sequence = await trpcClient.timeline.create.mutate({
            id: newDocumentId(),
            name,
            projectId: creationProjectId()
          });
          await trpcClient.timeline.update.mutate({
            id: sequence.id,
            document: { tracks: doc.tracks, clips, markers: [] }
          });
          useScriptStore.getState().setTimelineLink(scriptId, sequence.id);
          useWorkspaceTabsStore.getState().openTab({
            type: "timeline",
            ref: sequence.id,
            mode: "edit",
            title: name
          });
          return {
            sequenceId: sequence.id,
            clipCount: lineClips.length,
            skippedLineIds: doc.skippedLineIds,
            skippedShotIds: doc.skippedShotIds,
            reassembled: false
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

export default useAssembleScriptTimeline;
