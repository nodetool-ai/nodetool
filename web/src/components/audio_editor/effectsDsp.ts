/**
 * Sample-accurate effects written as plain array transforms.
 *
 * These effects need exact timing or behaviour that the built-in Web Audio
 * nodes do not guarantee. `DynamicsCompressorNode` adds a fixed look-ahead
 * delay, which would shift an edited range against the rest of the clip, and
 * its curve cannot be read back for tests. Every function takes an
 * `AudioSample`, returns a new one of the same length, and never mutates its
 * input.
 */

import { makeAudioSample, numFrames, type AudioSample } from "./audioSample";

export const dbToGain = (db: number): number => Math.pow(10, db / 20);

export const gainToDb = (gain: number): number =>
  gain > 0 ? 20 * Math.log10(gain) : -Infinity;

/** One-pole smoothing coefficient for a time constant in milliseconds. */
const smoothing = (ms: number, sampleRate: number): number =>
  ms <= 0 ? 0 : Math.exp(-1 / ((ms / 1000) * sampleRate));

/** Peak across channels at each frame, so stereo images stay linked. */
const linkedPeak = (channels: Float32Array[], i: number): number => {
  let peak = 0;
  for (const channel of channels) {
    const v = Math.abs(channel[i]);
    if (v > peak) {
      peak = v;
    }
  }
  return peak;
};

/** Multiply every channel by a per-frame gain curve. */
const applyGainCurve = (
  sample: AudioSample,
  gains: Float32Array
): AudioSample =>
  makeAudioSample(
    sample.sampleRate,
    sample.channels.map((channel) => {
      const out = new Float32Array(channel.length);
      for (let i = 0; i < channel.length; i += 1) {
        out[i] = channel[i] * gains[i];
      }
      return out;
    })
  );

export interface CompressorParams {
  thresholdDb: number;
  ratio: number;
  kneeDb: number;
  attackMs: number;
  releaseMs: number;
  makeupDb: number;
}

/** Static gain reduction (dB, ≤ 0) for an input level, with a soft knee. */
export const compressorCurve = (
  levelDb: number,
  { thresholdDb, ratio, kneeDb }: CompressorParams
): number => {
  const over = levelDb - thresholdDb;
  const slope = 1 / ratio - 1;
  if (kneeDb > 0 && Math.abs(over) <= kneeDb / 2) {
    return (slope * (over + kneeDb / 2) ** 2) / (2 * kneeDb);
  }
  return over > 0 ? slope * over : 0;
};

/** Feed-forward peak compressor with attack/release smoothing in dB. */
export const compress = (
  sample: AudioSample,
  params: CompressorParams
): AudioSample => {
  const frames = numFrames(sample);
  const attack = smoothing(params.attackMs, sample.sampleRate);
  const release = smoothing(params.releaseMs, sample.sampleRate);
  const makeup = dbToGain(params.makeupDb);
  const gains = new Float32Array(frames);
  let reduction = 0;
  for (let i = 0; i < frames; i += 1) {
    const level = gainToDb(linkedPeak(sample.channels, i));
    const target = Number.isFinite(level) ? compressorCurve(level, params) : 0;
    // More reduction is the attack phase; letting go is the release phase.
    const coeff = target < reduction ? attack : release;
    reduction = coeff * reduction + (1 - coeff) * target;
    gains[i] = dbToGain(reduction) * makeup;
  }
  return applyGainCurve(sample, gains);
};

export interface LimiterParams {
  ceilingDb: number;
  lookaheadMs: number;
  releaseMs: number;
}

/**
 * Brickwall limiter. No output sample exceeds the ceiling: the gain curve is
 * never above the gain each frame needs, ramps down over the look-ahead window
 * before a peak, and recovers linearly over the release time.
 */
export const limit = (
  sample: AudioSample,
  { ceilingDb, lookaheadMs, releaseMs }: LimiterParams
): AudioSample => {
  const frames = numFrames(sample);
  const ceiling = dbToGain(ceilingDb);
  const gains = new Float32Array(frames);
  for (let i = 0; i < frames; i += 1) {
    const peak = linkedPeak(sample.channels, i);
    gains[i] = peak > ceiling ? ceiling / peak : 1;
  }
  const attackFrames = Math.max(1, (lookaheadMs / 1000) * sample.sampleRate);
  for (let i = frames - 2; i >= 0; i -= 1) {
    gains[i] = Math.min(gains[i], gains[i + 1] + 1 / attackFrames);
  }
  const releaseFrames = Math.max(1, (releaseMs / 1000) * sample.sampleRate);
  for (let i = 1; i < frames; i += 1) {
    gains[i] = Math.min(gains[i], gains[i - 1] + 1 / releaseFrames);
  }
  return applyGainCurve(sample, gains);
};

