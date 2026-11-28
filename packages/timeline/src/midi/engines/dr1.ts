/**
 * DR-1 — the drum machine voice, ported from FableSynth's
 * `src/drum/engine/worklet-drum.js` (github.com/georgi/fablesynth).
 *
 * Sixteen pads laid out from `baseNote` upward, one MIDI note each. A pad is a
 * one-shot: a wavetable oscillator dropped by a pitch envelope, plus coloured
 * noise and a ring modulator, through an optional filter and an attack-hold-
 * decay envelope. The note's length does not gate it — a drum rings for as long
 * as its decay says, which is what lets a pattern be written as sixteenth-note
 * ticks.
 *
 * Not ported: the plugin's sample-player layer, its mod matrix, choke groups,
 * output buses and per-pad FX rack.
 */

import type { DrumMidiInstrument, DrumPad } from "../../types.js";
import {
  AdEnvelope,
  ColouredNoise,
  Rng,
  StateVariableFilter,
  TableOscillator,
  pitchHz
} from "./dsp.js";

export interface DrumVoiceEvent {
  pitch: number;
  velocity: number;
  startFrame: number;
  /** Per-note pitch expression (semitones) for kit row Note/Octave bend (SQ42, D90). */
  expression?: {
    pitch?: ReadonlyArray<{ frame: number; value: number }>;
  };
}

/** The pitch a pad's oscillator plays before its pitch envelope moves it. */
const PAD_BASE_PITCH = 60;

/** e^-4.5 — where the exponential decay segment lands, normalized out below. */
const E45 = Math.exp(-4.5);
const INV_E45 = 1 / (1 - E45);

/** The pad a note plays, or null when the note is outside the kit. */
export function padForNote(
  instrument: DrumMidiInstrument,
  pitch: number
): DrumPad | null {
  const index = pitch - instrument.baseNote;
  if (index < 0 || index >= instrument.pads.length) return null;
  return instrument.pads[index] ?? null;
}

function stepTrackAt(
  points: ReadonlyArray<{ frame: number; value: number }> | undefined,
  frame: number
): number {
  if (!points || points.length === 0 || frame < points[0]!.frame) return 0;
  let lo = 0;
  let hi = points.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (points[mid]!.frame <= frame) lo = mid;
    else hi = mid - 1;
  }
  return points[lo]!.value;
}

/**
 * Render one drum hit into `out`. Returns true if the pad was still sounding at
 * the last frame of the buffer.
 */
export function renderDrumVoice(
  out: Float32Array,
  event: DrumVoiceEvent,
  instrument: DrumMidiInstrument,
  sampleRate: number,
  pitchBendSemitones?: ReadonlyArray<{ frame: number; value: number }>
): boolean {
  const pad = padForNote(instrument, event.pitch);
  if (!pad) return false;
  const startFrame = Math.max(0, event.startFrame);
  if (startFrame >= out.length) return false;

  const osc = new TableOscillator(pad.table, 1, 0);
  const pitchEnv = new AdEnvelope(0, pad.pitchEnvDecayMs, sampleRate);
  const filter = pad.filter ? new StateVariableFilter() : null;
  const noise =
    pad.noiseLevel > 1e-4
      ? new ColouredNoise(
          // Seeded from the pad and the hit, so a rendered pattern is the same
          // every time and two pads never share the same noise.
          new Rng(0x1d3c5b7f ^ (event.pitch * 2654435761 + startFrame)),
          pad.noiseColor,
          sampleRate
        )
      : null;

  const exprPitch = event.expression?.pitch;
  const pitchOffset = exprPitch && exprPitch.length > 0 ? exprPitch[0]!.value : 0;
  const hasBend = Boolean(pitchBendSemitones && pitchBendSemitones.length > 0);
  const basePitch = PAD_BASE_PITCH + pad.semitones + pitchOffset;
  const noiseGain = pad.noiseLevel * pad.noiseLevel * 0.35;
  const ringInc = Math.min(sampleRate * 0.45, Math.max(20, pad.ringHz)) / sampleRate;
  let ringPhase = 0.25;

  const velocity = event.velocity / 127;
  const velGain = 1 - pad.velocityToLevel * (1 - velocity);
  const levelGain = pad.level * pad.level * velGain;

  const attackFrames = Math.max(1, (pad.attackMs / 1000) * sampleRate);
  const holdFrames = (pad.holdMs / 1000) * sampleRate;
  const decayFrames = Math.max(1, (pad.decayMs / 1000) * sampleRate);
  const decayStart = attackFrames + holdFrames;
  const decayEnd = decayStart + decayFrames;
  const invDecay = 1 / decayFrames;

  for (let frame = startFrame; frame < out.length; frame++) {
    const t = frame - startFrame;
    if (t >= decayEnd) return false;

    let amp: number;
    if (t < attackFrames) {
      amp = t / attackFrames;
    } else if (t < decayStart) {
      amp = 1;
    } else {
      const td = t - decayStart;
      // The exponential is normalized to reach zero rather than stepping down
      // from its e^-4.5 tail; `curve` blends the straight line into it.
      const exponential = (Math.exp(-4.5 * td * invDecay) - E45) * INV_E45;
      const linear = 1 - td * invDecay;
      amp = linear + (exponential - linear) * pad.curve;
    }

    const channelBend = hasBend ? stepTrackAt(pitchBendSemitones, frame) : 0;
    const hz = pitchHz(basePitch + channelBend + pad.pitchEnvAmount * pitchEnv.step());
    let sample = osc.next(hz, pad.position, sampleRate);
    if (noise) {
      sample += noise.next() * noiseGain;
    }
    if (pad.ringMix > 1e-6) {
      // A fixed-Hz carrier breaks the oscillator's harmonic series into the
      // inharmonic sidebands struck metal and synthetic cymbals are made of.
      const carrier = Math.sin(ringPhase * Math.PI * 2) * Math.SQRT2;
      sample *= 1 + pad.ringMix * (carrier - 1);
      ringPhase += ringInc;
      if (ringPhase >= 1) ringPhase -= 1;
    }
    if (filter && pad.filter) {
      sample = filter.process(
        sample,
        pad.filter.type,
        pad.filter.cutoffHz,
        pad.filter.resonance,
        sampleRate
      );
    }
    out[frame] += sample * amp * levelGain;
  }
  return true;
}
