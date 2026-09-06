/**
 * WT-1 — the wavetable voice, ported from FableSynth's `src/engine/worklet.js`
 * (github.com/georgi/fablesynth).
 *
 * Two morphing wavetable oscillators plus a sub and noise, through the anti-
 * aliased drive and the Cytomic filter, with the mod envelope sweeping the
 * cutoff and the amp envelope shaping the note. Polyphonic: one voice per note,
 * summed.
 *
 * Not ported: the plugin's stereo field (pan, unison spread), its second filter
 * and routing modes, its LFOs and mod matrix, and the master FX rack. This
 * renderer is mono and offline, and a track's effects live on the track.
 */

import type { WavetableMidiInstrument, WavetableOscillator } from "../../types.js";
import {
  Adsr,
  AdaaDrive,
  ColouredNoise,
  Rng,
  StateVariableFilter,
  TableOscillator,
  pitchHz
} from "./dsp.js";

/** One note being played by the voice. */
export interface WavetableVoiceEvent {
  pitch: number;
  velocity: number;
  startFrame: number;
  gateOffFrame: number;
}

function makeOsc(
  spec: WavetableOscillator,
  index: number
): TableOscillator | null {
  if (spec.level <= 1e-4) return null;
  // Oscillator B starts a third of a cycle in, so a two-osc patch on the same
  // table is not one oscillator at twice the level.
  return new TableOscillator(
    spec.table,
    spec.unison,
    spec.detune,
    index * 0.31
  );
}

function oscPitch(spec: WavetableOscillator, pitch: number): number {
  return pitch + spec.semitones + spec.fine / 100;
}

/**
 * Render one WT-1 note into `out`, starting at `event.startFrame` and stopping
 * when the amp envelope closes or the buffer ends.
 *
 * Returns true if the voice was still sounding at the last frame, so the caller
 * knows the buffer needs its anti-click ramp.
 */
export function renderWavetableVoice(
  out: Float32Array,
  event: WavetableVoiceEvent,
  instrument: WavetableMidiInstrument,
  sampleRate: number
): boolean {
  const startFrame = Math.max(0, event.startFrame);
  if (startFrame >= out.length) return false;

  const oscA = makeOsc(instrument.oscA, 0);
  const oscB = makeOsc(instrument.oscB, 1);
  const ampEnv = new Adsr(instrument.ampEnv, sampleRate);
  const modEnv = new Adsr(instrument.modEnv, sampleRate);
  const filter = new StateVariableFilter();
  const drive = new AdaaDrive();
  // Seeded from the note, so the same clip renders the same noise every time.
  const noise =
    instrument.noiseLevel > 1e-4
      ? new ColouredNoise(
          new Rng(0x9e3779b9 ^ (event.pitch * 2654435761 + startFrame)),
          1,
          sampleRate
        )
      : null;

  const hzA = pitchHz(oscPitch(instrument.oscA, event.pitch));
  const hzB = pitchHz(oscPitch(instrument.oscB, event.pitch));
  const subHz = pitchHz(event.pitch + 12 * instrument.subOctave);
  const subInc = subHz / sampleRate;
  let subPhase = 0;

  // Velocity shapes the level the way the plugin does — squared, with a floor
  // so a quiet note is quiet rather than absent.
  const velocity = event.velocity / 127;
  const amplitude = 0.25 + 0.75 * velocity * velocity;
  const levelA = instrument.oscA.level * instrument.oscA.level;
  const levelB = instrument.oscB.level * instrument.oscB.level;
  const subGain = instrument.subLevel * instrument.subLevel;
  const noiseGain = instrument.noiseLevel * instrument.noiseLevel * 0.35;
  const keyOffset = (instrument.keyTrack * (event.pitch - 60)) / 12;

  for (let frame = startFrame; frame < out.length; frame++) {
    const level = ampEnv.step(frame < event.gateOffFrame);
    if (ampEnv.stage === "done") return false;
    const mod = modEnv.step(frame < event.gateOffFrame);

    let sample = 0;
    if (oscA) {
      sample += oscA.next(hzA, instrument.oscA.position, sampleRate) * levelA;
    }
    if (oscB) {
      sample += oscB.next(hzB, instrument.oscB.position, sampleRate) * levelB;
    }
    if (subGain > 0) {
      sample += Math.sin(2 * Math.PI * subPhase) * subGain;
      subPhase += subInc;
      if (subPhase >= 1) subPhase -= 1;
    }
    if (noise) {
      sample += noise.next() * noiseGain;
    }

    const cutoff =
      instrument.cutoffHz *
      Math.pow(2, instrument.filterEnvAmount * mod + keyOffset);
    const driven = drive.process(sample * 0.5, instrument.drive);
    out[frame] +=
      filter.process(
        driven,
        instrument.filterType,
        cutoff,
        instrument.resonance,
        sampleRate
      ) *
      level *
      amplitude;
  }
  return true;
}
