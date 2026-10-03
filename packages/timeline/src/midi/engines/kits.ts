/**
 * The DR-1 kit that ships with the timeline, transcribed from FableSynth's
 * TR-VOID factory kit (`src/drum/kits.ts` in github.com/georgi/fablesynth).
 *
 * Pads are laid out in the kit's own order — kick first, then snares, hats,
 * toms and percussion — and answer to MIDI 36 upward, which is where a drum
 * pattern written in any DAW puts them.
 */

import type { DrumPad } from "../../types.js";

/** Everything a pad leaves unsaid, matching DR-1's per-pad defaults. */
const PAD_DEFAULTS = {
  position: 0,
  semitones: 0,
  pitchEnvAmount: 0,
  pitchEnvDecayMs: 60,
  noiseLevel: 0,
  noiseColor: 0,
  ringHz: 1200,
  ringMix: 0,
  attackMs: 1,
  holdMs: 10,
  decayMs: 240,
  curve: 0.35,
  filter: null,
  level: 0.8,
  velocityToLevel: 0.6
} satisfies Omit<DrumPad, "name" | "table">;

const pad = (
  name: string,
  table: DrumPad["table"],
  over: Partial<DrumPad> = {}
): DrumPad => ({ ...PAD_DEFAULTS, name, table, ...over });

/** A high-pass on a metal pad, the way the kit thins its hats. */
const highPass = (cutoffHz: number): DrumPad["filter"] => ({
  type: "hp12",
  cutoffHz,
  resonance: 0.18
});

/** DR-1's TR-VOID kit: sixteen pads from MIDI 36. */
export const TR_VOID_KIT: readonly DrumPad[] = [
  pad("Kick", "thud", {
    semitones: -26,
    pitchEnvAmount: 22,
    pitchEnvDecayMs: 60,
    decayMs: 300
  }),
  pad("Kick 2", "thud", {
    semitones: -19,
    pitchEnvAmount: 16,
    decayMs: 240
  }),
  pad("Snare", "crack", {
    semitones: -12,
    pitchEnvAmount: 5,
    decayMs: 180,
    noiseLevel: 0.5,
    noiseColor: 0.3
  }),
  pad("Clap", "crack", {
    semitones: 7,
    pitchEnvAmount: 2,
    decayMs: 140,
    noiseLevel: 0.35
  }),
  pad("Rim", "tine", { semitones: 24, decayMs: 80 }),
  pad("Closed hat", "tine", {
    semitones: 18,
    decayMs: 40,
    ringHz: 6389,
    ringMix: 0.18,
    filter: highPass(7200)
  }),
  pad("Open hat", "tine", {
    semitones: 12,
    decayMs: 300,
    ringHz: 5197,
    ringMix: 0.28,
    filter: highPass(5200)
  }),
  pad("Ride", "tine", {
    semitones: 5,
    decayMs: 1400,
    ringHz: 1667,
    ringMix: 0.46
  }),
  pad("Low tom", "thud", {
    semitones: -19,
    pitchEnvAmount: 12,
    decayMs: 280
  }),
  pad("Mid tom", "thud", {
    semitones: -12,
    pitchEnvAmount: 10,
    decayMs: 240
  }),
  pad("High tom", "thud", {
    semitones: -5,
    pitchEnvAmount: 8,
    decayMs: 200
  }),
  pad("Crash", "tine", { decayMs: 1800, ringHz: 2741, ringMix: 0.62 }),
  pad("Perc 1", "chime", {
    semitones: -5,
    ringHz: 731,
    ringMix: 0.78,
    decayMs: 160,
    curve: 0.22
  }),
  pad("Perc 2", "grit", {
    position: 0.38,
    semitones: 17,
    noiseLevel: 0.18,
    noiseColor: 0.75,
    ringHz: 3271,
    ringMix: 0.88,
    decayMs: 200,
    filter: highPass(3600)
  }),
  pad("Vox", "vox", { semitones: -5, decayMs: 480 }),
  pad("Glitch", "grit", {
    semitones: -12,
    pitchEnvAmount: 9,
    decayMs: 220
  })
];

