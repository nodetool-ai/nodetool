/**
 * Onsets and tempo from audio samples — spectral flux over a windowed FFT.
 *
 * Pure arithmetic over `Float32Array` PCM, so the agent's
 * `detect_audio_events` and the editor's "Detect beats" read one detector and
 * cannot disagree about where a beat is. Decoding stays with each caller: the
 * agent decodes with Mediabunny, the browser with Web Audio.
 */

/** The onset detector's FFT window, the size `detect_audio_events` uses. */
export const ONSET_FFT_SIZE = 1024;

/** Standard deviations above the local mean an onset must clear. */
export const DEFAULT_ONSET_SENSITIVITY = 1.5;

/**
 * Onsets a tempo needs before it means anything. Four onsets is three
 * intervals, the least that can agree about a period: autocorrelating the flux
 * of a steady tone still peaks somewhere, with a confident-looking score.
 */
export const MIN_TEMPO_ONSETS = 4;

/** Autocorrelation a tempo must reach to be reported as reliable. */
export const MIN_TEMPO_CONFIDENCE = 0.15;

/** A periodic Hann window of length `size`. */
export function hannWindow(size: number): Float32Array {
  const window = new Float32Array(size);
  for (let index = 0; index < size; index += 1) {
    window[index] = 0.5 * (1 - Math.cos((2 * Math.PI * index) / size));
  }
  return window;
}

/**
 * In-place radix-2 Cooley-Tukey FFT. `re`/`im` must have the same
 * power-of-two length; the transform overwrites both.
 */
export function fftInPlace(re: Float32Array, im: Float32Array): void {
  const size = re.length;
  if (size < 2 || (size & (size - 1)) !== 0) {
    throw new Error("fftInPlace: length must be a power of two");
  }
  // Bit-reversal permutation.
  for (let i = 1, j = 0; i < size; i += 1) {
    let bit = size >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const tr = re[i];
      re[i] = re[j];
      re[j] = tr;
      const ti = im[i];
      im[i] = im[j];
      im[j] = ti;
    }
  }
  for (let len = 2; len <= size; len <<= 1) {
    const angle = (-2 * Math.PI) / len;
    const wRe = Math.cos(angle);
    const wIm = Math.sin(angle);
    for (let start = 0; start < size; start += len) {
      let curRe = 1;
      let curIm = 0;
      for (let offset = 0; offset < len / 2; offset += 1) {
        const a = start + offset;
        const b = a + len / 2;
        const evenRe = re[a];
        const evenIm = im[a];
        const oddRe = re[b] * curRe - im[b] * curIm;
        const oddIm = re[b] * curIm + im[b] * curRe;
        re[a] = evenRe + oddRe;
        im[a] = evenIm + oddIm;
        re[b] = evenRe - oddRe;
        im[b] = evenIm - oddIm;
        const nextRe = curRe * wRe - curIm * wIm;
        curIm = curRe * wIm + curIm * wRe;
        curRe = nextRe;
      }
    }
  }
}

/**
 * The magnitude spectrum of one windowed frame — bins 0..size/2 inclusive.
 *
 * `signal` is read from `offset`; a frame that runs past the end is
 * zero-padded, which is what makes the last window of a clip analysable.
 */
export function magnitudeSpectrum(
  signal: Float32Array,
  offset: number,
  window: Float32Array
): Float32Array {
  const size = window.length;
  const re = new Float32Array(size);
  const im = new Float32Array(size);
  for (let index = 0; index < size; index += 1) {
    re[index] = (signal[offset + index] ?? 0) * window[index];
  }
  fftInPlace(re, im);
  const bins = size / 2 + 1;
  const magnitude = new Float32Array(bins);
  for (let bin = 0; bin < bins; bin += 1) {
    magnitude[bin] = Math.hypot(re[bin], im[bin]) / size;
  }
  return magnitude;
}


/**
 * Half-wave rectified spectral flux between two frames, normalized by the
 * current frame's total magnitude.
 *
 * The normalization is what makes the number mean something. Raw flux scales
 * with how loud the passage is, so one threshold cannot serve a quiet verse
 * and a loud chorus. Worse, a *stationary* tone does not produce zero raw
 * flux: at a hop that is not a whole number of cycles the sinusoid's leakage
 * pattern shifts between frames, so its bin magnitudes wobble by a few percent
 * forever. Measured against the frame's own magnitude that wobble is ~0.02 and
 * a real onset is a large fraction of 1, which is a difference a threshold can
 * act on. Against raw flux the two are indistinguishable, and a held note
 * reads as a stream of onsets at a confident tempo.
 */
export function spectralFlux(
  magnitude: Float32Array,
  previous: Float32Array
): number {
  let rise = 0;
  let total = 0;
  for (let bin = 0; bin < magnitude.length; bin += 1) {
    const value = magnitude[bin] ?? 0;
    rise += Math.max(0, value - (previous[bin] ?? 0));
    total += value;
  }
  return total > 0 ? rise / total : 0;
}


/**
 * Onset times from a normalized spectral-flux novelty curve.
 *
 * A peak is an onset when it is a local maximum, clears an adaptive threshold
 * (the local mean plus `sensitivity` local standard deviations), and clears
 * `minStrength` outright. Both halves are needed. The adaptive half handles
 * dynamics — a fixed threshold finds every hit in a loud passage and none in a
 * quiet one. The absolute half handles the opposite failure: where the curve
 * is essentially flat the local standard deviation collapses, every ripple
 * clears mean + 1.5σ, and a held note reports dozens of onsets. `minStrength`
 * is in the units {@link spectralFlux} returns — a fraction of the frame's own
 * magnitude — so 0.04 means "at least 4% of this frame's energy is new".
 */
