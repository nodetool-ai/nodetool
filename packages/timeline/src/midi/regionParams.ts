/**
 * Non-destructive midi region parameters (CE6, D53): `transpose`,
 * `velocityOffset` and `quantize` on a clip. The stored notes never change.
 * `applyMidiRegionParams` returns the notes a player reads, so playback,
 * export, the render cache key and the note lines all share one rule.
 */

import type { MidiNote, MidiRegionQuantize, TimelineClip } from "../types.js";
import { divisionToTicks, quantizeNotes, transposeNotes } from "./edit.js";
import { fitExpressionToDuration } from "./notesEdit.js";
import { msToTicks } from "./ticks.js";

export type MidiRegionFields = Pick<
  TimelineClip,
  "transpose" | "velocityOffset" | "quantize"
>;

/** The clip keys the region parameters read. */
export type MidiRegionKeys = "transpose" | "velocityOffset" | "quantize";

export const MIDI_TRANSPOSE_MAX = 48;
export const MIDI_VELOCITY_OFFSET_MAX = 127;

/** Whether the clip carries a region parameter that changes what it plays. */
export function hasMidiRegionParams(clip: MidiRegionFields): boolean {
  return (
    (clip.transpose ?? 0) !== 0 ||
    (clip.velocityOffset ?? 0) !== 0 ||
    (clip.quantize !== undefined && clip.quantize.strength > 0)
  );
}

/** Whether the clip carries an active quantize. */
export function hasRegionQuantize(clip: Pick<TimelineClip, "quantize">): boolean {
  return clip.quantize !== undefined && clip.quantize.strength > 0;
}

/**
 * Where the tempo grid starts, in the clip's content ticks. The region
 * quantize grid sits on the tempo grid of the timeline, so it follows the
 * clip's place (`startMs`), its trim (`inPointMs`) and `tempo.offsetMs`, the
 * same anchor the editor and `quantize_notes` use.
 */
export function regionQuantizePhaseTick(
  clip: Pick<Partial<TimelineClip>, "startMs" | "inPointMs">,
  bpm: number,
  gridOffsetMs = 0
): number {
  return msToTicks(
    gridOffsetMs - (clip.startMs ?? 0) + (clip.inPointMs ?? 0),
    bpm
  );
}

/** The length in ms of the window one repeat of the clip shows. */
function windowMs(clip: Pick<TimelineClip, "durationMs" | "loopLengthMs">): number {
  const loop = clip.loopLengthMs;
  return loop !== undefined && Number.isFinite(loop) && loop > 0 && loop < clip.durationMs
    ? loop
    : clip.durationMs;
}

type RegionClip = MidiRegionFields &
  Pick<TimelineClip, "notes" | "durationMs" | "loopLengthMs"> &
  Pick<Partial<TimelineClip>, "startMs" | "inPointMs">;

/**
 * The notes with the clip's quantize applied on the tempo grid. A note the
 * clip shows stays inside its window: when the grid would move it out (a
 * pickup that rounds up to the next bar), it keeps its stored position.
 */
function quantizeClipNotes(
  clip: RegionClip,
  bpm: number,
  gridOffsetMs: number
): MidiNote[] {
  const notes = clip.notes ?? [];
  const q: MidiRegionQuantize = clip.quantize!;
  const quantized = quantizeNotes([...notes], {
    stepTicks: divisionToTicks(q.grid),
    strength: Math.min(1, Math.max(0, q.strength / 100)),
    phaseTick: regionQuantizePhaseTick(clip, bpm, gridOffsetMs)
  });
  const from = Math.round(msToTicks(clip.inPointMs ?? 0, bpm));
  const to = Math.round(msToTicks((clip.inPointMs ?? 0) + windowMs(clip), bpm));
  const out = quantized.map((note, i) => {
    const raw = notes[i]!;
    const wasShown = raw.startTick >= from && raw.startTick < to;
    const isShown = note.startTick >= from && note.startTick < to;
    return wasShown && !isShown ? { ...note, startTick: raw.startTick } : note;
  });
  return trimNewOverlaps(out, notes);
}

const overlaps = (a: MidiNote, b: MidiNote): boolean =>
  a.startTick < b.startTick + b.durationTick &&
  b.startTick < a.startTick + a.durationTick;

