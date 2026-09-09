/**
 * useAssembleTimeline
 *
 * The storyboard → timeline handoff: creates a persisted timeline sequence,
 * writes rendered shots as asset-backed clips — each with the audio twin that
 * carries the shot's own sound — plus draft narration/music clips, links the
 * board to the sequence, and opens the timeline tab. When the board links a
 * script, the script's takes are cut in with the shots — shot
 * lengths follow the words and every voiced line gets its own voiceover clip.
 * When the board is already linked to a sequence (re-assemble after a re-render
 * or a re-voice), that sequence is rewritten in place instead of a second one
 * being created, keeping every track the editor added. The pure document
 * mapping lives in {@link buildTimelineDocument}.
 */

import { useCallback, useState } from "react";
import {
  applyMeasuredShotClipDurations,
  frameSizeForAspect,
  type TimelineClip,
  type TimelineTrack
} from "@nodetool-ai/timeline";
import { trpcClient } from "../../trpc/client";
import {
  useStoryboardStore,
  type StoryboardBoard
} from "../../stores/storyboard/StoryboardStore";
import {
  useWorkspaceTabsStore,
  creationProjectId
} from "../../stores/WorkspaceTabsStore";
import { buildTimelineDocument } from "../../components/storyboard/assembleTimeline";
import { invalidateTimelineGetQuery } from "../../stores/storyboard/timelineSync";
import { linkedScriptId } from "../../lib/scriptStoryboardLink";
import { loadLinkedScript } from "../../lib/linkedAssembly";
import {
  mergeIntoSequence,
  stampBoardProvenance
} from "../../lib/assembledSequenceMerge";
import { newDocumentId } from "../../lib/newDocumentId";
import { assetLocator } from "../../utils/mediaRef";
import { probeMediaDurationMs } from "../../utils/probeMediaDuration";
import { resolveMediaUri } from "../../utils/resolveMediaUri";

export interface AssembleResult {
  sequenceId: string;
  clipCount: number;
  skippedShotIds: string[];
  /** Linked lines that got no clip; empty when the board links no script. */
  skippedLineIds: string[];
  /** True when an existing linked sequence was rewritten rather than created. */
  reassembled: boolean;
}

interface UseAssembleTimelineResult {
  assemble: (boardId: string) => Promise<AssembleResult>;
  assembling: boolean;
  error: string | null;
}

async function boardWithMeasuredClipDurations(
  board: StoryboardBoard
): Promise<StoryboardBoard> {
  const measurements = await Promise.all(
    board.shots.map(async (shot) => {
      const clip = shot.clip;
      const assetId = clip?.asset_id;
      if (shot.status !== "rendered" || !assetId) return null;
      const url = await resolveMediaUri(clip.uri || assetLocator(assetId));
      if (!url) return null;
      const durationMs = await probeMediaDurationMs(url, "video");
      return durationMs === null ? null : ([assetId, durationMs / 1000] as const);
    })
  );
  const durations = new Map<string, number>();
  for (const measurement of measurements) {
    if (measurement) durations.set(...measurement);
  }
  const shots = applyMeasuredShotClipDurations(board.shots, durations);
  return { ...board, shots };
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
      setError(null);
      setAssembling(true);
      try {
        const measuredBoard = await boardWithMeasuredClipDurations(board);
        const scriptId = linkedScriptId(measuredBoard);
        // A linked script that cannot be read leaves the board assembling the
        // way an unlinked one does — a deleted script must not break assemble.
        const script = scriptId ? await loadLinkedScript(scriptId) : null;
        const doc = buildTimelineDocument(measuredBoard, script);
        // The video clips only: a shot also contributes its audio twin, and a
        // jointly assembled cut stamps the shot keys onto voiceover clips too.
        const shotClips = doc.clips.filter(
          (clip) => clip.storyboardShotId && clip.mediaType === "video"
        );
        if (shotClips.length === 0) {
          throw new Error(
            "No rendered shots to assemble — generate and render clips first."
          );
        }
        const name = board.title.trim() || "Storyboard cut";
        // The cut's frame follows the board's aspect ratio, so a 9:16 board
        // does not land in a 16:9 sequence.
        const { width, height } = frameSizeForAspect(board.aspectRatio);
        const clips = stampBoardProvenance(doc.clips, boardId);
        const existingId = board.timelineId;

        if (existingId) {
          const sequence = await trpcClient.timeline.get.query({
            id: existingId
          });
          const merged = mergeIntoSequence(
            { tracks: doc.tracks, clips },
            {
              tracks: sequence.tracks as TimelineTrack[],
              clips: sequence.clips as TimelineClip[]
            },
            { boardId, scriptId: doc.linked ? scriptId : null }
          );
          await trpcClient.timeline.update.mutate({
            id: existingId,
            baseUpdatedAt: sequence.updatedAt,
            width,
            height,
            document: { ...merged, markers: sequence.markers ?? [] }
          });
          invalidateTimelineGetQuery(existingId);
          useWorkspaceTabsStore.getState().openTab({
            type: "timeline",
            ref: existingId,
            mode: "edit",
            title: name
          });
          return {
            sequenceId: existingId,
            clipCount: shotClips.length,
            skippedShotIds: doc.skippedShotIds,
            skippedLineIds: doc.skippedLineIds,
            reassembled: true
          };
        }

        const sequence = await trpcClient.timeline.create.mutate({
          id: newDocumentId(),
          name,
          width,
          height,
          projectId: creationProjectId()
        });
        await trpcClient.timeline.update.mutate({
          id: sequence.id,
          document: { tracks: doc.tracks, clips, markers: [] }
        });
        invalidateTimelineGetQuery(sequence.id);
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
          skippedShotIds: doc.skippedShotIds,
          skippedLineIds: doc.skippedLineIds,
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

export default useAssembleTimeline;
