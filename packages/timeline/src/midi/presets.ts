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
import { CINEMATIC_KIT, TR_VOID_KIT } from "./engines/kits.js";
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
    id: "sampler",
    name: "Sampler · load audio samples",
    instrument: { type: "sampler", zones: [], oneShot: true, attackMs: 0, releaseMs: 100, gainDb: -6 }
  },
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
    id: "wt1-cinematic-strings",
    name: "WT-1 Cinematic Strings",
    instrument: wavetable({
      oscA: osc({ position: 0.67, unison: 5, detune: 0.14, level: 0.85 }),
      oscB: osc({
        table: "bloom",
        position: 0.48,
        fine: -5,
        unison: 3,
        detune: 0.1,
        level: 0.65
      }),
      filterType: "lp12",
      cutoffHz: 2400,
      resonance: 0.12,
      drive: 0.04,
      filterEnvAmount: 0.65,
      keyTrack: 0.65,
      ampEnv: { attackMs: 320, decayMs: 900, sustain: 0.88, releaseMs: 1100 },
      modEnv: { attackMs: 650, decayMs: 1200, sustain: 0.65, releaseMs: 1000 },
      gainDb: -10
    })
  },
  {
    id: "wt1-chamber-strings",
    name: "WT-1 Chamber Strings",
    instrument: wavetable({
      oscA: osc({ position: 0.64, unison: 3, detune: 0.07 }),
      oscB: osc({ table: "pulse", position: 0.22, fine: 3, level: 0.38 }),
      filterType: "lp12",
      cutoffHz: 1800,
      resonance: 0.16,
      drive: 0.02,
      filterEnvAmount: 0.45,
      keyTrack: 0.75,
      ampEnv: { attackMs: 110, decayMs: 650, sustain: 0.8, releaseMs: 480 },
      modEnv: { attackMs: 180, decayMs: 700, sustain: 0.5, releaseMs: 400 },
      gainDb: -9
    })
  },
  {
    id: "wt1-short-strings",
    name: "WT-1 Short Strings",
    instrument: wavetable({
      oscA: osc({ position: 0.67, unison: 3, detune: 0.09 }),
      oscB: osc({ table: "bloom", position: 0.55, fine: -4, level: 0.48 }),
      cutoffHz: 1600,
      resonance: 0.14,
      drive: 0.04,
      filterEnvAmount: 1.1,
      keyTrack: 0.65,
      ampEnv: { attackMs: 12, decayMs: 240, sustain: 0, releaseMs: 100 },
      modEnv: { attackMs: 8, decayMs: 180, sustain: 0, releaseMs: 80 },
      gainDb: -8
    })
  },
  {
    id: "wt1-low-strings",
    name: "WT-1 Low Strings",
    instrument: wavetable({
      oscA: osc({ position: 0.66, unison: 3, detune: 0.08 }),
      oscB: osc({ table: "pulse", position: 0.3, fine: -4, level: 0.5 }),
      filterType: "lp12",
      cutoffHz: 1100,
      resonance: 0.18,
      drive: 0.08,
      filterEnvAmount: 0.55,
      keyTrack: 0.5,
      ampEnv: { attackMs: 180, decayMs: 650, sustain: 0.85, releaseMs: 700 },
      modEnv: { attackMs: 300, decayMs: 800, sustain: 0.6, releaseMs: 650 },
      gainDb: -9
    })
  },
  {
    id: "wt1-warm-brass",
    name: "WT-1 Warm Brass",
    instrument: wavetable({
      oscA: osc({ position: 0.72, unison: 3, detune: 0.06 }),
      oscB: osc({ position: 0.66, fine: 4, level: 0.6 }),
      cutoffHz: 850,
      resonance: 0.2,
      drive: 0.12,
      filterEnvAmount: 1.8,
      keyTrack: 0.7,
      ampEnv: { attackMs: 65, decayMs: 450, sustain: 0.75, releaseMs: 350 },
      modEnv: { attackMs: 100, decayMs: 500, sustain: 0.4, releaseMs: 250 },
      gainDb: -10
    })
  },
  {
    id: "wt1-air-choir",
    name: "WT-1 Air Choir",
    instrument: wavetable({
      oscA: osc({ table: "vox", position: 0.08, unison: 3, detune: 0.12 }),
      oscB: osc({
        table: "vox",
        position: 0.8,
        fine: -6,
        unison: 3,
        detune: 0.08,
        level: 0.55
      }),
      noiseLevel: 0.06,
      filterType: "lp12",
      cutoffHz: 3200,
      resonance: 0.08,
      drive: 0,
      filterEnvAmount: 0.3,
      keyTrack: 0.2,
      ampEnv: { attackMs: 500, decayMs: 1000, sustain: 0.85, releaseMs: 1600 },
      modEnv: { attackMs: 800, decayMs: 1200, sustain: 0.7, releaseMs: 1400 },
      gainDb: -10
    })
  },
  {
    id: "wt1-dark-swell",
    name: "WT-1 Dark Swell",
    instrument: wavetable({
      oscA: osc({ table: "bloom", position: 0.65, unison: 5, detune: 0.2 }),
      oscB: osc({ table: "vox", position: 0.72, semitones: -12, level: 0.5 }),
      cutoffHz: 450,
      resonance: 0.2,
      drive: 0.08,
      filterEnvAmount: 2.2,
      keyTrack: 0.4,
      ampEnv: { attackMs: 1400, decayMs: 1400, sustain: 0.85, releaseMs: 2200 },
      modEnv: { attackMs: 2200, decayMs: 1600, sustain: 0.65, releaseMs: 2000 },
      gainDb: -10
    })
  },
  {
    id: "wt1-soft-keys",
    name: "WT-1 Soft Keys",
    instrument: wavetable({
      oscA: osc({ position: 0.28, detune: 0, level: 0.9 }),
      oscB: osc({ table: "chime", position: 0.18, semitones: 12, level: 0.3 }),
      cutoffHz: 2200,
      resonance: 0.08,
      drive: 0.02,
      filterEnvAmount: 1.1,
      keyTrack: 0.65,
      ampEnv: { attackMs: 5, decayMs: 1800, sustain: 0.08, releaseMs: 500 },
      modEnv: { attackMs: 2, decayMs: 650, sustain: 0, releaseMs: 300 },
      gainDb: -7
    })
  },
  {
    id: "wt1-glass-mallet",
    name: "WT-1 Glass Mallet",
    instrument: wavetable({
      oscA: osc({ table: "chime", position: 0.38, detune: 0, level: 0.85 }),
      oscB: osc({ position: 0, semitones: 12, level: 0.35 }),
      filterType: "lp12",
      cutoffHz: 3800,
      resonance: 0.08,
      drive: 0,
      filterEnvAmount: 0.5,
      keyTrack: 0.6,
      ampEnv: { attackMs: 2, decayMs: 1100, sustain: 0, releaseMs: 450 },
      modEnv: { attackMs: 1, decayMs: 350, sustain: 0, releaseMs: 250 },
      gainDb: -9
    })
  },
  {
    id: "wt1-muted-pluck",
    name: "WT-1 Muted Pluck",
    instrument: wavetable({
      oscA: osc({ table: "pulse", position: 0.35, detune: 0, level: 0.85 }),
      oscB: osc({ position: 0.25, fine: -3, level: 0.4 }),
      cutoffHz: 700,
      resonance: 0.22,
      drive: 0.05,
      filterEnvAmount: 2,
      keyTrack: 0.6,
      ampEnv: { attackMs: 3, decayMs: 340, sustain: 0, releaseMs: 130 },
      modEnv: { attackMs: 1, decayMs: 180, sustain: 0, releaseMs: 100 },
      gainDb: -8
    })
  },
  {
    id: "bl1-cinematic-sub",
    name: "BL-1 Cinematic Sub",
    instrument: bass({
      position: 0.08,
      subShape: "sine",
      subLevel: 0.45,
      cutoffHz: 280,
      resonance: 0.1,
      drive: 0.08,
      filterEnvAmount: 0.4,
      filterAttackMs: 20,
      filterDecayMs: 500,
      ampEnv: { attackMs: 25, decayMs: 700, sustain: 0.85, releaseMs: 300 },
      accentAmount: 0.15,
      slideMs: 0,
      gainDb: -9
    })
  },
  {
    id: "bl1-score-pulse",
    name: "BL-1 Score Pulse",
    instrument: bass({
      position: 0.65,
      subShape: "sine",
      subLevel: 0.5,
      cutoffHz: 380,
      resonance: 0.25,
      drive: 0.18,
      filterEnvAmount: 1.7,
      filterDecayMs: 160,
      ampEnv: { attackMs: 4, decayMs: 280, sustain: 0.12, releaseMs: 90 },
      accentAmount: 0.35,
      slideMs: 0,
      gainDb: -9
    })
  },
  {
    id: "bl1-rounded-bass",
    name: "BL-1 Rounded Bass",
    instrument: bass({
      position: 0.38,
      subShape: "sine",
      subLevel: 0.35,
      cutoffHz: 650,
      resonance: 0.14,
      drive: 0.1,
      filterEnvAmount: 0.8,
      filterDecayMs: 380,
      ampEnv: { attackMs: 8, decayMs: 650, sustain: 0.35, releaseMs: 180 },
      accentAmount: 0.2,
      slideMs: 25,
      gainDb: -9
    })
  },
  {
    id: "dr1-cinematic",
    name: "DR-1 Cinematic Kit",
    instrument: {
      type: "drum",
      baseNote: 36,
      pads: [...CINEMATIC_KIT],
      gainDb: -10
    }
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
