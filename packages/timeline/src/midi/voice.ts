/**
 * The voice renderer: notes in, one mono Float32Array out.
 *
 * Pure arithmetic and nothing else — no `Math.random`, no host audio API, no
 * dependency. Two renders of the same input are sample-exact equal, which is
 * what lets `cacheKey.ts` hand back a previous render instead of redoing it,
 * and what lets a test assert a waveform rather than a tolerance band.
 *
 * The chain per note is one oscillator → an ADSR envelope → a lowpass biquad,
 * summed across notes and soft-limited once at the end, so eight notes at
 * velocity 127 stay inside [-1, 1] instead of wrapping.
 */

import type { MidiInstrument, TimelineClip } from "../types.js";
import { visibleNotes } from "./notes.js";
import { noteWindowMs } from "./ticks.js";

/** How long the anti-click ramp at the window end lasts. */
export const MIDI_END_RAMP_MS = 5;

/** Concert-A, the pitch every other note is measured from. */
const A4_HZ = 440;
const A4_PITCH = 69;

/** Frequency of a MIDI note number in Hz. */
export function pitchToHz(pitch: number): number {
  return A4_HZ * Math.pow(2, (pitch - A4_PITCH) / 12);
}

// ── Oscillators ─────────────────────────────────────────────────────────────

/**
 * The polyBLEP correction at `t` for a step of size 1, where `dt` is the phase
 * advanced per sample. Subtracting it from a naive ramp rounds the
 * discontinuity into something band-limited enough to stop the alias whine a
 * raw saw has at anything above a few hundred Hz.
 */
export function polyBlep(t: number, dt: number): number {
  if (t < dt) {
    const x = t / dt;
    return x + x - x * x - 1;
  }
  if (t > 1 - dt) {
    const x = (t - 1) / dt;
    return x * x + x + x + 1;
  }
  return 0;
}

/** A naive (aliasing) saw, kept because it is what polyBLEP is measured
 * against. */
export function naiveSaw(phase: number): number {
  return 2 * phase - 1;
}

/** Band-limited saw, -1..1. `phase` is 0..1, `dt` the per-sample advance. */
export function polyBlepSaw(phase: number, dt: number): number {
  return naiveSaw(phase) - polyBlep(phase, dt);
}

/** Band-limited square, -1..1. Both of its edges get a correction. */
export function polyBlepSquare(phase: number, dt: number): number {
  const naive = phase < 0.5 ? 1 : -1;
  const secondEdge = phase + 0.5 >= 1 ? phase - 0.5 : phase + 0.5;
  return naive + polyBlep(phase, dt) - polyBlep(secondEdge, dt);
}

/** Triangle, -1..1. No correction needed: it has no discontinuity. */
export function triangleWave(phase: number): number {
  return 1 - 4 * Math.abs(phase - 0.5);
}

/** Sine, -1..1. */
export function sineWave(phase: number): number {
  return Math.sin(2 * Math.PI * phase);
}

function oscillator(
  waveform: MidiInstrument["waveform"],
  phase: number,
  dt: number
): number {
  switch (waveform) {
    case "saw":
      return polyBlepSaw(phase, dt);
    case "square":
      return polyBlepSquare(phase, dt);
    case "triangle":
      return triangleWave(phase);
    case "sine":
      return sineWave(phase);
  }
}

// ── Envelope ────────────────────────────────────────────────────────────────

/** Which segment of the ADSR a voice is in. `"done"` means it is silent and
 * will stay silent. */
export type EnvelopeStage = "attack" | "decay" | "sustain" | "release" | "done";

/** How close to a target level counts as having reached it. */
const ENVELOPE_EPSILON = 1e-9;

export interface EnvelopeState {
  stage: EnvelopeStage;
  level: number;
  /** Level the release started from, so it ramps from wherever it was. */
  releaseFrom: number;
  attackPerSample: number;
  decayPerSample: number;
  releasePerSample: number;
  sustain: number;
}

/**
 * A voice's envelope at rest. The per-sample deltas are precomputed so
 * stepping is one add and one compare — and a zero-length segment becomes an
 * infinite delta, which the clamps below turn into an instant jump rather than
 * a NaN.
 */
export function createEnvelope(
  instrument: MidiInstrument,
  sampleRate: number
): EnvelopeState {
  const perSample = (ms: number, span: number) =>
    ms <= 0 ? Number.POSITIVE_INFINITY : span / ((ms / 1000) * sampleRate);
  return {
    stage: "attack",
    level: 0,
    releaseFrom: 0,
    attackPerSample: perSample(instrument.attackMs, 1),
    decayPerSample: perSample(instrument.decayMs, 1 - instrument.sustain),
    releasePerSample: perSample(instrument.releaseMs, 1),
    sustain: instrument.sustain
  };
}

