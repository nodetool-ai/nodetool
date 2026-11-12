/**
 * Grid offset and tempo deviation of a generated window (MUSIC-MODE.md
 * section 11, AL-2 and AL-4).
 *
 * The window is reduced to an onset-strength envelope with the existing
 * spectral-flux detector ({@link magnitudeSpectrum}, {@link spectralFlux}),
 * then correlated with a pulse train at the project's beat period, shifted by
 * the position of the first beat. The lag with the highest correlation within
 * half a beat either way is the offset, and the peak over the mean
 * correlation is its confidence. The same correlation over beat periods from
 * 97% to 103% of the project's gives the tempo deviation.
 *
 * PCM is interleaved stereo at 48 kHz, as in {@link cutFrames}.
 */

import { hannWindow, magnitudeSpectrum, spectralFlux } from "../audioOnsets.js";
import { MUSIC_CHANNELS, pcmFrames } from "./cut.js";

/** Frames per second of every music buffer. */
const RATE = 48000;

/**
 * FFT window of the envelope. Shorter than the onset detector's 1024 so an
 * onset is located within a few milliseconds: the normalized flux of a hit
 * peaks as the hit enters the window, at most one window from its start.
 */
export const ALIGN_FFT_SIZE = 128;

/** Envelope hop: 0.5 ms at 48 kHz. */
export const ALIGN_HOP_FRAMES = 24;

/**
 * Half-width of the running mean subtracted from the flux, in hops (25 ms).
 * A stationary signal keeps a flux floor of a few percent; without the
 * subtraction that floor dominates the mean correlation and hides the beat.
 */
const BASELINE_HALF_WIDTH_HOPS = 50;

/**
 * Lag step of the fine search around the best coarse lag, in frames. The
 * envelope is read with linear interpolation between hops.
 */
const FINE_LAG_STEP_FRAMES = 4;

/**
 * Least confidence at which a measured offset is applied, and at which a
 * tempo measurement may badge a take as drifting.
 *
 * Confidence is the peak correlation over the mean correlation across all
 * lags. On the fixtures in `tests/music.align.test.ts`, white noise scores
 * 1.7 to 2.3 and noise-burst click tracks score 14 or more with a noise floor
 * 10 dB under the clicks. 3 keeps a margin over noise. MM3 sets the final
 * value from real backend output (MR9).
 */
export const ALIGN_MIN_CONFIDENCE = 3;

/** Last-beat error above which a take is badged as drifting (AL-4). */
export const DRIFT_THRESHOLD_MS = 20;

/** Beat periods searched for the tempo, as a fraction of the project's. */
export const TEMPO_SEARCH_MIN = 0.97;
export const TEMPO_SEARCH_MAX = 1.03;
const TEMPO_COARSE_STEP = 0.001;
const TEMPO_FINE_STEP = 0.00002;

/** An onset-strength curve sampled every {@link ALIGN_HOP_FRAMES}. */
export interface OnsetEnvelope {
  values: Float32Array;
  hopFrames: number;
  /**
   * Window frame of `values[0]`. Each value is stamped at the last frame of
   * its FFT window, where the normalized flux of a hit peaks.
   */
  firstFrame: number;
}

/** The normalized spectral flux of the mono mix of `samples`. */
export function onsetEnvelope(samples: Float32Array): OnsetEnvelope {
  const frames = pcmFrames(samples);
  const mono = new Float32Array(frames);
  for (let frame = 0; frame < frames; frame += 1) {
    mono[frame] =
      ((samples[frame * MUSIC_CHANNELS] ?? 0) +
        (samples[frame * MUSIC_CHANNELS + 1] ?? 0)) /
      2;
  }
  const window = hannWindow(ALIGN_FFT_SIZE);
  const count = Math.max(
    0,
    Math.floor((frames - ALIGN_FFT_SIZE) / ALIGN_HOP_FRAMES)
  );
  const values = new Float32Array(count);
  let previous = magnitudeSpectrum(mono, 0, window);
  for (let index = 0; index < count; index += 1) {
    const offset = (index + 1) * ALIGN_HOP_FRAMES;
    const magnitude = magnitudeSpectrum(mono, offset, window);
    values[index] = spectralFlux(magnitude, previous);
    previous = magnitude;
  }
  return {
    values: subtractBaseline(values, BASELINE_HALF_WIDTH_HOPS),
    hopFrames: ALIGN_HOP_FRAMES,
    firstFrame: ALIGN_HOP_FRAMES + ALIGN_FFT_SIZE - 1
  };
}

