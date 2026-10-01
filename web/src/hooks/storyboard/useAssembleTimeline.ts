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
  LOOSE_PROJECT_ID
} from "../../stores/WorkspaceTabsStore";
import { buildTimelineDocument } from "../../components/storyboard/assembleTimeline";
import { invalidateTimelineGetQuery } from "../../stores/storyboard/timelineSync";
import { linkedScriptId } from "../../lib/scriptStoryboardLink";
import { loadLinkedScript } from "../../lib/linkedAssembly";
import {
  mergeIntoSequence,
  stampBoardProvenance
} from "../../lib/assembledSequenceMerge";
import { useNotificationStore } from "../../stores/NotificationStore";
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
  warnings: string[];
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
      if (!assetId) return null;
      const url = await resolveMediaUri(clip.uri || assetLocator(assetId));
      if (!url) return null;
      const durationMs = await probeMediaDurationMs(url, "video");
      return durationMs === null
        ? null
        : ([assetId, durationMs / 1000] as const);
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
        const ownerTab = useWorkspaceTabsStore
          .getState()
          .tabs.find((tab) => tab.type === "storyboard" && tab.ref === boardId);
        const projectId =
          ownerTab?.projectId ??
          (await trpcClient.storyboards.get.query({ id: boardId })).projectId;
        const measuredBoard = await boardWithMeasuredClipDurations(board);
        const scriptId = linkedScriptId(measuredBoard);
        // A linked script that cannot be read leaves the board assembling the
        // way an unlinked one does — a deleted script must not break assemble.
        const script = scriptId ? await loadLinkedScript(scriptId) : null;
        const warnings: string[] = [];
        if (scriptId && !script) {
          warnings.push(
            `Script ${scriptId} is linked but could not be loaded, so the board was assembled on its own.`
          );
        }
        const doc = buildTimelineDocument(measuredBoard, script);
        // Picture clips only: still-first shots are first-class assembly
        // sources, while rendered video shots may also contribute audio twins.
        const shotClips = doc.clips.filter(
          (clip) => clip.storyboardShotId && (clip.mediaType === "video" || clip.mediaType === "image")
        );
        if (doc.durationMs === 0) {
          throw new Error(
            "No storyboard picture to assemble — add a persisted keyframe or rendered clip first."
          );
        }
        if (doc.skippedShotIds.length > 0) {
          warnings.push(
            `${doc.skippedShotIds.length} shots had no persisted still or clip and were skipped.`
          );
        }
        if (doc.skippedLineIds.length > 0) {
          warnings.push(
            `${doc.skippedLineIds.length} script lines had no voiced take and were skipped.`
          );
        }
        const notifyWarnings = (): void => {
          for (const content of warnings) {
            useNotificationStore
              .getState()
              .addNotification({ type: "warning", content, timeout: 0 });
          }
        };
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
              clips: sequence.clips as TimelineClip[],
              storyboardMaterializations: sequence.storyboardMaterializations
            },
            { boardId, scriptId: doc.linked ? scriptId : null }
          );
          await trpcClient.timeline.update.mutate({
            id: existingId,
            baseUpdatedAt: sequence.updatedAt,
            width,
            height,
            durationMs: merged.clips.reduce(
              (end, clip) => Math.max(end, clip.startMs + clip.durationMs),
              doc.durationMs
            ),
            document: { ...merged, markers: sequence.markers ?? [] }
          });
          invalidateTimelineGetQuery(existingId);
          useWorkspaceTabsStore.getState().openForegroundTab({
            type: "timeline",
            ref: existingId,
            mode: "edit",
            title: name,
            projectId: sequence.projectId ?? LOOSE_PROJECT_ID
          });
          notifyWarnings();
          return {
            sequenceId: existingId,
            clipCount: shotClips.length,
            skippedShotIds: doc.skippedShotIds,
            skippedLineIds: doc.skippedLineIds,
            warnings,
            reassembled: true
          };
        }

        const sequence = await trpcClient.timeline.create.mutate({
          id: newDocumentId(),
          name,
          width,
          height,
          projectId
        });
        await trpcClient.timeline.update.mutate({
          id: sequence.id,
          durationMs: doc.durationMs,
          document: { tracks: doc.tracks, clips, markers: [] }
        });
        invalidateTimelineGetQuery(sequence.id);
        useStoryboardStore.getState().setTimelineLink(boardId, sequence.id);
        useWorkspaceTabsStore.getState().openForegroundTab({
          type: "timeline",
          ref: sequence.id,
          mode: "edit",
          title: name,
          projectId: sequence.projectId ?? LOOSE_PROJECT_ID
        });
        notifyWarnings();
        return {
          sequenceId: sequence.id,
          clipCount: shotClips.length,
          skippedShotIds: doc.skippedShotIds,
          skippedLineIds: doc.skippedLineIds,
          warnings,
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
