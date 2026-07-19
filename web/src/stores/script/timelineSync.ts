/**
 * timelineSync — round-trips a re-voiced script line into its assembled
 * timeline.
 *
 * When a script has been assembled (`script.timelineId` set) and a line gets a
 * new current take, the linked voiceover clip (matched by `scriptLineId`) picks
 * up the new take's asset, duration, and word timings. Uses a get→CAS-update
 * cycle against the persisted document; an editor with the sequence open reads
 * the change on next load. Failures are logged, never thrown — a sync miss must
 * not fail the take.
 *
 * This mirrors the storyboard's `syncShotClipToTimeline`. Structural drift
 * (adding/removing/reordering lines) is out of scope here — it prompts a
 * re-assemble instead.
 */

import { trpcClient } from "../../trpc/client";
import { useScriptStore, type ScriptTake } from "./ScriptStore";
import { takeCaptionWords } from "../../components/script/assembleScriptTimeline";
import type { TimelineClip } from "@nodetool-ai/timeline";

export async function syncLineClipToTimeline(
  scriptId: string,
  lineId: string,
  take: ScriptTake
): Promise<boolean> {
  const timelineId = useScriptStore.getState().getScript(scriptId)?.timelineId;
  if (!timelineId) {
    return false;
  }
  try {
    const sequence = await trpcClient.timeline.get.query({ id: timelineId });
    const clips = sequence.clips as TimelineClip[];
    const words = takeCaptionWords(take);
    const durationMs = take.durationMs > 0 ? take.durationMs : undefined;
    let changed = false;
    const next = clips.map((clip) => {
      if (clip.scriptLineId !== lineId || clip.scriptId !== scriptId) {
        return clip;
      }
      const nextDuration = durationMs ?? clip.durationMs;
      if (
        clip.currentAssetId === take.assetId &&
        clip.durationMs === nextDuration
      ) {
        return clip;
      }
      changed = true;
      return {
        ...clip,
        currentAssetId: take.assetId,
        durationMs: nextDuration,
        caption: words.length ? { words } : clip.caption,
        status: "generated" as const
      };
    });
    if (!changed) {
      return false;
    }
    await trpcClient.timeline.update.mutate({
      id: timelineId,
      baseUpdatedAt: sequence.updatedAt,
      document: {
        tracks: sequence.tracks,
        clips: next,
        markers: sequence.markers ?? []
      }
    });
    return true;
  } catch (err) {
    console.warn(
      `script→timeline sync failed for line ${lineId}:`,
      err instanceof Error ? err.message : err
    );
    return false;
  }
}
