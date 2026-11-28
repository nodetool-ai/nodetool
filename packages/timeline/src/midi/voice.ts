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

import type {
  MidiInstrument,
  MusicKey,
  StepKey,
  SubtractiveMidiInstrument,
  TimelineChord,
  TimelineClip
} from "../types.js";
import { renderSamplerVoices, samplerTailMs, type SamplerSamples } from "./sampler.js";
import { instrumentTailMs } from "./instrument.js";
import { renderBassVoices } from "./engines/bl1.js";
import { renderDrumVoice } from "./engines/dr1.js";
import { renderWavetableVoice } from "./engines/wt1.js";
import { expandMidiLoop, type ExpandMidiPatternDoc } from "../clipLoop.js";
import type { MidiRegionKeys } from "./regionParams.js";
import { playableNotes } from "./notes.js";
import { noteWindowMs, ticksToMs } from "./ticks.js";
import {
  MIDI_EXPRESSION_SPEC,
  controllerLaneKey,
  MIDI_PITCH_BEND_RANGE_SEMITONES,
  midiClipControllerEvents
} from "./controllers.js";

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
  waveform: SubtractiveMidiInstrument["waveform"],
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
  instrument: SubtractiveMidiInstrument,
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
  /**
   * Per-note expression as curves on the frame clock. `renderVoiceEvents`
   * applies pitch (semitones) and volume (linear gain) per sample. The other
   * engines ignore it.
   */
  expression?: {
    pitch?: ReadonlyArray<FramePoint>;
    volume?: ReadonlyArray<FramePoint>;
  };
}

/** One point of a curve on the frame clock. */
export interface FramePoint {
  frame: number;
  value: number;
}

/**
 * A value that changes over the render, as points on the frame clock. `step`
 * holds each value until the next point, otherwise the value blends linearly.
 */
class FrameCurve {
  private cursor = 0;
  constructor(
    private readonly points: ReadonlyArray<FramePoint>,
    private readonly neutral: number,
    private readonly step: boolean
  ) {}

  at(frame: number): number {
    const pts = this.points;
    if (pts.length === 0) return this.neutral;
    if (this.cursor > 0 && pts[this.cursor].frame > frame) this.cursor = 0;
    while (this.cursor + 1 < pts.length && pts[this.cursor + 1].frame <= frame) {
      this.cursor++;
    }
    const a = pts[this.cursor];
    if (frame < a.frame) return this.neutral;
    const b = pts[this.cursor + 1];
    if (this.step || !b || b.frame <= a.frame) return a.value;
    return a.value + ((b.value - a.value) * (frame - a.frame)) / (b.frame - a.frame);
  }
}

/**
 * What a clip's controller lanes do to a render, on the frame clock. Both
 * tracks are step curves: the lane events say when a value changes.
 */
export interface MidiRenderControls {
  /** Summed pitch bend of every pitch-bend lane, in semitones. */
  pitchBendSemitones?: ReadonlyArray<FramePoint>;
  /** Product of the cc 7 (`(v/127)^2`) and cc 11 (`v/127`) lane gains. */
  gain?: ReadonlyArray<FramePoint>;
  /** Frames at which the sustain pedal (cc 64, any lane >= 64) goes down or up. */
  pedal?: ReadonlyArray<{ frame: number; down: boolean }>;
  /** Automated filter cutoff in Hz (linear interpolation between points). */
  cutoffHz?: ReadonlyArray<FramePoint>;
}

/**
 * Fold a clip's controller events into the tracks the renderer reads. Frames
 * count from the window start. Pitch bend ignores the channel and uses
 * `MIDI_PITCH_BEND_RANGE_SEMITONES`.
 */