export function detectOnsets(
  flux: readonly number[],
  times: readonly number[],
  sensitivity = 1.5,
  windowFrames = 10,
  minGapSeconds = 0.05,
  minStrength = 0.04
): number[] {
  const onsets: number[] = [];
  if (flux.length < 3) return onsets;
  let lastOnset = Number.NEGATIVE_INFINITY;
  for (let index = 1; index < flux.length - 1; index += 1) {
    const value = flux[index] ?? 0;
    if (value < minStrength) continue;
    if (value <= (flux[index - 1] ?? 0) || value < (flux[index + 1] ?? 0)) {
      continue;
    }
    const from = Math.max(0, index - windowFrames);
    const to = Math.min(flux.length, index + windowFrames + 1);
    let sum = 0;
    for (let n = from; n < to; n += 1) sum += flux[n] ?? 0;
    const mean = sum / (to - from);
    let variance = 0;
    for (let n = from; n < to; n += 1) {
      const delta = (flux[n] ?? 0) - mean;
      variance += delta * delta;
    }
    const deviation = Math.sqrt(variance / (to - from));
    if (value < mean + sensitivity * deviation || value <= 0) continue;
    const time = times[index] ?? 0;
    if (time - lastOnset < minGapSeconds) continue;
    onsets.push(time);
    lastOnset = time;
  }
  return onsets;
}

/** A tempo estimate, and how strongly the novelty curve supports it. */
export interface TempoEstimate {
  readonly bpm: number;
  /** Normalized autocorrelation at the winning lag, 0..1. */
  readonly confidence: number;
}

/**
 * Tempo from the autocorrelation of the novelty curve.
 *
 * Only lags inside `minBpm`..`maxBpm` are considered, so the classic
 * half/double-time ambiguity is bounded rather than unbounded. Confidence is
 * the autocorrelation at the winning lag over the curve's own energy; a
 * non-rhythmic signal scores near zero, and the caller is expected to say so
 * instead of printing a BPM for speech.
 */
export function estimateTempo(
  novelty: readonly number[],
  hopSeconds: number,
  minBpm = 50,
  maxBpm = 200
): TempoEstimate {
  if (novelty.length < 4 || hopSeconds <= 0) return { bpm: 0, confidence: 0 };
  const mean =
    novelty.reduce((sum, value) => sum + value, 0) / novelty.length;
  const centred = novelty.map((value) => value - mean);
  const energy = centred.reduce((sum, value) => sum + value * value, 0);
  if (energy <= 0) return { bpm: 0, confidence: 0 };

  const minLag = Math.max(1, Math.floor(60 / (maxBpm * hopSeconds)));
  const maxLag = Math.min(
    centred.length - 1,
    Math.ceil(60 / (minBpm * hopSeconds))
  );
  let bestLag = 0;
  let bestScore = 0;
  for (let lag = minLag; lag <= maxLag; lag += 1) {
    let sum = 0;
    for (let index = 0; index + lag < centred.length; index += 1) {
      sum += centred[index] * centred[index + lag];
    }
    if (sum > bestScore) {
      bestScore = sum;
      bestLag = lag;
    }
  }
  if (bestLag === 0) return { bpm: 0, confidence: 0 };
  return {
    bpm: 60 / (bestLag * hopSeconds),
    confidence: Math.min(1, bestScore / energy)
  };
}

/** Whether a tempo estimate is backed by enough rhythm to act on. */
export function isTempoReliable(
  tempo: TempoEstimate,
  onsetCount: number
): boolean {
  return (
    tempo.confidence >= MIN_TEMPO_CONFIDENCE &&
    tempo.bpm > 0 &&
    onsetCount >= MIN_TEMPO_ONSETS
  );
}

export interface AnalyzeOnsetsOptions {
  /** Standard deviations above the local mean an onset must clear. */
  readonly sensitivity?: number;
  /** Estimate tempo from the novelty curve (default true). */
  readonly detectTempo?: boolean;
}

export interface OnsetAnalysis {
  /** Onset times in ms from the first sample of `mono`. */
  readonly onsetsMs: number[];
  /** Present when tempo detection ran. */
  readonly tempo?: TempoEstimate;
}

/**
 * Onsets, and optionally a tempo, for a mono signal.
 *
 * Frames hop a quarter of {@link ONSET_FFT_SIZE}; the flux between frames is
 * the novelty curve both the onset picker and the tempo estimate read.
 */
export function analyzeOnsets(
  mono: Float32Array,
  sampleRate: number,
  options: AnalyzeOnsetsOptions = {}
): OnsetAnalysis {
  const window = hannWindow(ONSET_FFT_SIZE);
  const hop = ONSET_FFT_SIZE / 4;
  const flux: number[] = [];
  const times: number[] = [];
  let previous: Float32Array | null = null;
  for (
    let offset = 0;
    offset + ONSET_FFT_SIZE <= mono.length;
    offset += hop
  ) {
    const magnitude = magnitudeSpectrum(mono, offset, window);
    if (previous) {
      flux.push(spectralFlux(magnitude, previous));
      times.push(offset / sampleRate);
    }
    previous = magnitude;
  }
  const onsets = detectOnsets(
    flux,
    times,
    options.sensitivity ?? DEFAULT_ONSET_SENSITIVITY
  );
  const onsetsMs = onsets.map((time) => time * 1000);
  if (options.detectTempo === false) return { onsetsMs };
  return { onsetsMs, tempo: estimateTempo(flux, hop / sampleRate) };
}
