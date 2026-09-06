/**
 * Named voices a caller can pick instead of spelling out nine synth fields.
 *
 * A preset is the instrument, not a reference to one: `set_track_instrument`
 * resolves `{ preset }` to the object below and stores that on the track, so a
 * document keeps playing the same sound after this table changes.
 */

import type { MidiInstrument } from "../types.js";
import { instrumentSignature } from "./instrument.js";

export interface MidiInstrumentPreset {
  id: string;
  name: string;
  instrument: MidiInstrument;
}

/**
 * The shipped voices. `saw-lead` is spelled out rather than aliased to
 * `DEFAULT_MIDI_INSTRUMENT` so the two are pinned by a test instead of by
 * construction — a default nudged in `instrument.ts` fails there rather than
 * silently renaming the preset's sound.
 */
export const MIDI_INSTRUMENT_PRESETS: readonly MidiInstrumentPreset[] = [
  {
    id: "saw-lead",
    name: "Saw Lead",
    instrument: {
      type: "subtractive",
      waveform: "saw",
      attackMs: 5,
      decayMs: 120,
      sustain: 0.7,
      releaseMs: 150,
      cutoffHz: 4000,
      resonance: 0.7,
      gainDb: -6
    }
  },
  {
    id: "square-lead",
    name: "Square Lead",
    instrument: {
      type: "subtractive",
      waveform: "square",
      attackMs: 3,
      decayMs: 90,
      sustain: 0.65,
      releaseMs: 120,
      cutoffHz: 5200,
      resonance: 1.1,
      gainDb: -8
    }
  },
  {
    id: "soft-pad",
    name: "Soft Pad",
    instrument: {
      type: "subtractive",
      waveform: "triangle",
      attackMs: 600,
      decayMs: 900,
      sustain: 0.85,
      releaseMs: 1400,
      cutoffHz: 1200,
      resonance: 0.4,
      gainDb: -10
    }
  },
  {
    id: "pluck",
    name: "Pluck",
    instrument: {
      type: "subtractive",
      waveform: "saw",
      attackMs: 1,
      decayMs: 110,
      sustain: 0,
      releaseMs: 80,
      cutoffHz: 3000,
      resonance: 1.6,
      gainDb: -6
    }
  },
  {
    id: "bass",
    name: "Bass",
    instrument: {
      type: "subtractive",
      waveform: "saw",
      attackMs: 4,
      decayMs: 200,
      sustain: 0.6,
      releaseMs: 90,
      cutoffHz: 700,
      resonance: 1.2,
      gainDb: -4
    }
  },
  {
    id: "bell",
    name: "Bell",
    instrument: {
      type: "subtractive",
      waveform: "sine",
      attackMs: 2,
      decayMs: 900,
      sustain: 0,
      releaseMs: 700,
      cutoffHz: 6000,
      resonance: 0.5,
      gainDb: -7
    }
  }
];

/** The preset with this id, or undefined. */
export function findInstrumentPreset(
  id: string
): MidiInstrumentPreset | undefined {
  return MIDI_INSTRUMENT_PRESETS.find((preset) => preset.id === id);
}

/**
 * The preset id an instrument came from, by sound rather than by identity —
 * a stored track carries the instrument object, not the id it was picked from,
 * so the editor asks this which chip to highlight.
 */
export function presetIdForInstrument(
  instrument: MidiInstrument
): string | undefined {
  const signature = instrumentSignature(instrument);
  return MIDI_INSTRUMENT_PRESETS.find(
    (preset) => instrumentSignature(preset.instrument) === signature
  )?.id;
}
