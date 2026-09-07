/**
 * The track's voice, and a stable name for it.
 *
 * `instrumentSignature` names every field the renderer reads, so a cache key
 * built from it cannot hand back audio rendered with a different filter. It
 * walks the object rather than listing fields, because the FableSynth voices
 * (WT-1, BL-1, DR-1) carry nested oscillators, envelopes and pads — a
 * hand-written list would go stale on the first field added to one of them.
 */

import type { MidiInstrument, SubtractiveMidiInstrument } from "../types.js";

/**
 * A plain saw with a soft filter — what a midi track plays until told
 * otherwise. Typed as the subtractive synth rather than the union, so a caller
 * can spread it and change `waveform` without narrowing first.
 */
export const DEFAULT_MIDI_INSTRUMENT: SubtractiveMidiInstrument = {
  type: "subtractive",
  waveform: "saw",
  attackMs: 5,
  decayMs: 120,
  sustain: 0.7,
  releaseMs: 150,
  cutoffHz: 4000,
  resonance: 0.7,
  gainDb: -6
};

/**
 * A value as one string, with object keys in sorted order so two instruments
 * that differ only in how they were built hash the same.
 */
function stableString(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableString).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${k}:${stableString(v)}`).join(",")}}`;
  }
  return String(value);
}

/** Every sound-affecting field of an instrument, in one stable string. */
export function instrumentSignature(instrument: MidiInstrument): string {
  return stableString(instrument);
}

/** Middle C — the note an audition plays when the voice is a pitched one. */
export const AUDITION_PITCH = 60;

/**
 * The note to audition a voice with. A drum kit answers only to its own pads,
 * so middle C would preview it as silence; every other voice takes middle C.
 */
export function auditionPitch(instrument: MidiInstrument): number {
  return instrument.type === "drum" ? instrument.baseNote : AUDITION_PITCH;
}

/**
 * How long a note rings on past its gate, in ms — the release of whichever
 * envelope ends last. An audition adds this to the note so the tail is heard
 * rather than cut.
 */
export function instrumentTailMs(instrument: MidiInstrument): number {
  switch (instrument.type) {
    case "subtractive":
      return instrument.releaseMs;
    case "wavetable":
      return Math.max(instrument.ampEnv.releaseMs, instrument.modEnv.releaseMs);
    case "bass":
      return instrument.ampEnv.releaseMs;
    case "drum":
      // A drum is a one-shot: its whole envelope plays past the gate.
      return instrument.pads.reduce(
        (longest, pad) =>
          Math.max(longest, pad.attackMs + pad.holdMs + pad.decayMs),
        0
      );
  }
}
