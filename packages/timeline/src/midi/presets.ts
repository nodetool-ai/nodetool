/**
 * Named voices a caller can pick instead of spelling out a synth's fields.
 *
 * A preset is the instrument, not a reference to one: `set_track_instrument`
 * resolves `{ preset }` to the object below and stores that on the track, so a
 * document keeps playing the same sound after this table changes.
 */

import type {
  BassMidiInstrument,
  MidiInstrument,
  WavetableMidiInstrument,
  WavetableOscillator
} from "../types.js";
import { TR_VOID_KIT } from "./engines/kits.js";
import { instrumentSignature } from "./instrument.js";

export interface MidiInstrumentPreset {
  id: string;
  name: string;
  instrument: MidiInstrument;
}

/** A WT-1 oscillator with the fields a preset does not bother to state. */
const osc = (over: Partial<WavetableOscillator>): WavetableOscillator => ({
  table: "prime",
  position: 0.3,
  semitones: 0,
  fine: 0,
  level: 0.8,
  unison: 1,
  detune: 0.2,
  ...over
});

/** A WT-1 patch, with the plugin's defaults filled in around it. */
const wavetable = (
  over: Partial<WavetableMidiInstrument>
): WavetableMidiInstrument => ({
  type: "wavetable",
  oscA: osc({}),
  oscB: osc({ level: 0 }),
  subLevel: 0,
  subOctave: -1,
  noiseLevel: 0,
  filterType: "lp24",
  cutoffHz: 2200,
  resonance: 0.35,
  drive: 0.15,
  filterEnvAmount: 1.5,
  keyTrack: 0.3,
  ampEnv: { attackMs: 5, decayMs: 200, sustain: 0.7, releaseMs: 250 },
  modEnv: { attackMs: 2, decayMs: 320, sustain: 0, releaseMs: 200 },
  gainDb: -8,
  ...over
});

/** A BL-1 patch, with the plugin's defaults filled in around it. */
const bass = (over: Partial<BassMidiInstrument>): BassMidiInstrument => ({
  type: "bass",
  table: "prime",
  position: 0.3,
  semitones: 0,
  subShape: "square",
  subOctave: -1,
  subLevel: 0.55,
  filterType: "lp24",
  cutoffHz: 340,
  resonance: 0.62,
  drive: 0.45,
  filterEnvAmount: 2.8,
  keyTrack: 0.3,
  filterAttackMs: 1,
  filterDecayMs: 180,
  ampEnv: { attackMs: 1, decayMs: 300, sustain: 0.5, releaseMs: 80 },
  accentAmount: 0.7,
  accentVelocity: 100,
  slideMs: 60,
  gainDb: -6,
  ...over
});

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
  },
  {
    id: "wt1-prime-lead",
    name: "WT-1 Prime Lead",
    instrument: wavetable({
      oscA: osc({ table: "prime", position: 0.55, unison: 3, detune: 0.18 }),
      oscB: osc({ table: "pulse", position: 0.4, semitones: -12, level: 0.5 }),
      cutoffHz: 3200,
      resonance: 0.4,
      filterEnvAmount: 1.2,
      ampEnv: { attackMs: 4, decayMs: 180, sustain: 0.75, releaseMs: 220 }
    })
  },
  {
    id: "wt1-bloom-pad",
    name: "WT-1 Bloom Pad",
    instrument: wavetable({
      oscA: osc({ table: "bloom", position: 0.35, unison: 5, detune: 0.35 }),
      oscB: osc({ table: "vox", position: 0.5, fine: 7, level: 0.55 }),
      subLevel: 0.25,
      cutoffHz: 1400,
      resonance: 0.25,
      drive: 0.08,
      filterEnvAmount: 2,
      ampEnv: { attackMs: 600, decayMs: 900, sustain: 0.85, releaseMs: 1400 },
      modEnv: { attackMs: 900, decayMs: 1600, sustain: 0.4, releaseMs: 1200 },
      gainDb: -11
    })
  },
  {
    id: "wt1-vox-morph",
    name: "WT-1 Vox Morph",
    instrument: wavetable({
      oscA: osc({ table: "vox", position: 0.25, unison: 2, detune: 0.12 }),
      oscB: osc({ table: "glitch", position: 0.6, level: 0.35 }),
      noiseLevel: 0.12,
      filterType: "bp12",
      cutoffHz: 900,
      resonance: 0.55,
      filterEnvAmount: 2.4,
      ampEnv: { attackMs: 40, decayMs: 400, sustain: 0.6, releaseMs: 400 }
    })
  },
  {
    id: "wt1-chime-bell",
    name: "WT-1 Chime",
    instrument: wavetable({
      oscA: osc({ table: "chime", position: 0.7, detune: 0 }),
      oscB: osc({ table: "chime", position: 0.2, semitones: 12, level: 0.4 }),
      cutoffHz: 6000,
      resonance: 0.2,
      drive: 0,
      filterEnvAmount: 0.6,
      ampEnv: { attackMs: 2, decayMs: 1200, sustain: 0, releaseMs: 900 },
      modEnv: { attackMs: 1, decayMs: 600, sustain: 0, releaseMs: 400 },
      gainDb: -9
    })
  },
  {
    id: "bl1-acid",
    name: "BL-1 Acid",
    instrument: bass({})
  },
  {
    id: "bl1-deep",
    name: "BL-1 Deep",
    instrument: bass({
      table: "pulse",
      position: 0.15,
      subLevel: 0.75,
      cutoffHz: 220,
      resonance: 0.4,
      drive: 0.25,
      filterEnvAmount: 1.8,
      filterDecayMs: 320,
      ampEnv: { attackMs: 3, decayMs: 500, sustain: 0.7, releaseMs: 140 },
      slideMs: 90
    })
  },
  {
    id: "bl1-rubber",
    name: "BL-1 Rubber",
    instrument: bass({
      table: "bloom",
      position: 0.5,
      subShape: "sine",
      subLevel: 0.45,
      filterType: "lp12",
      cutoffHz: 480,
      resonance: 0.78,
      drive: 0.6,
      filterEnvAmount: 3.2,
      filterDecayMs: 120,
      accentAmount: 0.85,
      slideMs: 45
    })
  },
  {
    id: "dr1-tr-void",
    name: "DR-1 TR-Void Kit",
    instrument: {
      type: "drum",
      baseNote: 36,
      pads: [...TR_VOID_KIT],
      gainDb: -6
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
