/**
 * Audio analysis math — pure functions over PCM, no I/O and no media library.
 *
 * Everything here takes samples and returns numbers, so a test can synthesize
 * a signal whose answer is known analytically (a 1 kHz sine's centroid is
 * 1 kHz, a -20 dBFS tone integrates to a loudness the ITU spec pins) and check
 * the implementation against it. Decoding lives in `media-decode.ts`; the
 * capability that calls both lives in `capabilities/analysis.ts`.
 *
 * Loudness follows ITU-R BS.1770-4 (K-weighting, 400 ms gated blocks) and EBU
 * Tech 3342 for the loudness range, which is what every broadcast and
 * streaming target is specified in. dBFS peak/RMS is kept alongside it because
 * clipping and headroom are peak questions, not loudness questions.
 */

/** Amplitude floor reported instead of -Infinity for digital silence. */
export const SILENT_DB = -120;

/** Interleaved PCM plus the format needed to interpret it. */
export interface PcmAudio {
  readonly samples: Float32Array;
  readonly sampleRate: number;
  readonly channels: number;
}

/** dBFS for a linear amplitude, floored so silence is a number. */
export function amplitudeToDb(amplitude: number): number {
  if (!(amplitude > 0)) return SILENT_DB;
  return Math.max(SILENT_DB, 20 * Math.log10(amplitude));
}

