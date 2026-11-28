/**
 * Level of a Generate candidate (MUSIC-MODE.md section 11, Gain).
 *
 * One gain per candidate puts its sample peak at -3 dBFS. It is applied to
 * the whole window before cutting, so the segments of one candidate keep
 * their level relative to each other. Repaint and lego results keep the
 * backend's level, because they must match their context (MF4), so nothing
 * here runs for them.
 */

/** Sample peak a Generate candidate is scaled to. */
export const GENERATE_PEAK_DBFS = -3;

/** Largest absolute sample value. */
export function samplePeak(samples: Float32Array): number {
  let peak = 0;
  for (let index = 0; index < samples.length; index += 1) {
    const value = Math.abs(samples[index] ?? 0);
    if (value > peak) peak = value;
  }
  return peak;
}

export interface PeakGain {
  /** Linear factor. 1 for a silent buffer. */
  gain: number;
  /** The same factor in dB, as the generation record stores it. */
  gainDb: number;
}

/** The gain that moves the sample peak of `samples` to `targetDbfs`. */
export function peakNormalizeGain(
  samples: Float32Array,
  targetDbfs = GENERATE_PEAK_DBFS
): PeakGain {
  const peak = samplePeak(samples);
  if (!(peak > 0)) return { gain: 1, gainDb: 0 };
  const gain = 10 ** (targetDbfs / 20) / peak;
  return { gain, gainDb: 20 * Math.log10(gain) };
}

/** A scaled copy of `samples`. */
export function applyGain(samples: Float32Array, gain: number): Float32Array {
  const out = new Float32Array(samples.length);
  for (let index = 0; index < samples.length; index += 1) {
    out[index] = (samples[index] ?? 0) * gain;
  }
  return out;
}