/** `values` minus their running mean, half-wave rectified. */
function subtractBaseline(values: Float32Array, halfWidth: number): Float32Array {
  const prefix = new Float64Array(values.length + 1);
  for (let index = 0; index < values.length; index += 1) {
    prefix[index + 1] = prefix[index]! + (values[index] ?? 0);
  }
  const out = new Float32Array(values.length);
  for (let index = 0; index < values.length; index += 1) {
    const from = Math.max(0, index - halfWidth);
    const to = Math.min(values.length, index + halfWidth + 1);
    const mean = (prefix[to]! - prefix[from]!) / (to - from);
    out[index] = Math.max(0, (values[index] ?? 0) - mean);
  }
  return out;
}

/** The envelope at window frame `frame`, linearly interpolated. */
function envelopeAt(envelope: OnsetEnvelope, frame: number): number {
  const position = (frame - envelope.firstFrame) / envelope.hopFrames;
  if (position < 0 || position > envelope.values.length - 1) return 0;
  const lower = Math.floor(position);
  const fraction = position - lower;
  const a = envelope.values[lower] ?? 0;
  const b = envelope.values[lower + 1] ?? a;
  return a + (b - a) * fraction;
}

/** Window frames the envelope covers, `[first, last]`. */
function envelopeSpan(envelope: OnsetEnvelope): [number, number] {
  return [
    envelope.firstFrame,
    envelope.firstFrame + (envelope.values.length - 1) * envelope.hopFrames
  ];
}

/**
 * Mean envelope over the beats `phase + lag + k * period` that fall inside
 * the envelope, for every whole `k`.
 */
export function pulseCorrelation(
  envelope: OnsetEnvelope,
  periodFrames: number,
  phaseFrames: number,
  lagFrames: number
): number {
  const [first, last] = envelopeSpan(envelope);
  if (envelope.values.length === 0 || !(periodFrames > 0)) return 0;
  const anchor = phaseFrames + lagFrames;
  const kFirst = Math.ceil((first - anchor) / periodFrames);
  const kLast = Math.floor((last - anchor) / periodFrames);
  if (kLast < kFirst) return 0;
  let sum = 0;
  for (let k = kFirst; k <= kLast; k += 1) {
    sum += envelopeAt(envelope, anchor + k * periodFrames);
  }
  return sum / (kLast - kFirst + 1);
}

interface LagSearch {
  lagFrames: number;
  peak: number;
  mean: number;
}

/** The best lag within half a beat either way, coarse then fine. */
function searchLag(
  envelope: OnsetEnvelope,
  periodFrames: number,
  phaseFrames: number
): LagSearch {
  const half = periodFrames / 2;
  const coarseSteps = Math.floor(half / envelope.hopFrames);
  let bestLag = 0;
  let peak = Number.NEGATIVE_INFINITY;
  let sum = 0;
  let count = 0;
  for (let step = -coarseSteps; step <= coarseSteps; step += 1) {
    const lag = step * envelope.hopFrames;
    const value = pulseCorrelation(envelope, periodFrames, phaseFrames, lag);
    sum += value;
    count += 1;
    if (value > peak) {
      peak = value;
      bestLag = lag;
    }
  }
  const from = Math.max(-half, bestLag - envelope.hopFrames);
  const to = Math.min(half, bestLag + envelope.hopFrames);
  for (let lag = Math.ceil(from); lag <= to; lag += FINE_LAG_STEP_FRAMES) {
    const value = pulseCorrelation(envelope, periodFrames, phaseFrames, lag);
    if (value > peak) {
      peak = value;
      bestLag = lag;
    }
  }
  return { lagFrames: bestLag, peak, mean: count > 0 ? sum / count : 0 };
}