export function midiClipRenderControls(
  clip: Pick<
    TimelineClip,
    "controllers" | "inPointMs" | "durationMs" | "loopLengthMs" | MidiRegionKeys
  > &
    Pick<Partial<TimelineClip>, "startMs" | "pattern" | "patternPhaseTicks" | "patternRowCycles">,
  bpm: number,
  sampleRate: number,
  gridOffsetMs = 0,
  instrument?: MidiInstrument,
  patternDoc?: ExpandMidiPatternDoc
): MidiRenderControls {
  const events = midiClipControllerEvents(
    { ...clip, startMs: 0 },
    bpm,
    Number.NEGATIVE_INFINITY,
    gridOffsetMs,
    instrument,
    patternDoc
  );
  const bend = new Map<string, number>();
  const gain = new Map<string, number>();
  const pedal = new Map<string, boolean>();
  const controls: MidiRenderControls = {};
  const bendTrack: FramePoint[] = [];
  const gainTrack: FramePoint[] = [];
  const pedalTrack: { frame: number; down: boolean }[] = [];
  const push = (track: FramePoint[], frame: number, value: number): void => {
    const last = track[track.length - 1];
    if (last && last.frame === frame) last.value = value;
    else track.push({ frame, value });
  };
  for (const event of events) {
    const frame = Math.round((event.timeMs / 1000) * sampleRate);
    if (event.kind === "pitchBend") {
      bend.set(controllerLaneKey(event), (event.value / 8192) * MIDI_PITCH_BEND_RANGE_SEMITONES);
      let sum = 0;
      for (const v of bend.values()) sum += v;
      push(bendTrack, frame, sum);
    } else if (event.kind === "cc" && (event.cc === 7 || event.cc === 11)) {
      gain.set(
        controllerLaneKey(event),
        event.cc === 7 ? (event.value / 127) ** 2 : event.value / 127
      );
      let product = 1;
      for (const v of gain.values()) product *= v;
      push(gainTrack, frame, product);
    } else if (event.kind === "cc" && event.cc === 64) {
      pedal.set(controllerLaneKey(event), event.value >= 64);
      const down = [...pedal.values()].some(Boolean);
      const last = pedalTrack[pedalTrack.length - 1];
      if ((last?.down ?? false) !== down) pedalTrack.push({ frame, down });
    }
  }
  if (bendTrack.length > 0) controls.pitchBendSemitones = bendTrack;
  if (gainTrack.length > 0) controls.gain = gainTrack;
  if (pedalTrack.length > 0) controls.pedal = pedalTrack;
  return controls;
}

/** Multiply `out` by the gain track, in place. */
function applyGainTrack(
  out: Float32Array,
  track: ReadonlyArray<FramePoint> | undefined
): void {
  if (!track || track.length === 0) return;
  const curve = new FrameCurve(track, 1, true);
  for (let frame = 0; frame < out.length; frame++) out[frame] *= curve.at(frame);
}

/**
 * Apply the master gain, soft-limit the sum, and ramp out a tail that was still
 * sounding at the last frame so the cut does not click.
 *
 * Every engine finishes this way, so a buffer's ending does not depend on which
 * instrument filled it.
 */
