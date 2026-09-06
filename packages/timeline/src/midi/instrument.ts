/**
 * The track's voice, and a stable name for it.
 *
 * `instrumentSignature` names every field the renderer reads, so a cache key
 * built from it cannot hand back audio rendered with a different filter. A
 * field added to the instrument must be added here in the same change —
 * `tests/midi.cacheKey.test.ts` walks the object's own keys to catch that.
 */

import type { MidiInstrument } from "../types.js";

/** A plain saw with a soft filter — what a midi track plays until told
 * otherwise. */
export const DEFAULT_MIDI_INSTRUMENT: MidiInstrument = {
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

/** Every sound-affecting field of an instrument, in one stable string. */
export function instrumentSignature(instrument: MidiInstrument): string {
  return [
    instrument.type,
    instrument.waveform,
    instrument.attackMs,
    instrument.decayMs,
    instrument.sustain,
    instrument.releaseMs,
    instrument.cutoffHz,
    instrument.resonance,
    instrument.gainDb
  ].join("|");
}