/** Round to `digits` decimals, keeping JSON payloads readable. */
export function round(value: number, digits = 3): number {
  if (!Number.isFinite(value)) return 0;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

/** Downmix interleaved PCM to one channel by averaging. */
export function toMono(samples: Float32Array, channels: number): Float32Array {
  if (channels <= 1) return samples;
  const frames = Math.floor(samples.length / channels);
  const mono = new Float32Array(frames);
  for (let frame = 0; frame < frames; frame += 1) {
    let sum = 0;
    for (let channel = 0; channel < channels; channel += 1) {
      sum += samples[frame * channels + channel] ?? 0;
    }
    mono[frame] = sum / channels;
  }
  return mono;
}

/** Split interleaved PCM into one array per channel. */
export function toPlanar(
  samples: Float32Array,
  channels: number
): Float32Array[] {
  const frames = Math.floor(samples.length / channels);
  const planes: Float32Array[] = [];
  for (let channel = 0; channel < channels; channel += 1) {
    const plane = new Float32Array(frames);
    for (let frame = 0; frame < frames; frame += 1) {
      plane[frame] = samples[frame * channels + channel] ?? 0;
    }
    planes.push(plane);
  }
  return planes;
}

// ---------------------------------------------------------------------------
// Peak, RMS, and the energy envelope
// ---------------------------------------------------------------------------

/** One window of the energy envelope: where the level is at a point in time. */
export interface EnergyFrame {
  /** Window start, in seconds from the beginning of the audio. */
  readonly time: number;
  readonly rms: number;
  readonly peak: number;
}

/**
 * The level envelope: RMS and peak per analysis window.
 *
 * This is the "where is the energy" answer — a caller reads it as a series, or
 * derives silence, onsets and dynamics from it. Windows are laid out from the
 * start at `hop` intervals; the last partial window is kept so a short clip
 * still reports something.
 */
export function energyFrames(
  mono: Float32Array,
  sampleRate: number,
  frameSamples: number,
  hopSamples: number
): EnergyFrame[] {
  const frames: EnergyFrame[] = [];
  if (mono.length === 0 || frameSamples < 1 || hopSamples < 1) return frames;
  for (let start = 0; start < mono.length; start += hopSamples) {
    const end = Math.min(mono.length, start + frameSamples);
    let sumSquares = 0;
    let peak = 0;
    for (let index = start; index < end; index += 1) {
      const value = mono[index] ?? 0;
      sumSquares += value * value;
      const magnitude = Math.abs(value);
      if (magnitude > peak) peak = magnitude;
    }
    const count = end - start;
    frames.push({
      time: start / sampleRate,
      rms: count > 0 ? Math.sqrt(sumSquares / count) : 0,
      peak
    });
  }
  return frames;
}

/** Whole-signal level, clipping and DC offset — the headroom questions. */
export interface PeakSummary {
  readonly peak: number;
  readonly rms: number;
  readonly dcOffset: number;
  readonly clippedSamples: number;
  readonly crestFactorDb: number;
}

/**
 * Peak, RMS, DC offset and clipping over the whole signal.
 *
 * "Clipped" is a sample at or past `clipThreshold` (0.999 by default, not 1.0):
 * a decoder's rounding puts a genuinely clipped sample a hair under full scale,
 * so an exact-1.0 test reports zero on audio that is visibly squared off.
 */
export function peakSummary(
  mono: Float32Array,
  clipThreshold = 0.999
): PeakSummary {
  let peak = 0;
  let sumSquares = 0;
  let sum = 0;
  let clipped = 0;
  for (let index = 0; index < mono.length; index += 1) {
    const value = mono[index] ?? 0;
    const magnitude = Math.abs(value);
    if (magnitude > peak) peak = magnitude;
    if (magnitude >= clipThreshold) clipped += 1;
    sumSquares += value * value;
    sum += value;
  }
  const count = Math.max(1, mono.length);
  const rms = Math.sqrt(sumSquares / count);
  return {
    peak,
    rms,
    dcOffset: sum / count,
    clippedSamples: clipped,
    crestFactorDb: amplitudeToDb(peak) - amplitudeToDb(rms)
  };
}

// ---------------------------------------------------------------------------
// FFT and spectral features
// ---------------------------------------------------------------------------

/** Largest power of two at or below `value`, at least 2. */
export function floorPowerOfTwo(value: number): number {
  let size = 2;
  while (size * 2 <= value) size *= 2;
  return size;
}

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

/** What one spectrum says about the sound's colour. */
export interface SpectralFeatures {
  /** Energy-weighted mean frequency — "brightness". */
  readonly centroidHz: number;
  /** Frequency below which `rolloffFraction` of the energy sits. */
  readonly rolloffHz: number;
  /** Geometric over arithmetic mean: 0 is tonal, 1 is noise-like. */
  readonly flatness: number;
  /** Energy-weighted spread around the centroid. */
  readonly bandwidthHz: number;
  /** The loudest bin's frequency. */
  readonly peakHz: number;
  /** Total magnitude in the frame, for weighting averages. */
  readonly energy: number;
}

/** Centroid, rolloff, flatness, bandwidth and peak bin of one spectrum. */
export function spectralFeatures(
  magnitude: Float32Array,
  sampleRate: number,
  fftSize: number,
  rolloffFraction = 0.85
): SpectralFeatures {
  const binHz = sampleRate / fftSize;
  let total = 0;
  let weighted = 0;
  let logSum = 0;
  let peakBin = 0;
  let peakValue = 0;
  // Bin 0 is DC: it carries no pitch information and a small offset would
  // drag the centroid toward zero, so the walk starts at 1.
  for (let bin = 1; bin < magnitude.length; bin += 1) {
    const value = magnitude[bin] ?? 0;
    total += value;
    weighted += value * bin * binHz;
    logSum += Math.log(value + 1e-12);
    if (value > peakValue) {
      peakValue = value;
      peakBin = bin;
    }
  }
  if (total <= 0) {
    return {
      centroidHz: 0,
      rolloffHz: 0,
      flatness: 0,
      bandwidthHz: 0,
      peakHz: 0,
      energy: 0
    };
  }
  const centroidHz = weighted / total;
  const count = magnitude.length - 1;
  const arithmeticMean = total / count;
  const geometricMean = Math.exp(logSum / count);
  let running = 0;
  let rolloffHz = 0;
  for (let bin = 1; bin < magnitude.length; bin += 1) {
    running += magnitude[bin] ?? 0;
    if (running >= total * rolloffFraction) {
      rolloffHz = bin * binHz;
      break;
    }
  }
  let variance = 0;
  for (let bin = 1; bin < magnitude.length; bin += 1) {
    const delta = bin * binHz - centroidHz;
    variance += (magnitude[bin] ?? 0) * delta * delta;
  }
  return {
    centroidHz,
    rolloffHz,
    flatness: arithmeticMean > 0 ? geometricMean / arithmeticMean : 0,
    bandwidthHz: Math.sqrt(variance / total),
    peakHz: peakBin * binHz,
    energy: total
  };
}

/** One band of the octave split, and the energy in it. */
export interface FrequencyBand {
  readonly name: string;
  readonly lowHz: number;
  readonly highHz: number;
}

/**
 * Ten octave bands from sub-bass to air, named the way a mix engineer names
 * them. The upper edge of `air` is open — `bandEnergies` clamps it to Nyquist.
 */
export const OCTAVE_BANDS: readonly FrequencyBand[] = [
  { name: "sub_bass", lowHz: 20, highHz: 60 },
  { name: "bass", lowHz: 60, highHz: 120 },
  { name: "low_mid", lowHz: 120, highHz: 250 },
  { name: "mid", lowHz: 250, highHz: 500 },
  { name: "upper_mid", lowHz: 500, highHz: 1000 },
  { name: "presence_low", lowHz: 1000, highHz: 2000 },
  { name: "presence", lowHz: 2000, highHz: 4000 },
  { name: "brilliance", lowHz: 4000, highHz: 8000 },
  { name: "treble", lowHz: 8000, highHz: 16000 },
  { name: "air", lowHz: 16000, highHz: Number.POSITIVE_INFINITY }
];

/** Summed magnitude per octave band, and that band's share of the total. */
export function bandEnergies(
  magnitude: Float32Array,
  sampleRate: number,
  fftSize: number
): { band: FrequencyBand; energy: number }[] {
  const binHz = sampleRate / fftSize;
  const nyquist = sampleRate / 2;
  return OCTAVE_BANDS.map((band) => {
    const lowBin = Math.max(1, Math.ceil(band.lowHz / binHz));
    const highBin = Math.min(
      magnitude.length - 1,
      Math.floor(Math.min(band.highHz, nyquist) / binHz)
    );
    let energy = 0;
    for (let bin = lowBin; bin <= highBin; bin += 1) {
      energy += magnitude[bin] ?? 0;
    }
    return { band, energy };
  });
}

// ---------------------------------------------------------------------------
// Loudness: ITU-R BS.1770-4 + EBU Tech 3342
// ---------------------------------------------------------------------------

interface BiquadCoefficients {
  readonly b0: number;
  readonly b1: number;
  readonly b2: number;
  readonly a1: number;
  readonly a2: number;
}

/** Apply a normalized biquad (a0 == 1) to a signal, returning a new array. */
export function applyBiquad(
  signal: Float32Array,
  { b0, b1, b2, a1, a2 }: BiquadCoefficients
): Float32Array {
  const out = new Float32Array(signal.length);
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  for (let index = 0; index < signal.length; index += 1) {
    const x0 = signal[index] ?? 0;
    const y0 = b0 * x0 + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    out[index] = y0;
    x2 = x1;
    x1 = x0;
    y2 = y1;
    y1 = y0;
  }
  return out;
}

/**
 * The two K-weighting stages of BS.1770 at an arbitrary sample rate.
 *
 * The spec tabulates coefficients for 48 kHz only. These are the analog
 * prototype's parameters (a +4 dB high shelf at 1681.97 Hz and an RLB high-pass
 * at 38.14 Hz) run through the bilinear transform at `sampleRate`, so a 44.1 kHz
 * or 96 kHz file is weighted correctly instead of being measured through a
 * filter designed for a different rate.
 */
export function kWeightingFilters(
  sampleRate: number
): [BiquadCoefficients, BiquadCoefficients] {
  const shelfF0 = 1681.9744509555319;
  const shelfGainDb = 3.999843853973347;
  const shelfQ = 0.7071752369554196;
  const shelfK = Math.tan((Math.PI * shelfF0) / sampleRate);
  const vh = 10 ** (shelfGainDb / 20);
  const vb = vh ** 0.4996667741545416;
  const shelfDen = 1 + shelfK / shelfQ + shelfK * shelfK;
  const highShelf: BiquadCoefficients = {
    b0: (vh + (vb * shelfK) / shelfQ + shelfK * shelfK) / shelfDen,
    b1: (2 * (shelfK * shelfK - vh)) / shelfDen,
    b2: (vh - (vb * shelfK) / shelfQ + shelfK * shelfK) / shelfDen,
    a1: (2 * (shelfK * shelfK - 1)) / shelfDen,
    a2: (1 - shelfK / shelfQ + shelfK * shelfK) / shelfDen
  };

  const hpF0 = 38.13547087602444;
  const hpQ = 0.5003270373238773;
  const hpK = Math.tan((Math.PI * hpF0) / sampleRate);
  const hpDen = 1 + hpK / hpQ + hpK * hpK;
  const highPass: BiquadCoefficients = {
    b0: 1,
    b1: -2,
    b2: 1,
    a1: (2 * (hpK * hpK - 1)) / hpDen,
    a2: (1 - hpK / hpQ + hpK * hpK) / hpDen
  };
  return [highShelf, highPass];
}

/**
 * BS.1770 channel weights. Left, right and centre count fully; the surround
 * pair counts 1.41×. Anything beyond a 5-channel layout is weighted 1.
 */
function channelWeight(channel: number, channels: number): number {
  if (channels >= 5 && (channel === 3 || channel === 4)) return 1.41;
  return 1;
}

/** Everything the loudness pass reports. */
export interface LoudnessResult {
  /** Gated programme loudness over the whole signal, in LUFS. */
  readonly integratedLufs: number;
  /** EBU Tech 3342 loudness range, in LU. */
  readonly loudnessRangeLu: number;
  /** Loudest 400 ms block, in LUFS. */
  readonly momentaryMaxLufs: number;
  /** Loudest 3 s block, in LUFS. */
  readonly shortTermMaxLufs: number;
  /** Per-block momentary loudness, `{time, lufs}` at 100 ms hops. */
  readonly momentary: { time: number; lufs: number }[];
}

/** Mean-square energy of `signal` over a block, for the loudness sum. */
function meanSquare(signal: Float32Array, start: number, end: number): number {
  let sum = 0;
  for (let index = start; index < end; index += 1) {
    const value = signal[index] ?? 0;
    sum += value * value;
  }
  const count = Math.max(1, end - start);
  return sum / count;
}

/** Block loudness in LUFS from per-channel mean squares. */
function blockLoudness(perChannel: number[], channels: number): number {
  let sum = 0;
  for (let channel = 0; channel < perChannel.length; channel += 1) {
    sum += channelWeight(channel, channels) * (perChannel[channel] ?? 0);
  }
  if (sum <= 0) return Number.NEGATIVE_INFINITY;
  return -0.691 + 10 * Math.log10(sum);
}

/** The `percentile`-th value of a sorted-on-the-fly copy of `values`. */
function percentile(values: number[], fraction: number): number {
  if (values.length === 0) return Number.NEGATIVE_INFINITY;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.round(fraction * (sorted.length - 1)))
  );
  return sorted[index] ?? Number.NEGATIVE_INFINITY;
}

