/**
 * useAssembleScriptTimeline
 *
 * The script → timeline handoff: projects the current takes into a persisted
 * voiceover sequence, links the script to it, and opens the timeline tab. When
 * the script is already linked (re-assemble after structural drift), it rewrites
 * the linked sequence's voiceover track in place instead of creating a new one,
 * preserving any other tracks the editor added. The pure document mapping lives
 * in {@link buildScriptTimelineDocument}.
 */

import { useCallback, useState } from "react";
import { trpcClient } from "../../trpc/client";
import { useScriptStore } from "../../stores/script/ScriptStore";
import { useWorkspaceTabsStore } from "../../stores/WorkspaceTabsStore";
import { buildScriptTimelineDocument } from "../../components/script/assembleScriptTimeline";
import type { TimelineClip, TimelineTrack } from "@nodetool-ai/timeline";

export interface AssembleScriptResult {
  sequenceId: string;
  clipCount: number;
  skippedLineIds: string[];
  /** True when an existing linked sequence was rewritten rather than created. */
  reassembled: boolean;
}

export interface UseAssembleScriptTimelineResult {
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
        const doc = buildScriptTimelineDocument(script);
        if (doc.clips.length === 0) {
          const message =
            "No voiced lines to assemble — voice at least one line first.";
          setError(message);
          throw new Error(message);
        }

        setError(null);
        setAssembling(true);
        try {
          const name = script.title.trim() || "Script voiceover";
          const existingId = script.timelineId;

          if (existingId) {
            // Re-assemble: replace the script's voiceover track/clips, keep any
            // other tracks and clips the editor added.
            const sequence = await trpcClient.timeline.get.query({
              id: existingId
            });
            const existingClips = sequence.clips as TimelineClip[];
            const foreignClips = existingClips.filter(
              (c) => c.scriptId !== scriptId
            );
            // Drop only the previous voiceover track(s) — tracks that carried
            // this script's clips and hold no foreign clip. Empty tracks and
            // tracks the editor added stay.
            const thisScriptTrackIds = new Set(
              existingClips
                .filter((c) => c.scriptId === scriptId)
                .map((c) => c.trackId)
            );
            const foreignTrackIds = new Set(foreignClips.map((c) => c.trackId));
            const foreignTracks = (sequence.tracks as TimelineTrack[]).filter(
              (t) => foreignTrackIds.has(t.id) || !thisScriptTrackIds.has(t.id)
            );
            await trpcClient.timeline.update.mutate({
              id: existingId,
              baseUpdatedAt: sequence.updatedAt,
              document: {
                tracks: [...doc.tracks, ...foreignTracks],
                clips: [...doc.clips, ...foreignClips],
                markers: sequence.markers ?? []
              }
            });
            useWorkspaceTabsStore.getState().openTab({
              type: "timeline",
              ref: existingId,
              mode: "edit",
              title: name
            });
            return {
              sequenceId: existingId,
              clipCount: doc.clips.length,
              skippedLineIds: doc.skippedLineIds,
              reassembled: true
            };
          }

          const sequence = await trpcClient.timeline.create.mutate({
            name,
            projectId: "default"
          });
          await trpcClient.timeline.update.mutate({
            id: sequence.id,
            document: { tracks: doc.tracks, clips: doc.clips, markers: [] }
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
            clipCount: doc.clips.length,
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

export default useAssembleScriptTimeline;
