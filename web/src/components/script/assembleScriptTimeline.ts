/**
 * assembleScriptTimeline — pure mapping from a script to a timeline document.
 *
 * The script owns its text; audio is derived. "Send to timeline" projects the
 * current takes into a voiceover track: one asset-backed audio clip per voiced
 * line, laid end to end in reading order with each line's `pauseAfterMs` gap.
 * Every clip carries its take's word timings (`caption`), the speaker label,
 * and two linkage keys (`scriptId` + `scriptLineId`) so a later re-voice can
 * round-trip its new take into the assembled sequence — the script mirror of
 * the storyboard's `storyboardBoardId`/`storyboardShotId` bridge.
 *
 * Lines without a voiced current take are skipped (reported as
 * `skippedLineIds`) rather than laid as placeholders.
 */

import { makeClip, makeTrack } from "@nodetool-ai/timeline";
import type {
  CaptionWord,
  TimelineClip,
  TimelineTrack
} from "@nodetool-ai/timeline";
import {
  effectiveVoice,
  type ScriptDraft,
  type ScriptLine,
  type ScriptTake
} from "../../stores/script/ScriptStore";

/** Fallback clip length for a take whose duration was never probed. */
const PLACEHOLDER_LINE_MS = 3000;

export interface AssembledScriptDocument {
  tracks: TimelineTrack[];
  clips: TimelineClip[];
  /** Total length of the voiceover track in ms (last clip end). */
  durationMs: number;
  /** Lines skipped because they have no voiced current take. */
  skippedLineIds: string[];
}

/** The current take of a line, if one is selected and present. */
export const currentTake = (line: ScriptLine): ScriptTake | undefined =>
  line.takes.find((t) => t.id === line.currentTakeId);

/** A line is assemblable when its current take landed as an audio asset. */
export const isAssemblableLine = (line: ScriptLine): boolean => {
  const take = currentTake(line);
  return !!take && typeof take.assetId === "string" && take.assetId.length > 0;
};

/** Copy a take's word timings into the timeline's `CaptionWord` shape. */
export const takeCaptionWords = (take: ScriptTake): CaptionWord[] =>
  take.words.map((w) => ({ word: w.word, startMs: w.startMs, endMs: w.endMs }));

export function buildScriptTimelineDocument(
  script: ScriptDraft
): AssembledScriptDocument {
  const track = makeTrack({ type: "audio", name: "Voiceover", index: 0 });
  const tracks: TimelineTrack[] = [track];
  const clips: TimelineClip[] = [];
  const skippedLineIds: string[] = [];

  const speakerName = (speakerId?: string | null): string | undefined =>
    speakerId
      ? script.cast.find((s) => s.id === speakerId)?.name
      : undefined;

  let cursorMs = 0;
  for (const line of script.sections.flatMap((s) => s.lines)) {
    const take = currentTake(line);
    if (!take || !take.assetId) {
      skippedLineIds.push(line.id);
      continue;
    }
    const durationMs =
      take.durationMs > 0 ? take.durationMs : PLACEHOLDER_LINE_MS;
    const words = takeCaptionWords(take);
    clips.push(
      makeClip({
        trackId: track.id,
        name: line.text.slice(0, 40) || "Line",
        startMs: cursorMs,
        durationMs,
        mediaType: "audio",
        sourceType: "imported",
        bindingKind: "text-to-audio",
        status: "generated",
        currentAssetId: take.assetId,
        prompt: line.text,
        voice: effectiveVoice(line, script.cast)?.voice,
        speaker: speakerName(line.speakerId),
        caption: words.length ? { words } : undefined,
        scriptId: script.id,
        scriptLineId: line.id,
        versions: []
      })
    );
    cursorMs += durationMs + Math.max(0, line.pauseAfterMs ?? 0);
  }

  return { tracks, clips, durationMs: cursorMs, skippedLineIds };
}
