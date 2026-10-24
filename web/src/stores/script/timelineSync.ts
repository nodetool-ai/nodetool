/**
 * timelineSync — round-trips a re-voiced script line into its assembled
 * timeline.
 *
 * When a script has been assembled (`script.timelineId` set) and a line gets a
 * new current take, the linked voiceover clip (matched by `scriptLineId`) picks
 * up the new take's asset, duration, and word timings. The clip keeps its
 * position, and so does every other clip: placements are the editor's. Uses a
 * get→CAS-update cycle against the persisted document. A timeline open in an
 * editor here reconciles the script live (`useLinkedScriptSync`), so this
 * leaves that one alone. Failures are logged, never thrown — a sync miss must
 * not fail the take.
 *
 * This mirrors the storyboard's `syncShotClipToTimeline`. Structural drift
 * (adding/removing/reordering lines) is out of scope here — it prompts a
 * re-assemble instead.
 */

import { trpcClient } from "../../trpc/client";
import {
  useScriptStore,
  type ScriptDraft,
  type ScriptTake
} from "./ScriptStore";
import { takeCaptionWords } from "../../components/script/assembleScriptTimeline";
import { isScriptWriting } from "../../hooks/script/scriptWrites";
import { makeClipVersion } from "@nodetool-ai/timeline";
import type { TimelineClip } from "@nodetool-ai/timeline";
import { isTimelineReconciledLive } from "./liveTimelineLinks";
import {
  ApiErrorCode,
  isTRPCErrorWithCode
} from "@nodetool-ai/protocol/api-schemas";

export async function syncLineClipToTimeline(
  scriptId: string,
  lineId: string,
  take: ScriptTake | null
): Promise<boolean> {
  const script = useScriptStore.getState().getScript(scriptId);
  const timelineId = script?.timelineId;
  if (!timelineId || isTimelineReconciledLive(timelineId)) {
    return false;
  }
  for (let attempt = 0; attempt < 3; attempt++) {
    const currentLine =
      attempt > 0
        ? useScriptStore
            .getState()
            .getScript(scriptId)
            ?.sections.flatMap((section) => section.lines)
            .find((line) => line.id === lineId)
        : undefined;
    const activeTake = currentLine
      ? (currentLine.takes.find(
          (candidate) => candidate.id === currentLine.currentTakeId
        ) ?? null)
      : take;
    try {
      const sequence = await trpcClient.timeline.get.query({ id: timelineId });
      const clips = sequence.clips as TimelineClip[];
      const targetIndex = clips.findIndex(
        (clip) => clip.scriptLineId === lineId && clip.scriptId === scriptId
      );
      if (targetIndex < 0) return false;

      if (!activeTake) {
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
      const words = takeCaptionWords(activeTake);
      const durationMs =
        activeTake.durationMs > 0 ? activeTake.durationMs : target.durationMs;
      const caption = words.length ? { words } : undefined;
      const next = clips.map((clip, index) => {
        if (index === targetIndex) {
          if (
            clip.currentAssetId === activeTake.assetId &&
            clip.durationMs === durationMs &&
            JSON.stringify(clip.caption) === JSON.stringify(caption)
          ) {
            return clip;
          }
          if (clip.currentAssetId === activeTake.assetId) {
            return { ...clip, durationMs, caption, status: "generated" as const };
          }
          // A new take is a fresh source: record it as the active version and
          // reset the trim window, like a timeline-side generation does.
          const versions = clip.versions ?? [];
          const version =
            versions.find((v) => v.assetId === activeTake.assetId) ??
            makeClipVersion({
              createdAt: activeTake.createdAt,
              workflowUpdatedAt: activeTake.createdAt,
              assetId: activeTake.assetId,
              durationMs,
              source: "generated"
            });
          return {
            ...clip,
            currentAssetId: activeTake.assetId,
            activeTakeId: version.id,
            versions: versions.includes(version)
              ? versions
              : [...versions, version],
            inPointMs: undefined,
            outPointMs: undefined,
            durationMs,
            caption,
            status: "generated" as const
          };
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
      if (
        attempt < 2 &&
        isTRPCErrorWithCode(err, ApiErrorCode.ALREADY_EXISTS)
      ) {
        continue;
      }
      console.warn(
        `script→timeline sync failed for line ${lineId}:`,
        err instanceof Error ? err.message : err
      );
      return false;
    }
  }
  return false;
}

/**
 * Round-trip every line whose current take differs between two versions of a
 * script, as undo and redo produce them. Without it, undoing a take put the old
 * take back in the script while the assembled timeline kept the undone one.
 */
export function syncChangedTakesToTimeline(
  scriptId: string,
  before: ScriptDraft | undefined,
  after: ScriptDraft | undefined
): void {
  if (!before || !after || !after.timelineId) {
    return;
  }
  const previous = new Map(
    before.sections
      .flatMap((section) => section.lines)
      .map((line) => [line.id, line.currentTakeId ?? null] as const)
  );
  for (const line of after.sections.flatMap((section) => section.lines)) {
    const takeId = line.currentTakeId ?? null;
    if (!previous.has(line.id) || previous.get(line.id) === takeId) {
      continue;
    }
    const take = line.takes.find((candidate) => candidate.id === takeId) ?? null;
    void syncLineClipToTimeline(scriptId, line.id, take);
  }
}

/** Undo one step of a script, and bring its assembled timeline along. */
export function undoScript(scriptId: string): void {
  // A running write replaces the lines when it lands; stepping history under
  // it would be thrown away with them.
  if (isScriptWriting(scriptId)) return;
  const before = useScriptStore.getState().getScript(scriptId);
  useScriptStore.getState().undo(scriptId);
  syncChangedTakesToTimeline(
    scriptId,
    before,
    useScriptStore.getState().getScript(scriptId)
  );
}

/** Redo one step of a script, and bring its assembled timeline along. */
export function redoScript(scriptId: string): void {
  // A running write replaces the lines when it lands; stepping history under
  // it would be thrown away with them.
  if (isScriptWriting(scriptId)) return;
  const before = useScriptStore.getState().getScript(scriptId);
  useScriptStore.getState().redo(scriptId);
  syncChangedTakesToTimeline(
    scriptId,
    before,
    useScriptStore.getState().getScript(scriptId)
  );
}
