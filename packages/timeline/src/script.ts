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
import { makeClip, makeClipVersion, makeTrack } from "./defaults.js";
import { sourceRate } from "./sourceRate.js";
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
 * Whether a line needs (re-)voicing: it has no current take, or the text,
 * voice, recorded delivery note or recorded pace drifted from what that take
 * was voiced from. Staleness is derived, never stored.
 *
 * `speed` is the pace speed a voicing would send now (null for the provider
 * default, `paceSpeed` of the script's setup pace). Leave it out where the
 * script's pace is unknown; a take compares pace only when it recorded one.
 */
export const needsVoicing = (
  line: ScriptLine,
  voice: VoiceBinding | null,
  speed?: number | null
): boolean => {
  const take = currentTake(line);
  if (!take) return true;
  return (
    take.textSnapshot !== line.text ||
    JSON.stringify(take.voiceSnapshot ?? null) !== JSON.stringify(voice) ||
    // Only a take that recorded the direction it was voiced with can drift
    // from it; older takes and paths that send no direction record none.
    (take.directionSnapshot !== undefined &&
      take.directionSnapshot !== (line.direction?.trim() ?? "")) ||
    (take.speedSnapshot !== undefined &&
      speed !== undefined &&
      take.speedSnapshot !== speed)
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

/** The voiceover clip for one voiced line, laid at `startMs`. */
function lineClip(
  input: ScriptAssemblyInput,
  line: ScriptLine,
  take: Take,
  trackId: string,
  startMs: number
): TimelineClip {
  const durationMs = take.durationMs > 0 ? take.durationMs : PLACEHOLDER_LINE_MS;
  const words = takeCaptionWords(take);
  const voice = effectiveVoice(line, input.cast);
  const speakerName = line.speakerId
    ? input.cast.find((s) => s.id === line.speakerId)?.name
    : undefined;
  return makeClip({
    trackId,
    name: line.text.slice(0, 40) || "Line",
    startMs,
    durationMs,
    mediaType: "audio",
    // This is authored TTS, even though its audio asset already exists.
    // Providers without word timings need the generated-clip prompt
    // fallback so the transcript panel and script lane still show text.
    sourceType: "generated",
    bindingKind: "text-to-audio",
    status: "generated",
    currentAssetId: take.assetId,
    prompt: line.text,
    provider: voice?.provider,
    model: voice?.model,
    voice: voice?.voice,
    speaker: speakerName,
    caption: words.length ? { words } : undefined,
    scriptId: input.scriptId,
    scriptLineId: line.id,
    versions: []
  });
}

export function buildScriptTimeline(
  input: ScriptAssemblyInput
): AssembledScriptTimeline {
  const track = makeTrack({ type: "audio", name: "Voiceover", index: 0 });
  const tracks: TimelineTrack[] = [track];
  const clips: TimelineClip[] = [];
  const skippedLineIds: string[] = [];

  let cursorMs = 0;
  for (const line of scriptLines(input.sections)) {
    const take = currentTake(line);
    if (!take || !take.assetId) {
      skippedLineIds.push(line.id);
      continue;
    }
    const clip = lineClip(input, line, take, track.id, cursorMs);
    clips.push(clip);
    cursorMs += clip.durationMs + Math.max(0, line.pauseAfterMs ?? 0);
  }

  return { tracks, clips, durationMs: cursorMs, skippedLineIds };
}

export interface ScriptReconcileResult {
  tracks: TimelineTrack[];
  clips: TimelineClip[];
  /** False when the script asked for no change; the inputs come back as-is. */
  changed: boolean;
}

/**
 * Bring a sequence's voiceover clips in line with its linked script, keeping
 * every placement a person made.
 *
 * - A line that already has a clip keeps the clip's position. A new current
 *   take swaps the asset on every linked fragment. Clips with explicit source
 *   windows keep their trims and duration, even when the new source is shorter,
 *   matching timeline take selection. Untouched clips take the new length.
 *   Text, speaker and voice changes only relabel clips.
 * - A voiced line with no clip gets one right after the previous line's clip
 *   (plus that line's authored pause), moved later past any clip on the
 *   voiceover track it would overlap.
 * - A deleted or no longer voiced line loses its clip.
 * - Reordering lines moves nothing: clips move only when someone moves them.
 *
 * The voiceover track is the one the script's clips sit on; a sequence
 * without one gets a new audio track at the bottom.
 */
export function reconcileScriptClips(
  doc: { tracks: TimelineTrack[]; clips: TimelineClip[] },
  input: ScriptAssemblyInput
): ScriptReconcileResult {
  const owned = new Map<string, TimelineClip[]>();
  for (const clip of doc.clips) {
    if (clip.scriptId === input.scriptId && clip.scriptLineId) {
      const fragments = owned.get(clip.scriptLineId);
      if (fragments) {
        fragments.push(clip);
      } else {
        owned.set(clip.scriptLineId, [clip]);
      }
    }
  }

  let tracks = doc.tracks;
  let trackId = owned.values().next().value?.[0]?.trackId;
  const needsTrack = (): string => {
    if (trackId) return trackId;
    const track = makeTrack({
      type: "audio",
      name: "Voiceover",
      index: tracks.length
    });
    tracks = [...tracks, track];
    trackId = track.id;
    return trackId;
  };

  const voicedLines = scriptLines(input.sections).flatMap((line) => {
    const take = currentTake(line);
    return take && take.assetId ? [{ line, take }] : [];
  });
  const keptLineIds = new Set(voicedLines.map(({ line }) => line.id));
  const survives = (clip: TimelineClip): boolean =>
    clip.scriptId !== input.scriptId ||
    !clip.scriptLineId ||
    keptLineIds.has(clip.scriptLineId);

  // Update every existing clip first, so a new clip is placed against the
  // lengths the existing clips end up with, not the ones they had.
  const updates = new Map<string, TimelineClip>();
  for (const { line, take } of voicedLines) {
    const existing = owned.get(line.id);
    if (!existing) continue;
    const firstSourceMs = existing.reduce(
      (first, fragment) => Math.min(first, fragment.inPointMs ?? 0),
      Number.POSITIVE_INFINITY
    );
    for (const fragment of existing) {
      const clip = updateLineClip(fragment, input, line, take, firstSourceMs);
      if (clip !== fragment) updates.set(fragment.id, clip);
    }
  }
  const current = (clip: TimelineClip): TimelineClip => updates.get(clip.id) ?? clip;

  const added: TimelineClip[] = [];
  // Where the previous line's clip ends, plus its authored pause.
  let anchorMs = 0;

  for (const { line, take } of voicedLines) {
    const existing = owned.get(line.id);
    let endMs: number;
    if (existing) {
      endMs = existing.reduce((end, fragment) => {
        const clip = current(fragment);
        return Math.max(end, clip.startMs + clip.durationMs);
      }, 0);
    } else {
      const fresh = lineClip(input, line, take, needsTrack(), anchorMs);
      const occupied = [
        ...doc.clips
          .filter((c) => c.trackId === fresh.trackId && survives(c))
          .map(current),
        ...added
      ];
      const clip = { ...fresh, startMs: firstFreeStart(occupied, anchorMs, fresh.durationMs) };
      added.push(clip);
      endMs = clip.startMs + clip.durationMs;
    }
    anchorMs = endMs + Math.max(0, line.pauseAfterMs ?? 0);
  }

  const kept = doc.clips.filter(survives);
  const removed = kept.length !== doc.clips.length;
  const clips = [...kept.map(current), ...added];

  const changed = removed || updates.size > 0 || added.length > 0;
  return changed
    ? { tracks, clips, changed }
    : { tracks: doc.tracks, clips: doc.clips, changed };
}

/** The earliest start at or after `fromMs` where `durationMs` fits between `clips`. */
function firstFreeStart(
  clips: readonly TimelineClip[],
  fromMs: number,
  durationMs: number
): number {
  const sorted = [...clips].sort((a, b) => a.startMs - b.startMs);
  let startMs = fromMs;
  for (const clip of sorted) {
    const endMs = clip.startMs + clip.durationMs;
    if (endMs <= startMs) continue;
    if (clip.startMs >= startMs + durationMs) break;
    startMs = endMs;
  }
  return startMs;
}

/** A line's existing clip with the line's current take and labels; same object when nothing changed. */
function updateLineClip(
  clip: TimelineClip,
  input: ScriptAssemblyInput,
  line: ScriptLine,
  take: Take,
  firstSourceMs: number
): TimelineClip {
  const fresh = lineClip(input, line, take, clip.trackId, clip.startMs);
  const labels: Partial<TimelineClip> = {
    name: fresh.name,
    prompt: fresh.prompt,
    speaker: fresh.speaker,
    provider: fresh.provider,
    model: fresh.model,
    voice: fresh.voice
  };
  let next: TimelineClip = clip;
  for (const [key, value] of Object.entries(labels) as [keyof TimelineClip, unknown][]) {
    if (clip[key] !== value) {
      next = { ...next, [key]: value };
    }
  }
  if (clip.currentAssetId !== take.assetId) {
    // Split and trim write explicit source windows. Preserve those edits,
    // including a lone surviving fragment, when replacing the underlying take.
    const hasWindow = clip.inPointMs !== undefined || clip.outPointMs !== undefined;
    const rate = sourceRate(clip);
    const inPointMs = clip.inPointMs ?? 0;
    const caption = fresh.caption && hasWindow
      ? {
          ...fresh.caption,
          words: fresh.caption.words.flatMap((word) => {
            // Split words belong to the fragment containing their start. Only
            // the first retained source window keeps a head-trimmed overlap.
            if (inPointMs > firstSourceMs && word.startMs < inPointMs) {
              return [];
            }
            const startMs = Math.max(0, (word.startMs - inPointMs) / rate);
            const endMs = Math.min(clip.durationMs, (word.endMs - inPointMs) / rate);
            return endMs > startMs ? [{ ...word, startMs, endMs }] : [];
          })
        }
      : fresh.caption;
    const versions = clip.versions ?? [];
    const version =
      versions.find((v) => v.assetId === take.assetId) ??
      makeClipVersion({
        createdAt: take.createdAt,
        workflowUpdatedAt: take.createdAt,
        assetId: take.assetId,
        durationMs: fresh.durationMs,
        source: "generated"
      });
    next = {
      ...next,
      currentAssetId: take.assetId,
      activeTakeId: version.id,
      versions: versions.includes(version) ? versions : [...versions, version],
      inPointMs: clip.inPointMs,
      outPointMs: clip.outPointMs,
      durationMs: hasWindow ? clip.durationMs : fresh.durationMs,
      caption,
      status: "generated"
    };
  }
  return next;
}
