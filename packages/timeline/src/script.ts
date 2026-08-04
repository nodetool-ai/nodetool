/**
 * Script → timeline assembly, and the voicing rules around it.
 *
 * A script owns its text; audio is derived. Assembly projects each line's
 * current take into a voiceover track: one asset-backed audio clip per voiced
 * line, laid end to end in reading order with the line's authored
 * `pauseAfterMs` gap. Every clip carries its take's word timings, the speaker
 * label, and two linkage keys (`scriptId` + `scriptLineId`) so a later re-voice
 * can round-trip its new take into the assembled sequence — the script mirror
 * of the storyboard's board/shot bridge.
 *
 * One module because three surfaces need the same answer: the editor's "Send
 * to timeline", the `nodetool.script.*` nodes, and the headless
 * `assemble_script_timeline` agent tool. Types come from
 * `@nodetool-ai/protocol` as types only, so this stays free of runtime deps.
 */

import type {
  ScriptLine,
  ScriptSection,
  Speaker,
  Take,
  VoiceBinding
} from "@nodetool-ai/protocol/api-schemas/scripts.js";
import { makeClip, makeTrack } from "./defaults.js";
import type { CaptionWord, TimelineClip, TimelineTrack } from "./types.js";

/** Clip length for a take whose duration could not be determined. */
export const PLACEHOLDER_LINE_MS = 3000;

export interface ScriptAssemblyInput {
  /** Script id stamped onto each clip, linking the cut back to the script. */
  scriptId: string;
  cast: Speaker[];
  sections: ScriptSection[];
}

export interface AssembledScriptTimeline {
  tracks: TimelineTrack[];
  clips: TimelineClip[];
  /** Total length of the voiceover track in ms (last clip end). */
  durationMs: number;
  /** Lines skipped because they have no voiced current take. */
  skippedLineIds: string[];
}

/** Every line of the script in reading order. */
export const scriptLines = (sections: ScriptSection[]): ScriptLine[] =>
  sections.flatMap((section) => section.lines);

/** The current take of a line, if one is selected and present. */
export const currentTake = (line: ScriptLine): Take | undefined =>
  line.takes.find((take) => take.id === line.currentTakeId);

/** The voice a line is voiced with: its own override, else its speaker's. */
export const effectiveVoice = (
  line: ScriptLine,
  cast: Speaker[]
): VoiceBinding | null => {
  if (line.voiceOverride) return line.voiceOverride;
  const speaker = cast.find((s) => s.id === line.speakerId);
  return speaker?.voice ?? null;
};

/**
 * Whether a line needs (re-)voicing: it has no current take, or the text or
 * voice drifted from what that take was voiced from. Staleness is derived,
 * never stored.
 */
export const needsVoicing = (
  line: ScriptLine,
  voice: VoiceBinding | null
): boolean => {
  const take = currentTake(line);
  if (!take) return true;
  return (
    take.textSnapshot !== line.text ||
    JSON.stringify(take.voiceSnapshot ?? null) !== JSON.stringify(voice)
  );
};

/** A line is assemblable when its current take landed as an audio asset. */
export const isAssemblableLine = (line: ScriptLine): boolean => {
  const take = currentTake(line);
  return !!take && typeof take.assetId === "string" && take.assetId.length > 0;
};

/** Copy a take's word timings into the timeline's `CaptionWord` shape. */
export const takeCaptionWords = (take: Take): CaptionWord[] =>
  take.words.map((w) => ({ word: w.word, startMs: w.startMs, endMs: w.endMs }));

export function buildScriptTimeline(
  input: ScriptAssemblyInput
): AssembledScriptTimeline {
  const track = makeTrack({ type: "audio", name: "Voiceover", index: 0 });
  const tracks: TimelineTrack[] = [track];
  const clips: TimelineClip[] = [];
  const skippedLineIds: string[] = [];

  const speakerName = (speakerId?: string | null): string | undefined =>
    speakerId ? input.cast.find((s) => s.id === speakerId)?.name : undefined;

  let cursorMs = 0;
  for (const line of scriptLines(input.sections)) {
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
        voice: effectiveVoice(line, input.cast)?.voice,
        speaker: speakerName(line.speakerId),
        caption: words.length ? { words } : undefined,
        scriptId: input.scriptId,
        scriptLineId: line.id,
        versions: []
      })
    );
    cursorMs += durationMs + Math.max(0, line.pauseAfterMs ?? 0);
  }

  return { tracks, clips, durationMs: cursorMs, skippedLineIds };
}