/**
 * Gated loudness per ITU-R BS.1770-4, with the EBU Tech 3342 loudness range.
 *
 * Momentary blocks are 400 ms at a 100 ms hop and short-term blocks are 3 s at
 * the same hop. Integration applies the absolute gate at -70 LUFS and then the
 * relative gate 10 LU below the absolutely-gated mean; the loudness range gates
 * at -70 LUFS and 20 LU and reports the 10th-to-95th percentile spread.
 *
 * A signal shorter than one 400 ms block has no gated loudness to report and
 * comes back as -Infinity, which the caller renders as null rather than as a
 * number nobody measured.
 */
export function measureLoudness(
  planar: readonly Float32Array[],
  sampleRate: number
): LoudnessResult {
  const channels = planar.length;
  const empty: LoudnessResult = {
    integratedLufs: Number.NEGATIVE_INFINITY,
    loudnessRangeLu: 0,
    momentaryMaxLufs: Number.NEGATIVE_INFINITY,
    shortTermMaxLufs: Number.NEGATIVE_INFINITY,
    momentary: []
  };
  if (channels === 0 || planar[0].length === 0) return empty;

  const [shelf, highPass] = kWeightingFilters(sampleRate);
  const weighted = planar.map((plane) =>
    applyBiquad(applyBiquad(plane, shelf), highPass)
  );

  const hop = Math.max(1, Math.round(sampleRate * 0.1));
  const momentarySize = Math.max(1, Math.round(sampleRate * 0.4));
  const shortTermSize = Math.max(1, Math.round(sampleRate * 3));
  const length = weighted[0].length;

  /** Per-block channel mean squares over `blockSize`, dropping partial tails. */
  const blocks = (blockSize: number): { time: number; energies: number[] }[] => {
    const out: { time: number; energies: number[] }[] = [];
    for (let start = 0; start + blockSize <= length; start += hop) {
      out.push({
        time: start / sampleRate,
        energies: weighted.map((plane) =>
          meanSquare(plane, start, start + blockSize)
        )
      });
    }
    return out;
  };

  const momentaryBlocks = blocks(momentarySize);
  if (momentaryBlocks.length === 0) return empty;

  const momentary = momentaryBlocks.map((block) => ({
    time: block.time,
    lufs: blockLoudness(block.energies, channels)
  }));

  /** Gated mean loudness of the blocks that clear both gates. */
  const gatedLoudness = (
    candidates: { energies: number[]; lufs: number }[],
    relativeOffset: number
  ): number => {
    const aboveAbsolute = candidates.filter((block) => block.lufs > -70);
    if (aboveAbsolute.length === 0) return Number.NEGATIVE_INFINITY;
    const meanEnergies = (
      set: { energies: number[] }[]
    ): number[] =>
      Array.from({ length: channels }, (_unused, channel) =>
        set.reduce(
          (sum, block) => sum + (block.energies[channel] ?? 0),
          0
        ) / set.length
      );
    const relativeThreshold =
      blockLoudness(meanEnergies(aboveAbsolute), channels) - relativeOffset;
    const gated = aboveAbsolute.filter(
      (block) => block.lufs > relativeThreshold
    );
    if (gated.length === 0) return Number.NEGATIVE_INFINITY;
    return blockLoudness(meanEnergies(gated), channels);
  };

  const momentaryWithLoudness = momentaryBlocks.map((block, index) => ({
    energies: block.energies,
    lufs: momentary[index].lufs
  }));
  const integratedLufs = gatedLoudness(momentaryWithLoudness, 10);

  const shortTermBlocks = blocks(shortTermSize).map((block) => ({
    energies: block.energies,
    lufs: blockLoudness(block.energies, channels)
  }));
  const shortTermValues = shortTermBlocks.map((block) => block.lufs);

  // EBU Tech 3342: gate the short-term blocks absolutely, then 20 LU below
  // their gated mean, and take the 10th-to-95th percentile of what is left.
  let loudnessRangeLu = 0;
  const aboveAbsolute = shortTermBlocks.filter((block) => block.lufs > -70);
  if (aboveAbsolute.length > 1) {
    const relative = gatedLoudness(aboveAbsolute, 20);
    const kept = aboveAbsolute
      .filter((block) => block.lufs > relative - 20)
      .map((block) => block.lufs);
    if (kept.length > 1) {
      loudnessRangeLu = percentile(kept, 0.95) - percentile(kept, 0.1);
    }
  }

  return {
    integratedLufs,
    loudnessRangeLu,
    momentaryMaxLufs: Math.max(...momentary.map((block) => block.lufs)),
    shortTermMaxLufs:
      shortTermValues.length > 0
        ? Math.max(...shortTermValues)
        : Number.NEGATIVE_INFINITY,
    momentary
  };
}