/**
 * Advance the envelope one sample and return its level. `gateOn` false starts
 * (or continues) the release from whatever level the voice was at, so a note
 * released during its attack does not click back up to full first.
 */
export function stepEnvelope(state: EnvelopeState, gateOn: boolean): number {
  if (!gateOn && state.stage !== "release" && state.stage !== "done") {
    state.stage = "release";
    state.releaseFrom = state.level;
  }
  switch (state.stage) {
    case "attack": {
      state.level = Math.min(1, state.level + state.attackPerSample);
      // Same tolerance as the decay: ten steps of 0.1 land a float epsilon
      // short of 1, and a bare `>= 1` leaves the voice attacking forever.
      if (state.level >= 1 - ENVELOPE_EPSILON) {
        state.level = 1;
        state.stage = state.sustain >= 1 ? "sustain" : "decay";
      }
      break;
    }
    case "decay": {
      state.level = Math.max(state.sustain, state.level - state.decayPerSample);
      // Compared with a tolerance: accumulating the per-sample step leaves the
      // level an epsilon above `sustain`, which a bare `<=` reads as "still
      // decaying" and the voice never reaches its sustain stage.
      if (state.level - state.sustain <= ENVELOPE_EPSILON) {
        state.level = state.sustain;
        state.stage = "sustain";
      }
      break;
    }
    case "sustain": {
      state.level = state.sustain;
      break;
    }
    case "release": {
      // The release ramps over `releaseMs` from wherever the note was let go,
      // so a short note and a long one fade at the same rate. A zero-length
      // release (or one starting from silence) lands on zero immediately —
      // `Infinity * 0` would otherwise make the level NaN and poison the mix.
      const step = state.releasePerSample * state.releaseFrom;
      state.level = Number.isFinite(step) ? Math.max(0, state.level - step) : 0;
      if (state.level <= ENVELOPE_EPSILON) {
        state.level = 0;
        state.stage = "done";
      }
      break;
    }
    case "done":
      state.level = 0;
      break;
  }
  return state.level;
}

// ── Filter ──────────────────────────────────────────────────────────────────

/** Normalized biquad coefficients (RBJ Audio-EQ-Cookbook), a0 divided out. */
export interface BiquadCoeffs {
  b0: number;
  b1: number;
  b2: number;
  a1: number;
  a2: number;
}

/** Direct Form I delay line for one channel. */
export interface BiquadState {
  x1: number;
  x2: number;
  y1: number;
  y2: number;
}

/** A fresh, silent filter state. */
export function createBiquadState(): BiquadState {
  return { x1: 0, x2: 0, y1: 0, y2: 0 };
}

/**
 * Lowpass coefficients per the RBJ cookbook — the same formulas WebAudio's
 * `BiquadFilterNode` is specified against, so this renderer and a browser
 * preview of the same instrument sound alike.
 */
export function lowpassCoeffs(
  sampleRate: number,
  frequency: number,
  q: number
): BiquadCoeffs {
  const nyquist = sampleRate / 2;
  const f = Math.min(Math.max(frequency, 1), nyquist * 0.9999);
  const w0 = (2 * Math.PI * f) / sampleRate;
  const cosW0 = Math.cos(w0);
  const sinW0 = Math.sin(w0);
  const alpha = sinW0 / (2 * Math.max(q, 1e-4));
  const b0 = (1 - cosW0) / 2;
  const b1 = 1 - cosW0;
  const b2 = (1 - cosW0) / 2;
  const a0 = 1 + alpha;
  const a1 = -2 * cosW0;
  const a2 = 1 - alpha;
  return {
    b0: b0 / a0,
    b1: b1 / a0,
    b2: b2 / a0,
    a1: a1 / a0,
    a2: a2 / a0
  };
}

/** Run one sample through the filter, advancing its delay line. */
export function stepBiquad(
  coeffs: BiquadCoeffs,
  state: BiquadState,
  x: number
): number {
  const y =
    coeffs.b0 * x +
    coeffs.b1 * state.x1 +
    coeffs.b2 * state.x2 -
    coeffs.a1 * state.y1 -
    coeffs.a2 * state.y2;
  state.x2 = state.x1;
  state.x1 = x;
  state.y2 = state.y1;
  state.y1 = y;
  return y;
}

/** Keeps a dense chord inside [-1, 1] without the hard wrap a clamp would
 * give. `tanh` is monotonic, so it never inverts the shape it limits. */
export function softLimit(x: number): number {
  return Math.tanh(x);
}

// ── Rendering ───────────────────────────────────────────────────────────────

/** One note reduced to what the renderer needs: frames, not milliseconds. */
export interface VoiceEvent {
  pitch: number;
  velocity: number;
  /** First frame the voice sounds on. */
  startFrame: number;
  /** Frame the note is released on — the window end gates a note that runs
   * past it. */
  gateOffFrame: number;
}