/** Synthesized scoring percussion, preserving TR-VOID's pad roles from MIDI 36. */
export const CINEMATIC_KIT: readonly DrumPad[] = [
  pad("Low boom", "thud", {
    position: 0.16,
    semitones: -31,
    pitchEnvAmount: 16,
    pitchEnvDecayMs: 100,
    attackMs: 3,
    decayMs: 1600,
    level: 0.85
  }),
  pad("Gran Cassa", "thud", {
    position: 0.32,
    semitones: -24,
    pitchEnvAmount: 7,
    pitchEnvDecayMs: 45,
    decayMs: 850,
    noiseLevel: 0.3,
    noiseColor: 0.8,
    filter: { type: "lp12", cutoffHz: 1800, resonance: 0.12 }
  }),
  pad("Field snare", "crack", {
    position: 0.2,
    semitones: -8,
    pitchEnvAmount: 3,
    decayMs: 380,
    noiseLevel: 0.7,
    noiseColor: 0.35,
    filter: { type: "lp12", cutoffHz: 6500, resonance: 0.1 }
  }),
  pad("Ensemble strike", "crack", {
    position: 0.35,
    semitones: -14,
    pitchEnvAmount: 5,
    holdMs: 25,
    decayMs: 550,
    noiseLevel: 0.5,
    noiseColor: 0.6
  }),
  pad("Wood tick", "thud", {
    position: 0.55,
    semitones: 16,
    pitchEnvAmount: 2,
    decayMs: 65,
    level: 0.65
  }),
  pad("Shaker", "grit", {
    position: 0.8,
    semitones: 18,
    noiseLevel: 0.7,
    decayMs: 65,
    filter: highPass(4200),
    level: 0.6
  }),
  pad("Brush", "grit", {
    position: 0.7,
    semitones: 12,
    noiseLevel: 0.65,
    attackMs: 8,
    decayMs: 240,
    filter: highPass(3200),
    level: 0.55
  }),
  pad("Metal wash", "tine", {
    position: 0.65,
    semitones: 7,
    attackMs: 20,
    decayMs: 1800,
    ringHz: 1667,
    ringMix: 0.4,
    noiseLevel: 0.35,
    filter: highPass(2400),
    level: 0.55
  }),
  pad("Low taiko", "thud", {
    position: 0.38,
    semitones: -19,
    pitchEnvAmount: 7,
    pitchEnvDecayMs: 35,
    decayMs: 650,
    noiseLevel: 0.12,
    noiseColor: 0.8
  }),
  pad("Mid taiko", "thud", {
    position: 0.42,
    semitones: -12,
    pitchEnvAmount: 6,
    pitchEnvDecayMs: 30,
    decayMs: 480,
    noiseLevel: 0.1,
    noiseColor: 0.7
  }),
  pad("High taiko", "thud", {
    position: 0.46,
    semitones: -5,
    pitchEnvAmount: 5,
    pitchEnvDecayMs: 25,
    decayMs: 340,
    noiseLevel: 0.08
  }),
  pad("Cymbal swell", "tine", {
    position: 0.8,
    attackMs: 350,
    holdMs: 40,
    decayMs: 2400,
    ringHz: 2741,
    ringMix: 0.55,
    noiseLevel: 0.55,
    filter: highPass(1800),
    level: 0.6
  }),
  pad("Low metal", "chime", {
    position: 0.45,
    semitones: -17,
    decayMs: 1200,
    ringHz: 173,
    ringMix: 0.28,
    level: 0.65
  }),
  pad("Small bell", "tine", {
    position: 0.3,
    semitones: 19,
    decayMs: 850,
    level: 0.55
  }),
  pad("Deep gong", "chime", {
    position: 0.7,
    semitones: -24,
    attackMs: 8,
    decayMs: 3000,
    ringHz: 87,
    ringMix: 0.35,
    level: 0.7
  }),
  pad("Tension hit", "grit", {
    position: 0.45,
    semitones: -19,
    pitchEnvAmount: 12,
    pitchEnvDecayMs: 150,
    decayMs: 950,
    noiseLevel: 0.3,
    noiseColor: 0.7,
    filter: { type: "lp12", cutoffHz: 2400, resonance: 0.2 },
    level: 0.65
  })
];