// ---------------------------------------------------------------------------
// Events: silence, onsets, tempo
// ---------------------------------------------------------------------------

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

/** A stretch of the timeline classified as silent or as sound. */
export interface AudioSegment {
  readonly start: number;
  readonly end: number;
  readonly duration: number;
}

/**
 * Runs where the envelope stays under `thresholdDb`, at least
 * `minDurationSeconds` long.
 *
 * `frameDuration` is how much time one envelope frame covers, so a run that
 * ends at the last frame is reported through to the end of that frame rather
 * than to its start.
 */
export function silenceSegments(
  frames: readonly EnergyFrame[],
  thresholdDb: number,
  minDurationSeconds: number,
  frameDuration: number
): AudioSegment[] {
  const segments: AudioSegment[] = [];
  let runStart: number | null = null;
  const close = (endTime: number): void => {
    if (runStart === null) return;
    const duration = endTime - runStart;
    if (duration >= minDurationSeconds) {
      segments.push({ start: runStart, end: endTime, duration });
    }
    runStart = null;
  };
  for (const frame of frames) {
    const silent = amplitudeToDb(frame.rms) < thresholdDb;
    if (silent && runStart === null) {
      runStart = frame.time;
    } else if (!silent) {
      close(frame.time);
    }
  }
  const last = frames.at(-1);
  if (last) close(last.time + frameDuration);
  return segments;
}

/** The gaps between silences: everything that is not silent. */
export function invertSegments(
  segments: readonly AudioSegment[],
  duration: number
): AudioSegment[] {
  const out: AudioSegment[] = [];
  let cursor = 0;
  const push = (start: number, end: number): void => {
    if (end - start > 0) out.push({ start, end, duration: end - start });
  };
  for (const segment of segments) {
    push(cursor, segment.start);
    cursor = Math.max(cursor, segment.end);
  }
  push(cursor, duration);
  return out;
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