/**
 * Two notes of one pitch that the quantize made overlap would cut each other
 * short on a live synth, where a note-off names only its pitch. The earlier
 * note ends where the later one starts. Two notes that land on one tick leave
 * the later one only. Notes that overlapped before are left, and a muted note
 * emits nothing, so it neither trims nor is trimmed.
 */
function trimNewOverlaps(
  quantized: MidiNote[],
  raw: ReadonlyArray<MidiNote>
): MidiNote[] {
  const groups = new Map<string, number[]>();
  quantized.forEach((note, i) => {
    if (note.muted) return;
    const key = `${note.channel ?? 0}:${note.pitch}`;
    const list = groups.get(key);
    if (list) list.push(i);
    else groups.set(key, [i]);
  });
  const out = [...quantized];
  const dropped = new Set<number>();
  for (const indexes of groups.values()) {
    if (indexes.length < 2) continue;
    indexes.sort((x, y) => out[x]!.startTick - out[y]!.startTick);
    for (let k = 0; k + 1 < indexes.length; k += 1) {
      const a = indexes[k]!;
      const b = indexes[k + 1]!;
      if (!overlaps(out[a]!, out[b]!) || overlaps(raw[a]!, raw[b]!)) continue;
      const gap = out[b]!.startTick - out[a]!.startTick;
      if (gap <= 0) {
        dropped.add(a);
        continue;
      }
      out[a] = fitExpressionToDuration({ ...out[a]!, durationTick: gap });
    }
  }
  return dropped.size === 0 ? out : out.filter((_, i) => !dropped.has(i));
}

/** Notes with the three parameters applied, in the order quantize, transpose, velocity. */
export function applyRegionParamsToNotes(
  clip: RegionClip,
  bpm: number,
  gridOffsetMs = 0
): MidiNote[] {
  let out: MidiNote[] = [...(clip.notes ?? [])];
  if (hasRegionQuantize(clip)) out = quantizeClipNotes(clip, bpm, gridOffsetMs);
  const t = clip.transpose ?? 0;
  if (t !== 0) out = transposeNotes(out, Math.round(t));
  const v = clip.velocityOffset ?? 0;
  if (v !== 0) {
    out = out.map((n) => ({
      ...n,
      velocity: Math.min(127, Math.max(1, Math.round(n.velocity + v)))
    }));
  }
  return out;
}

/**
 * The clip a player reads: notes carry the parameters and the parameter
 * fields are removed. A clip with no active parameter is returned unchanged.
 * `gridOffsetMs` is `tempo.offsetMs`.
 */
export function applyMidiRegionParams<
  T extends MidiRegionFields &
    Pick<TimelineClip, "notes" | "durationMs" | "loopLengthMs"> &
    Pick<Partial<TimelineClip>, "startMs" | "inPointMs" | "controllers">
>(clip: T, bpm: number, gridOffsetMs = 0): T {
  if (!hasMidiRegionParams(clip)) return clip;
  const next = { ...clip };
  if (clip.notes) next.notes = applyRegionParamsToNotes(clip, bpm, gridOffsetMs);
  const t = Math.round(clip.transpose ?? 0);
  if (t !== 0 && clip.controllers) {
    // Polyphonic pressure follows the voice it presses: the lane moves with
    // the notes it is written for.
    next.controllers = clip.controllers.map((lane) =>
      lane.kind === "polyPressure" && lane.pitch !== undefined
        ? { ...lane, pitch: Math.min(127, Math.max(0, lane.pitch + t)) }
        : lane
    );
  }
  delete next.transpose;
  delete next.velocityOffset;
  delete next.quantize;
  return next;
}

/**
 * The clip with its quantize written into the stored notes, at the clip's own
 * place on the tempo grid, and the `quantize` field removed. Transpose and
 * velocity stay as they are. A clip is cut, unrolled or joined from the baked
 * notes, so the notes that sound do not depend on where the new edge falls.
 */
export function bakeRegionQuantize<
  T extends RegionClip
>(clip: T, bpm: number, gridOffsetMs = 0): T {
  if (!hasRegionQuantize(clip)) {
    if (clip.quantize === undefined) return clip;
    const inactive = { ...clip };
    delete inactive.quantize;
    return inactive;
  }
  const next = { ...clip };
  if (clip.notes) next.notes = quantizeClipNotes(clip, bpm, gridOffsetMs);
  delete next.quantize;
  return next;
}
