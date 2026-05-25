/**
 * Pure helpers for computing and resampling audio peak data.
 *
 * `computePeaks` reduces a raw PCM channel (Float32Array) to a fixed
 * number of `peakCount` abs-max buckets — small enough to pass around
 * cheaply and store as a per-asset cache value.
 *
 * `samplePeaksWindow` resamples a precomputed full-asset peaks array to a
 * sub-window expressed in milliseconds, used by the timeline clip body
 * to draw only the slice between `inPointMs` and `outPointMs`.
 *
 * Both helpers are deterministic and side-effect-free so they can be
 * unit-tested without an AudioContext.
 */

/** Reduce a PCM channel to `peakCount` abs-max samples. */
export function computePeaks(
  channel: Float32Array,
  peakCount: number
): Float32Array {
  if (peakCount <= 0 || channel.length === 0) {
    return new Float32Array(0);
  }
  const peaks = new Float32Array(peakCount);
  const samplesPerBucket = channel.length / peakCount;
  for (let i = 0; i < peakCount; i += 1) {
    const start = Math.floor(i * samplesPerBucket);
    const endExclusive = Math.max(start + 1, Math.floor((i + 1) * samplesPerBucket));
    let max = 0;
    for (let j = start; j < endExclusive && j < channel.length; j += 1) {
      const v = Math.abs(channel[j]);
      if (v > max) max = v;
    }
    peaks[i] = max;
  }
  return peaks;
}

/**
 * Resample `fullPeaks` (covering the entire source asset of duration
 * `sourceDurationMs`) to `peakCount` samples covering only the window
 * [inPointMs, outPointMs]. Indices outside the source are clamped.
 */
export function samplePeaksWindow(
  fullPeaks: Float32Array,
  sourceDurationMs: number,
  inPointMs: number,
  outPointMs: number,
  peakCount: number
): Float32Array {
  if (peakCount <= 0 || fullPeaks.length === 0 || sourceDurationMs <= 0) {
    return new Float32Array(peakCount > 0 ? peakCount : 0);
  }
  const out = new Float32Array(peakCount);
  const inFrac = Math.max(0, Math.min(1, inPointMs / sourceDurationMs));
  const outFrac = Math.max(0, Math.min(1, outPointMs / sourceDurationMs));
  const startIdx = inFrac * fullPeaks.length;
  const endIdx = Math.max(startIdx + 1, outFrac * fullPeaks.length);
  const span = endIdx - startIdx;
  for (let i = 0; i < peakCount; i += 1) {
    // Bucket-max so each output bar reflects the loudest peak in its slice
    // — visually faithful even when peakCount > input bucket count.
    const lo = Math.floor(startIdx + (span * i) / peakCount);
    const hi = Math.max(
      lo + 1,
      Math.floor(startIdx + (span * (i + 1)) / peakCount)
    );
    let max = 0;
    for (let j = lo; j < hi && j < fullPeaks.length; j += 1) {
      const v = fullPeaks[j];
      if (v > max) max = v;
    }
    out[i] = max;
  }
  return out;
}
