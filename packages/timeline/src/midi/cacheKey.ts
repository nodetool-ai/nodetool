/**
 * A stable name for one rendered midi clip.
 *
 * A host hands back the audio a key hits, so the key has to read every input
 * the render depends on — the notes, the window over them, the tempo, the
 * instrument and the sample rate. A field the key does not read is a field
 * that plays back as whatever was rendered before it changed.
 */

import type { MidiInstrument, TimelineClip } from "../types.js";
import { instrumentSignature } from "./instrument.js";
import { sortNotes } from "./notes.js";

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
  clip: Pick<TimelineClip, "notes" | "inPointMs" | "durationMs">;
  bpm: number;
  instrument: MidiInstrument;
  sampleRate: number;
}

/** The cache key for `renderMidiClip` on the same input. */
export function midiRenderKey(input: MidiRenderKeyInput): string {
  const { clip, bpm, instrument, sampleRate } = input;
  const notes = sortNotes(clip.notes ?? []).map((note) => [
    note.id,
    note.pitch,
    note.velocity,
    note.startTick,
    note.durationTick
  ]);
  const canonical = JSON.stringify({
    notes,
    inPointMs: clip.inPointMs ?? 0,
    durationMs: clip.durationMs,
    bpm,
    instrument: instrumentSignature(instrument),
    sampleRate
  });
  return `midi-${fnv1a(canonical)}`;
}
