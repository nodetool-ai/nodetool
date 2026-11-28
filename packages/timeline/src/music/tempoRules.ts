/**
 * Tempo rules of music mode.
 *
 * MD9: a sequence with the `music` object uses a whole-number tempo from 30
 * to 300 BPM and one of 2/4, 3/4, 4/4 or 6/8, the range the model accepts.
 * MD6: the tempo is locked while the sequence holds an audio clip, because
 * audio does not follow a tempo change and would leave the bar grid. The lock
 * is derived on every check, never stored. A key change is not a timing
 * change and stays allowed.
 *
 * `native/timeline/src/music/MusicPlan.cpp` ports these with the same
 * messages, and the native tempo edit (`setProjectSettings`) applies them.
 */

import { resolveTempo } from "../midi/tempo.js";
import type { TimelineClip, TimelineMusic, TimelineTempo } from "../types.js";

export const MUSIC_MIN_BPM = 30;
export const MUSIC_MAX_BPM = 300;

/** The signatures a music project may use, as `beatsPerBar/beatUnit`. */
export const MUSIC_TIME_SIGNATURES: ReadonlyArray<{ beatsPerBar: number; beatUnit: number }> = [
  { beatsPerBar: 2, beatUnit: 4 },
  { beatsPerBar: 3, beatUnit: 4 },
  { beatsPerBar: 4, beatUnit: 4 },
  { beatsPerBar: 6, beatUnit: 8 }
];

export const MUSIC_TEMPO_BPM_MESSAGE = "A music project needs a whole-number tempo from 30 to 300 BPM.";
export const MUSIC_TEMPO_SIGNATURE_MESSAGE = "A music project uses 2/4, 3/4, 4/4 or 6/8.";
export const TEMPO_LOCKED_MESSAGE =
  "The tempo cannot change while the sequence holds an audio clip, because the audio would leave the bar grid.";

/** The sequence fields the tempo rules read. */
export interface TempoRuleSequence {
  tempo?: TimelineTempo;
  music?: TimelineMusic;
  clips: ReadonlyArray<Pick<TimelineClip, "mediaType">>;
}

/** Why `tempo` breaks MD9, or null when a music project may use it. */
export function musicTempoRefusal(tempo: Pick<TimelineTempo, "bpm" | "timeSignature">): string | null {
  if (!Number.isInteger(tempo.bpm) || tempo.bpm < MUSIC_MIN_BPM || tempo.bpm > MUSIC_MAX_BPM) {
    return MUSIC_TEMPO_BPM_MESSAGE;
  }
  const { beatsPerBar, beatUnit } = tempo.timeSignature;
  if (!MUSIC_TIME_SIGNATURES.some((s) => s.beatsPerBar === beatsPerBar && s.beatUnit === beatUnit)) {
    return MUSIC_TEMPO_SIGNATURE_MESSAGE;
  }
  return null;
}

/** MD6: the sequence holds an audio clip. */
export function isTempoLocked(sequence: Pick<TempoRuleSequence, "clips">): boolean {
  return sequence.clips.some((clip) => clip.mediaType === "audio");
}

function timingChanged(before: TimelineTempo, after: TimelineTempo): boolean {
  return (
    before.bpm !== after.bpm ||
    before.offsetMs !== after.offsetMs ||
    before.timeSignature.beatsPerBar !== after.timeSignature.beatsPerBar ||
    before.timeSignature.beatUnit !== after.timeSignature.beatUnit
  );
}

/**
 * Why a tempo edit to `next` is refused, or null when it may apply. The lock
 * comes first, then MD9 for a sequence with the `music` object. A document
 * without `tempo` is read at the default tempo.
 */
export function tempoChangeRefusal(sequence: TempoRuleSequence, next: TimelineTempo): string | null {
  if (timingChanged(resolveTempo(sequence), next) && isTempoLocked(sequence)) {
    return TEMPO_LOCKED_MESSAGE;
  }
  return sequence.music ? musicTempoRefusal(next) : null;
}
