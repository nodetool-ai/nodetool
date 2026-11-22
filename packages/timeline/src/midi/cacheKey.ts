/**
 * A stable name for one rendered midi clip.
 *
 * A host hands back the audio a key hits, so the key has to read every input
 * the render depends on — the notes, the window over them, the tempo, the
 * instrument and the sample rate. A field the key does not read is a field
 * that plays back as whatever was rendered before it changed.
 */

import { activeLoopMs } from "../clipLoop.js";
import {
  hasRegionQuantize,
  regionQuantizePhaseTick,
  type MidiRegionKeys
} from "./regionParams.js";
import { divisionToTicks } from "./edit.js";
import type {
  MidiInstrument,
  MusicKey,
  StepKey,
  TimelineChord,
  TimelineClip
} from "../types.js";
import { instrumentSignature } from "./instrument.js";
import { sortNotes } from "./notes.js";
import type { MidiRenderControls } from "./voice.js";

/**
 * FNV-1a over a string, as 8 lowercase hex digits. Chosen over a real hash for
 * the same reason the rest of this module has no imports: the package root
 * carries no runtime dependencies, and `node:crypto` is not reachable from the
 * browser bundle.
 */
export function fnv1a(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    // The FNV prime, 16777619, by shift-and-add so the result stays inside a
    // 32-bit integer instead of losing precision to a float multiply.
    hash =
      (hash +
        ((hash << 1) +
          (hash << 4) +
          (hash << 7) +
          (hash << 8) +
          (hash << 24))) >>>
      0;
  }
  return hash.toString(16).padStart(8, "0");
}

export interface MidiRenderKeyInput {
  clip: Pick<
    TimelineClip,
    "notes" | "controllers" | "inPointMs" | "durationMs" | "loopLengthMs" | MidiRegionKeys
  > &
    Pick<Partial<TimelineClip>, "startMs" | "pattern" | "patternPhaseTicks" | "patternRowCycles">;
  bpm: number;
  /** `tempo.offsetMs`, the origin of the grid a region quantize snaps to. */
  gridOffsetMs?: number;
  /** Document chords and key when `clip.pattern` uses `pitchSource: "chords" | "key"`. */
  chords?: ReadonlyArray<TimelineChord>;
  key?: StepKey | MusicKey;
  /** Extra render-time controls (e.g. automated instrument cutoffHz). */
  controls?: Partial<MidiRenderControls>;
  instrument: MidiInstrument;
  sampleRate: number;
}

/** The grid phase in ticks, modulo one grid step, so a move by whole steps keeps its render. */
function regionQuantizePhase(
  clip: MidiRenderKeyInput["clip"],
  bpm: number,
  gridOffsetMs: number
): number {
  const step = divisionToTicks(clip.quantize!.grid);
  const phase = regionQuantizePhaseTick(clip, bpm, gridOffsetMs);
  return Math.round((((phase % step) + step) % step) * 1000) / 1000;
}

/** The cache key for `renderMidiClip` on the same input. */
export function midiRenderKey(input: MidiRenderKeyInput): string {
  const { clip, bpm, instrument, sampleRate } = input;
  // A quantize reads the tempo grid, so where the clip sits on it is an input.
  const quantizePhase = hasRegionQuantize(clip)
    ? regionQuantizePhase(clip, bpm, input.gridOffsetMs ?? 0)
    : undefined;
  const notes = sortNotes(clip.notes ?? []).map((note) => [
    note.id,
    note.pitch,
    note.velocity,
    note.startTick,
    note.durationTick,
    note.muted ? 1 : 0,
    note.channel ?? 0,
    note.releaseVelocity ?? -1,
    note.expression ?? null
  ]);
  const controllers = (clip.controllers ?? []).map((lane) => [
    lane.id,
    lane.kind,
    lane.cc ?? -1,
    lane.pitch ?? -1,
    lane.channel ?? 0,
    lane.interpolation ?? "linear",
    lane.points.map((p) => [p.id, p.tick, p.value])
  ]);
  const canonical = JSON.stringify({
    notes,
    controllers,
    ...(clip.pattern ? { pattern: fnv1a(JSON.stringify(clip.pattern)) } : {}),
    ...(clip.pattern?.pitchSource === "chords"
      ? {
          patternStartMs: clip.startMs ?? 0,
          patternGridOffsetMs: input.gridOffsetMs ?? 0,
          patternChords: input.chords ? fnv1a(JSON.stringify(input.chords)) : null,
          patternKey: input.key ?? null
        }
      : clip.pattern?.pitchSource === "key"
        ? { patternKey: input.key ?? null }
        : {}),
    ...(clip.patternPhaseTicks ? { patternPhaseTicks: clip.patternPhaseTicks } : {}),
    ...(clip.patternRowCycles ? { patternRowCycles: clip.patternRowCycles } : {}),
    ...(input.controls ? { controls: input.controls } : {}),
    inPointMs: clip.inPointMs ?? 0,
    durationMs: clip.durationMs,
    ...(clip.transpose ? { transpose: clip.transpose } : {}),
    ...(clip.velocityOffset ? { velocityOffset: clip.velocityOffset } : {}),
    ...(clip.quantize && clip.quantize.strength > 0
      ? { quantize: [clip.quantize.grid, clip.quantize.strength, quantizePhase] }
      : {}),
    ...(activeLoopMs(clip) !== undefined ? { loopLengthMs: clip.loopLengthMs } : {}),
    bpm,
    instrument: instrumentSignature(instrument),
    sampleRate
  });
  return `midi-${fnv1a(canonical)}`;
}