/** What a window's beats measure against the project grid. */
export interface MusicAlignment {
  /** Frames the audio's beats fall after the grid. Negative is early. */
  offsetFrames: number;
  /** Whether the offset clears {@link ALIGN_MIN_CONFIDENCE}. */
  confident: boolean;
  /** Peak correlation over mean correlation. About 1 for no beat. */
  confidence: number;
  /** Measured tempo divided by project tempo. */
  tempoRatio: number;
  /** How far the last beat of the take lands off the grid. */
  lastBeatErrorMs: number;
  /**
   * `lastBeatErrorMs` above {@link DRIFT_THRESHOLD_MS}, at a tempo the
   * correlation trusts. A window with no clear beat is never badged.
   */
  drifting: boolean;
}

export interface MeasureAlignmentOptions {
  /** Project tempo in quarter-note beats per minute. */
  bpm: number;
  /**
   * Beat unit of the time signature. BPM counts quarter notes in every
   * signature, so a beat lasts `60 / bpm * 4 / beatUnit` seconds.
   */
  beatUnit?: number;
  /** Position of the first beat inside the window, in frames. */
  beatPhaseFrames?: number;
  /** Length of the take the tempo error is reported over, in frames. */
  takeFrames: number;
}

/** Frames of one beat at `bpm` in quarter notes. */
export function beatPeriodFrames(bpm: number, beatUnit = 4): number {
  if (!(bpm > 0)) throw new Error(`bpm must be positive, got ${bpm}`);
  return (60 / bpm) * (4 / beatUnit) * RATE;
}

/**
 * The best beat period within 97%..103% of `periodFrames`, as a scale of it.
 * A coarse 0.1% pass picks the neighbourhood and a fine pass refines it.
 */
function searchTempoScale(
  envelope: OnsetEnvelope,
  periodFrames: number,
  phaseFrames: number
): { scale: number; confidence: number } {
  let bestScale = 1;
  let best = Number.NEGATIVE_INFINITY;
  let bestMean = 0;
  const steps = Math.round((TEMPO_SEARCH_MAX - TEMPO_SEARCH_MIN) / TEMPO_COARSE_STEP);
  for (let step = 0; step <= steps; step += 1) {
    const scale = TEMPO_SEARCH_MIN + step * TEMPO_COARSE_STEP;
    const { peak, mean } = searchLag(envelope, periodFrames * scale, phaseFrames);
    if (peak > best) {
      best = peak;
      bestMean = mean;
      bestScale = scale;
    }
  }
  const from = Math.max(TEMPO_SEARCH_MIN, bestScale - TEMPO_COARSE_STEP);
  const to = Math.min(TEMPO_SEARCH_MAX, bestScale + TEMPO_COARSE_STEP);
  const fineSteps = Math.round((to - from) / TEMPO_FINE_STEP);
  for (let step = 0; step <= fineSteps; step += 1) {
    const scale = from + step * TEMPO_FINE_STEP;
    const { peak, mean } = searchLag(envelope, periodFrames * scale, phaseFrames);
    if (peak > best) {
      best = peak;
      bestMean = mean;
      bestScale = scale;
    }
  }
  return { scale: bestScale, confidence: bestMean > 0 ? best / bestMean : 0 };
}

/**
 * Measure the grid offset and the tempo deviation of `samples`. The offset is
 * measured at the project's beat period. The tempo scan does not change it.
 */
export function measureAlignment(
  samples: Float32Array,
  options: MeasureAlignmentOptions
): MusicAlignment {
  const period = beatPeriodFrames(options.bpm, options.beatUnit);
  const phase = options.beatPhaseFrames ?? 0;
  const envelope = onsetEnvelope(samples);
  const lag = searchLag(envelope, period, phase);
  const confidence =
    lag.mean > 0 && Number.isFinite(lag.peak) ? lag.peak / lag.mean : 0;
  const tempo =
    confidence > 0
      ? searchTempoScale(envelope, period, phase)
      : { scale: 1, confidence: 0 };
  // The last beat of a take `takeFrames` long lands off the grid by the
  // period error times the beats in it.
  const lastBeatErrorMs =
    (Math.abs(tempo.scale - 1) * options.takeFrames * 1000) / RATE;
  return {
    offsetFrames: confidence > 0 ? Math.round(lag.lagFrames) : 0,
    confident: confidence >= ALIGN_MIN_CONFIDENCE,
    confidence,
    tempoRatio: 1 / tempo.scale,
    lastBeatErrorMs,
    drifting:
      tempo.confidence >= ALIGN_MIN_CONFIDENCE &&
      lastBeatErrorMs > DRIFT_THRESHOLD_MS
  };
}