/**
 * Sum a set of voices into a buffer of exactly `totalFrames` frames.
 *
 * Everything past the buffer is discarded, release tail included: the window
 * is the contract, so a clip's audio is the same length whatever its notes do.
 * When a voice is still sounding at the last frame the tail is ramped to zero
 * over `MIDI_END_RAMP_MS` so the cut does not click.
 */
export function renderVoiceEvents(
  events: ReadonlyArray<VoiceEvent>,
  totalFrames: number,
  instrument: MidiInstrument,
  sampleRate: number
): Float32Array {
  const out = new Float32Array(Math.max(0, totalFrames));
  if (out.length === 0) return out;

  const coeffs = lowpassCoeffs(
    sampleRate,
    instrument.cutoffHz,
    instrument.resonance
  );
  const masterGain = Math.pow(10, instrument.gainDb / 20);
  let soundingAtEnd = false;

  for (const event of events) {
    const startFrame = Math.max(0, event.startFrame);
    if (startFrame >= out.length) continue;
    const dt = pitchToHz(event.pitch) / sampleRate;
    const amplitude = event.velocity / 127;
    const envelope = createEnvelope(instrument, sampleRate);
    const filter = createBiquadState();
    let phase = 0;

    for (let frame = startFrame; frame < out.length; frame++) {
      const level = stepEnvelope(envelope, frame < event.gateOffFrame);
      if (envelope.stage === "done") break;
      const sample = oscillator(instrument.waveform, phase, dt);
      out[frame] += stepBiquad(coeffs, filter, sample * level * amplitude);
      phase += dt;
      if (phase >= 1) phase -= 1;
    }
    if (envelope.stage !== "done") soundingAtEnd = true;
  }

  for (let frame = 0; frame < out.length; frame++) {
    out[frame] = softLimit(out[frame] * masterGain);
  }

  if (soundingAtEnd) {
    const rampFrames = Math.min(
      out.length,
      Math.round((MIDI_END_RAMP_MS / 1000) * sampleRate)
    );
    for (let i = 0; i < rampFrames; i++) {
      const frame = out.length - rampFrames + i;
      out[frame] *= 1 - (i + 1) / rampFrames;
    }
  }

  return out;
}

export interface RenderMidiClipInput {
  clip: Pick<TimelineClip, "notes" | "inPointMs" | "durationMs">;
  bpm: number;
  instrument: MidiInstrument;
  sampleRate: number;
}

/**
 * Render a midi clip's window.
 *
 * The buffer is exactly `round(durationMs / 1000 * sampleRate)` frames — the
 * window decides the length, never the notes. A note is triggered only if its
 * onset falls inside the window, so a trim that moves `inPointMs` past a note
 * silences it without deleting it.
 */
export function renderMidiClip(input: RenderMidiClipInput): Float32Array {
  const { clip, bpm, instrument, sampleRate } = input;
  const totalFrames = Math.round((clip.durationMs / 1000) * sampleRate);
  const windowStartMs = clip.inPointMs ?? 0;
  const windowEndMs = windowStartMs + clip.durationMs;

  const events: VoiceEvent[] = visibleNotes(clip, bpm).map((note) => {
    const { startMs, endMs } = noteWindowMs(note, bpm);
    const startFrame = Math.round(
      ((startMs - windowStartMs) / 1000) * sampleRate
    );
    const gateOffFrame = Math.round(
      ((Math.min(endMs, windowEndMs) - windowStartMs) / 1000) * sampleRate
    );
    return {
      pitch: note.pitch,
      velocity: note.velocity,
      startFrame,
      // A note whose window rounds to nothing still sounds for one frame,
      // rather than being triggered and immediately released.
      gateOffFrame: Math.max(gateOffFrame, startFrame + 1)
    };
  });

  return renderVoiceEvents(events, totalFrames, instrument, sampleRate);
}

export interface RenderAuditionNoteInput {
  pitch: number;
  velocity: number;
  durationMs: number;
  instrument: MidiInstrument;
  sampleRate: number;
}

/**
 * One note through the same voice, for the instrument picker's preview. The
 * buffer runs `releaseMs` past the note so the tail is heard rather than cut —
 * an audition has no window to respect.
 */
export function renderAuditionNote(
  input: RenderAuditionNoteInput
): Float32Array {
  const { pitch, velocity, durationMs, instrument, sampleRate } = input;
  const totalFrames = Math.round(
    ((durationMs + instrument.releaseMs) / 1000) * sampleRate
  );
  const gateOffFrame = Math.round((durationMs / 1000) * sampleRate);
  return renderVoiceEvents(
    [
      {
        pitch,
        velocity,
        startFrame: 0,
        gateOffFrame: Math.max(1, gateOffFrame)
      }
    ],
    totalFrames,
    instrument,
    sampleRate
  );
}