export interface NoiseGateParams {
  thresholdDb: number;
  reductionDb: number;
  attackMs: number;
  holdMs: number;
  releaseMs: number;
}

/**
 * Noise gate: audio below the threshold is turned down by `reductionDb`. The
 * gate opens over the attack time, stays open for the hold time after the
 * level drops, then closes over the release time.
 */
export const noiseGate = (
  sample: AudioSample,
  { thresholdDb, reductionDb, attackMs, holdMs, releaseMs }: NoiseGateParams
): AudioSample => {
  const frames = numFrames(sample);
  const threshold = dbToGain(thresholdDb);
  const floor = dbToGain(reductionDb);
  const attack = smoothing(attackMs, sample.sampleRate);
  const release = smoothing(releaseMs, sample.sampleRate);
  const holdFrames = Math.round((holdMs / 1000) * sample.sampleRate);
  const gains = new Float32Array(frames);
  let gain = floor;
  let held = holdFrames + 1;
  for (let i = 0; i < frames; i += 1) {
    if (linkedPeak(sample.channels, i) >= threshold) {
      held = 0;
    } else {
      held += 1;
    }
    const open = held <= holdFrames;
    const coeff = open ? attack : release;
    gain = coeff * gain + (1 - coeff) * (open ? 1 : floor);
    gains[i] = gain;
  }
  return applyGainCurve(sample, gains);
};

const mapFrames = (
  sample: AudioSample,
  fn: (value: number, frame: number, channel: number) => number
): AudioSample =>
  makeAudioSample(
    sample.sampleRate,
    sample.channels.map((channel, c) => {
      const out = new Float32Array(channel.length);
      for (let i = 0; i < channel.length; i += 1) {
        out[i] = fn(channel[i], i, c);
      }
      return out;
    })
  );

export interface DistortionParams {
  driveDb: number;
  outputDb: number;
  mix: number;
}

/** Soft clipping through tanh, scaled so full scale stays at full scale. */
export const distort = (
  sample: AudioSample,
  { driveDb, outputDb, mix }: DistortionParams
): AudioSample => {
  const drive = dbToGain(driveDb);
  const norm = Math.tanh(drive);
  const output = dbToGain(outputDb);
  return mapFrames(sample, (v) => {
    const wet = Math.tanh(v * drive) / norm;
    return (v * (1 - mix) + wet * mix) * output;
  });
};

export interface BitcrushParams {
  bits: number;
  downsample: number;
  mix: number;
}

/** Reduce bit depth and hold every Nth sample (sample-rate reduction). */
export const bitcrush = (
  sample: AudioSample,
  { bits, downsample, mix }: BitcrushParams
): AudioSample => {
  const steps = Math.pow(2, Math.max(1, bits) - 1);
  const hold = Math.max(1, Math.round(downsample));
  return mapFrames(sample, (v, i, c) => {
    const held = sample.channels[c][i - (i % hold)];
    const wet = Math.round(held * steps) / steps;
    return v * (1 - mix) + wet * mix;
  });
};

export interface TremoloParams {
  rateHz: number;
  depth: number;
}

/** Sine amplitude modulation; depth 1 swings the level fully to silence. */
export const tremolo = (
  sample: AudioSample,
  { rateHz, depth }: TremoloParams
): AudioSample => {
  const w = (2 * Math.PI * rateHz) / sample.sampleRate;
  return mapFrames(
    sample,
    (v, i) => v * (1 - depth * 0.5 * (1 - Math.cos(w * i)))
  );
};

/** Flip the polarity of every sample. */
export const invert = (sample: AudioSample): AudioSample =>
  mapFrames(sample, (v) => (v === 0 ? 0 : -v));

/** Subtract each channel's mean so the waveform centres on zero. */
export const removeDcOffset = (sample: AudioSample): AudioSample =>
  makeAudioSample(
    sample.sampleRate,
    sample.channels.map((channel) => {
      let sum = 0;
      for (let i = 0; i < channel.length; i += 1) {
        sum += channel[i];
      }
      const mean = channel.length > 0 ? sum / channel.length : 0;
      const out = new Float32Array(channel.length);
      for (let i = 0; i < channel.length; i += 1) {
        out[i] = channel[i] - mean;
      }
      return out;
    })
  );