function finishBuffer(
  out: Float32Array,
  gainDb: number,
  soundingAtEnd: boolean,
  sampleRate: number
): Float32Array {
  const masterGain = Math.pow(10, gainDb / 20);
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

/**
 * Sum a set of voices into a buffer of exactly `totalFrames` frames.
 *
 * Everything past the buffer is discarded, release tail included: the window
 * is the contract, so a clip's audio is the same length whatever its notes do.
 * When a voice is still sounding at the last frame the tail is ramped to zero
 * over `MIDI_END_RAMP_MS` so the cut does not click.
 *
 * This is the built-in subtractive voice. `renderInstrumentEvents` picks it or
 * one of the FableSynth engines from the instrument's `type`.
 */
export function renderVoiceEvents(
  events: ReadonlyArray<VoiceEvent>,
  totalFrames: number,
  instrument: SubtractiveMidiInstrument,
  sampleRate: number,
  controls: MidiRenderControls = {}
): Float32Array {
  const out = new Float32Array(Math.max(0, totalFrames));
  if (out.length === 0) return out;

  const cutoffCurve = controls.cutoffHz?.length
    ? new FrameCurve(controls.cutoffHz, instrument.cutoffHz, false)
    : undefined;
  const staticCoeffs = cutoffCurve
    ? undefined
    : lowpassCoeffs(sampleRate, instrument.cutoffHz, instrument.resonance);
  let soundingAtEnd = false;

  for (const event of events) {
    const startFrame = Math.max(0, event.startFrame);
    if (startFrame >= out.length) continue;
    const baseDt = pitchToHz(event.pitch) / sampleRate;
    const amplitude = event.velocity / 127;
    const bendCurve = controls.pitchBendSemitones
      ? new FrameCurve(controls.pitchBendSemitones, 0, true)
      : undefined;
    const pitchCurve = event.expression?.pitch
      ? new FrameCurve(event.expression.pitch, MIDI_EXPRESSION_SPEC.pitch.neutral, false)
      : undefined;
    const volumeCurve = event.expression?.volume
      ? new FrameCurve(event.expression.volume, MIDI_EXPRESSION_SPEC.volume.neutral, false)
      : undefined;
    const envelope = createEnvelope(instrument, sampleRate);
    const filter = createBiquadState();
    let lastCutoffHz = instrument.cutoffHz;
    let activeCoeffs =
      staticCoeffs ?? lowpassCoeffs(sampleRate, lastCutoffHz, instrument.resonance);
    let phase = 0;

    for (let frame = startFrame; frame < out.length; frame++) {
      const level = stepEnvelope(envelope, frame < event.gateOffFrame);
      if (envelope.stage === "done") break;
      let dt = baseDt;
      if (bendCurve || pitchCurve) {
        const semitones = (bendCurve?.at(frame) ?? 0) + (pitchCurve?.at(frame) ?? 0);
        if (semitones !== 0) dt = baseDt * 2 ** (semitones / 12);
      }
      if (cutoffCurve) {
        const hz = cutoffCurve.at(frame);
        if (Math.abs(hz - lastCutoffHz) > 0.05) {
          lastCutoffHz = hz;
          activeCoeffs = lowpassCoeffs(sampleRate, hz, instrument.resonance);
        }
      }
      const sample = oscillator(instrument.waveform, phase, dt);
      const voiceGain = volumeCurve ? volumeCurve.at(frame) : 1;
      out[frame] += stepBiquad(
        activeCoeffs,
        filter,
        sample * level * amplitude * voiceGain
      );
      phase += dt;
      phase -= Math.floor(phase);
    }
    if (envelope.stage !== "done") soundingAtEnd = true;
  }

  applyGainTrack(out, controls.gain);
  return finishBuffer(out, instrument.gainDb, soundingAtEnd, sampleRate);
}

/**
 * Render a set of note events with whichever engine the instrument names.
 *
 * The events are the same for every engine — pitch, velocity, and the frames
 * the note sounds between — so a clip switched from one instrument to another
 * plays the same phrase.
 */
export function renderInstrumentEvents(
  events: ReadonlyArray<VoiceEvent>,
  totalFrames: number,
  instrument: MidiInstrument,
  sampleRate: number,
  samples: SamplerSamples = {},
  controls: MidiRenderControls = {}
): Float32Array {
  if (instrument.type === "subtractive") {
    return renderVoiceEvents(events, totalFrames, instrument, sampleRate, controls);
  }
  const out = new Float32Array(Math.max(0, totalFrames));
  if (out.length === 0) return out;
  let soundingAtEnd = false;

  switch (instrument.type) {
    case "sampler":
      soundingAtEnd = renderSamplerVoices(
        out,
        events,
        instrument,
        sampleRate,
        samples,
        controls.pitchBendSemitones
      );
      break;
    case "wavetable":
      for (const event of events) {
        if (
          renderWavetableVoice(
            out,
            event,
            instrument,
            sampleRate,
            controls.pitchBendSemitones
          )
        ) {
          soundingAtEnd = true;
        }
      }
      break;
    case "bass":
      soundingAtEnd = renderBassVoices(
        out,
        events,
        instrument,
        sampleRate,
        controls.pitchBendSemitones
      );
      break;
    case "drum":
      for (const event of events) {
        if (
          renderDrumVoice(
            out,
            event,
            instrument,
            sampleRate,
            controls.pitchBendSemitones
          )
        ) {
          soundingAtEnd = true;
        }
      }
      break;
    case "vst":
      // Native plug-in code: only a host process renders it (see `vstHost`).
      return out;
  }

  applyGainTrack(out, controls.gain);
  return finishBuffer(out, instrument.gainDb, soundingAtEnd, sampleRate);
}

export interface RenderMidiClipInput {
  samples?: SamplerSamples;
  clip: Pick<
    TimelineClip,
    "notes" | "controllers" | "inPointMs" | "durationMs" | "loopLengthMs" | MidiRegionKeys
  > &
    Pick<Partial<TimelineClip>, "startMs" | "pattern" | "patternPhaseTicks" | "patternRowCycles">;
  bpm: number;
  /** `tempo.offsetMs`, the origin of the grid a region quantize snaps to. */
  gridOffsetMs?: number;
  /** Document chords and key for step-pattern expansion (`pitchSource: "chords" | "key"`). */
  chords?: ReadonlyArray<TimelineChord>;
  key?: StepKey | MusicKey;
  /** Extra render-time controls (e.g. automated instrument cutoffHz). */
  controls?: Partial<MidiRenderControls>;
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
  const { bpm, instrument, sampleRate } = input;
  const patternDoc =
    input.chords !== undefined || input.key !== undefined
      ? { chords: input.chords, key: input.key }
      : undefined;
  const clip = expandMidiLoop(input.clip, bpm, input.gridOffsetMs ?? 0, instrument, patternDoc);
  const clipControls = midiClipRenderControls(clip, bpm, sampleRate);
  const controls: MidiRenderControls = input.controls
    ? { ...clipControls, ...input.controls }
    : clipControls;
  return renderInstrumentEvents(
    midiClipVoiceEvents(clip, bpm, sampleRate),
    midiClipFrames(clip, sampleRate),
    instrument,
    sampleRate,
    input.samples,
    controls
  );
}

/** How many frames `renderMidiClip` returns for `clip`. */
export function midiClipFrames(
  clip: Pick<TimelineClip, "durationMs">,
  sampleRate: number
): number {
  return Math.round((clip.durationMs / 1000) * sampleRate);
}

/**
 * The notes `renderMidiClip` triggers, in frames from the window start. A host
 * that renders an instrument itself (a VST plug-in) plays these.
 */
export function midiClipVoiceEvents(
  source: Pick<
    TimelineClip,
    "notes" | "controllers" | "inPointMs" | "durationMs" | "loopLengthMs" | MidiRegionKeys
  > &
    Pick<Partial<TimelineClip>, "startMs" | "pattern" | "patternPhaseTicks" | "patternRowCycles">,
  bpm: number,
  sampleRate: number,
  gridOffsetMs = 0,
  instrument?: MidiInstrument,
  patternDoc?: ExpandMidiPatternDoc
): VoiceEvent[] {
  const clip = expandMidiLoop(source, bpm, gridOffsetMs, instrument, patternDoc);
  const windowStartMs = clip.inPointMs ?? 0;
  const windowEndMs = windowStartMs + clip.durationMs;

  const totalFrames = midiClipFrames(clip, sampleRate);
  const pedal = midiClipRenderControls(clip, bpm, sampleRate).pedal ?? [];
  const toFrame = (ms: number): number => Math.round((ms / 1000) * sampleRate);

  return playableNotes(clip, bpm).map((note) => {
    const { startMs, endMs } = noteWindowMs(note, bpm);
    const startFrame = toFrame(startMs - windowStartMs);
    let gateOffFrame = toFrame(Math.min(endMs, windowEndMs) - windowStartMs);
    // Sustain pedal: a note released while the pedal is down rings until the
    // pedal comes up, or until the window ends.
    let held = false;
    let releaseAt = totalFrames;
    for (const change of pedal) {
      if (change.frame <= gateOffFrame) held = change.down;
      else if (held && !change.down) {
        releaseAt = change.frame;
        break;
      }
    }
    if (held) gateOffFrame = Math.max(gateOffFrame, releaseAt);
    const event: VoiceEvent = {
      pitch: note.pitch,
      velocity: note.velocity,
      startFrame,
      // A note whose window rounds to nothing still sounds for one frame,
      // rather than being triggered and immediately released.
      gateOffFrame: Math.max(gateOffFrame, startFrame + 1)
    };
    const curve = (
      points: ReadonlyArray<{ tick: number; value: number }> | undefined
    ): FramePoint[] | undefined =>
      points && points.length > 0
        ? points.map((p) => ({
            frame: startFrame + toFrame(ticksToMs(p.tick, bpm)),
            value: p.value
          }))
        : undefined;
    const pitch = curve(note.expression?.pitch);
    const volume = curve(note.expression?.volume);
    if (pitch || volume) {
      event.expression = {};
      if (pitch) event.expression.pitch = pitch;
      if (volume) event.expression.volume = volume;
    }
    return event;
  });
}

export interface RenderAuditionNoteInput {
  samples?: SamplerSamples;
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
    ((durationMs + (instrument.type === "sampler" ? Math.min(30000, samplerTailMs(instrument, pitch, input.samples ?? {})) : instrumentTailMs(instrument))) / 1000) * sampleRate
  );
  const gateOffFrame = Math.round((durationMs / 1000) * sampleRate);
  return renderInstrumentEvents(
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
    sampleRate,
    input.samples
  );
}
