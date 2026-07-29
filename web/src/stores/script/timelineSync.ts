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
  take: ScriptTake | null
): Promise<boolean> {
  const script = useScriptStore.getState().getScript(scriptId);
  const timelineId = script?.timelineId;
  if (!timelineId) {
    return false;
  }
  try {
    const sequence = await trpcClient.timeline.get.query({ id: timelineId });
    const clips = sequence.clips as TimelineClip[];
    const targetIndex = clips.findIndex(
      (clip) => clip.scriptLineId === lineId && clip.scriptId === scriptId
    );
    if (targetIndex < 0) return false;

    if (!take) {
      const next = clips.filter((_, index) => index !== targetIndex);
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
    }

    const target = clips[targetIndex];
    const words = takeCaptionWords(take);
    const durationMs = take.durationMs > 0 ? take.durationMs : target.durationMs;
    const caption = words.length ? { words } : undefined;
    const deltaMs = durationMs - target.durationMs;
    const lineOrder = script
      ? new Map(
          script.sections
            .flatMap((section) => section.lines)
            .map((line, index) => [line.id, index])
        )
      : new Map<string, number>();
    const targetOrder = lineOrder.get(lineId);
    const next = clips.map((clip, index) => {
      if (index === targetIndex) {
        if (
          clip.currentAssetId === take.assetId &&
          clip.durationMs === durationMs &&
          JSON.stringify(clip.caption) === JSON.stringify(caption)
        ) {
          return clip;
        }
        return {
          ...clip,
          currentAssetId: take.assetId,
          durationMs,
          caption,
          status: "generated" as const
        };
      }
      const clipOrder = clip.scriptLineId
        ? lineOrder.get(clip.scriptLineId)
        : undefined;
      if (
        deltaMs !== 0 &&
        targetOrder !== undefined &&
        clip.scriptId === scriptId &&
        clipOrder !== undefined &&
        clipOrder > targetOrder
      ) {
        return { ...clip, startMs: clip.startMs + deltaMs };
      }
      return clip;
    });
    const changed = next.some((clip, index) => clip !== clips[index]);
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
