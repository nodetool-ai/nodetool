/**
 * Precomputed min/max peaks for waveform rendering.
 *
 * Each pixel column of the waveform shows the min/max of the samples under it.
 * Scanning raw samples per redraw is O(total frames) — too slow to repeat on
 * every zoom, scroll, or resize. Instead each channel is bucketed into
 * fixed-size blocks once per edit; a column query combines whole blocks plus
 * raw samples at the partial edges, so redraw cost scales with visible pixels
 * instead of duration.
 */

const PEAK_BLOCK_SIZE = 256;

export interface ChannelPeaks {
  readonly blockSize: number;
  readonly min: Float32Array;
  readonly max: Float32Array;
}

export const buildChannelPeaks = (
  data: Float32Array,
  blockSize: number = PEAK_BLOCK_SIZE
): ChannelPeaks => {
  const blockCount = Math.ceil(data.length / blockSize);
  const min = new Float32Array(blockCount);
  const max = new Float32Array(blockCount);
  for (let b = 0; b < blockCount; b += 1) {
    const start = b * blockSize;
    const end = Math.min(data.length, start + blockSize);
    let mn = Infinity;
    let mx = -Infinity;
    for (let i = start; i < end; i += 1) {
      const v = data[i];
      if (v < mn) mn = v;
      if (v > mx) mx = v;
    }
    min[b] = mn;
    max[b] = mx;
  }
  return { blockSize, min, max };
};

/**
 * Min/max over `[startFrame, endFrame)`, reading whole blocks where possible
 * and raw samples at the partial edges. Returns null for an empty range.
 */
export const peakRange = (
  data: Float32Array,
  peaks: ChannelPeaks,
  startFrame: number,
  endFrame: number
): { min: number; max: number } | null => {
  const start = Math.max(0, startFrame);
  const end = Math.min(data.length, endFrame);
  if (end <= start) return null;

  const { blockSize } = peaks;
  const firstFullBlock = Math.ceil(start / blockSize);
  const lastFullBlock = Math.floor(end / blockSize);
  let mn = Infinity;
  let mx = -Infinity;

  const headEnd = Math.min(end, firstFullBlock * blockSize);
  for (let i = start; i < headEnd; i += 1) {
    const v = data[i];
    if (v < mn) mn = v;
    if (v > mx) mx = v;
  }
  for (let b = firstFullBlock; b < lastFullBlock; b += 1) {
    if (peaks.min[b] < mn) mn = peaks.min[b];
    if (peaks.max[b] > mx) mx = peaks.max[b];
  }
  for (let i = Math.max(headEnd, lastFullBlock * blockSize); i < end; i += 1) {
    const v = data[i];
    if (v < mn) mn = v;
    if (v > mx) mx = v;
  }
  return { min: mn, max: mx };
};
