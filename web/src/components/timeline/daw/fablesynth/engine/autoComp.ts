// Auto-comp: learn the signal entering a compressor, then choose threshold,
// ratio, attack and release for a style. With a detector trace (the
// compressor's own input, one value per sample) the fit runs the shared
// worklet Compressor's peak detector and static curve exactly, so the
// predicted gain reduction is what that compressor will do to the learned
// material (before its automatic makeup gain). Without a trace it falls back
// to block RMS plus a fixed peak offset, which is only approximate.

export interface CompStyle {
  id: string; label: string; hint: string;
  ratio: number;
  /** Attack in seconds. */
  attack: number;
  /** Release as a fraction of one beat. */
  releaseBeats: number;
  /** Average gain reduction wanted on the loud section, in dB. */
  targetGr: number;
  /** The loud section starts at this percentile of the level distribution. */
  loudPct: number;
}

export const COMP_STYLES: CompStyle[] = [
  { id: 'glue', label: 'GLUE', hint: 'Gentle bus cohesion, transients pass', ratio: 2, attack: 0.01, releaseBeats: 0.5, targetGr: 2, loudPct: 0.7 },
  { id: 'punch', label: 'PUNCH', hint: 'Slow attack lets the hit through, fast recovery', ratio: 4, attack: 0.025, releaseBeats: 0.25, targetGr: 4, loudPct: 0.75 },
  { id: 'level', label: 'LEVEL', hint: 'Even out a part that jumps between loud and quiet', ratio: 3, attack: 0.005, releaseBeats: 1, targetGr: 4, loudPct: 0.5 },
  { id: 'peaks', label: 'PEAKS', hint: 'Only catch the loudest hits', ratio: 6, attack: 0.0005, releaseBeats: 0.125, targetGr: 3, loudPct: 0.95 },
  { id: 'squash', label: 'SQUASH', hint: 'Dense, obvious pumping', ratio: 8, attack: 0.001, releaseBeats: 0.125, targetGr: 8, loudPct: 0.5 },
];

export const compStyleById = (id: string) => COMP_STYLES.find(s => s.id === id) ?? COMP_STYLES[0];

/** Fallback only: the peak detector reads this much above ~33 ms RMS blocks. */
export const DETECTOR_OFFSET_DB = 3;
export const BLOCK_RATE = 30;
const SILENCE_DB = -60;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Static gain change in dB (≤ 0) of the shared compressor: 18 dB soft knee. */
export function compGainDb(levelDb: number, threshold: number, ratio: number): number {
  const over = levelDb - threshold, slope = 1 / ratio - 1;
  return over <= 0 ? 0 : over < 9 ? slope * over * over / 18 : slope * (over - 4.5);
}

const percentile = (sorted: number[], p: number) => sorted[clamp(Math.round((sorted.length - 1) * p), 0, sorted.length - 1)];

/**
 * Estimates the beat period from the level envelope's onset autocorrelation.
 * Returns null when no tempo in 70–180 BPM stands out.
 */
export function estimateBpm(blocks: number[], rate = BLOCK_RATE): number | null {
  const raw = blocks.map((v, i) => i ? Math.max(0, v - blocks[i - 1]) : 0);
  // Widen single-block onsets so fractional beat periods still overlap.
  const onset = raw.map((v, i) => 0.25 * (raw[i - 1] ?? 0) + 0.5 * v + 0.25 * (raw[i + 1] ?? 0));
  const mean = onset.reduce((a, b) => a + b, 0) / Math.max(1, onset.length);
  const x = onset.map(v => v - mean);
  const energy = x.reduce((a, v) => a + v * v, 0);
  if (energy <= 0 || blocks.length < rate * 3) return null;
  // Autocorrelation at a fractional lag (linear interpolation), normalised.
  const ac = (lag: number) => {
    const k = Math.floor(lag), f = lag - k;
    let r = 0;
    for (let i = k + 1; i < x.length; i++) r += x[i] * (x[i - k] * (1 - f) + x[i - k - 1] * f);
    return r / energy;
  };
  // Comb score: the beat also correlates at two and four beats, and its half
  // carries the off-beats, which keeps a 1.5-beat lag from winning.
  let best = { lag: 0, r: 0, score: -Infinity };
  for (let lag = rate * 60 / 180; lag <= rate * 60 / 70; lag += 0.05) {
    const r = ac(lag), comb = r + 0.5 * ac(2 * lag) + 0.25 * ac(4 * lag) + 0.5 * Math.max(0, ac(lag / 2));
    // A tempo prior around 120 BPM (half an octave wide) resolves the
    // half/double-time ambiguity the comb cannot.
    const octaves = Math.log2(60 * rate / lag / 120), score = comb * Math.exp(-2 * octaves * octaves);
    if (score > best.score) best = { lag, r, score };
  }
  if (best.r < 0.1) return null;
  return Math.round(60 * rate / best.lag);
}

export interface CompFit {
  threshold: number; ratio: number; attack: number; release: number;
  /** Predicted average gain reduction on the loud section, dB (positive). */
  loudGr: number;
  /** Predicted average gain reduction over all audible blocks, dB (positive). */
  meanGr: number;
  /** 10th–90th percentile level spread of the input, dB. */
  rangeDb: number;
  bpm: number | null;
  /** Mean detector level of each audible block in dB, for the histogram. */
  levels: number[];
  /** True when the fit ran the exact detector on a trace. */
  exact: boolean;
}

export interface FitOptions {
  bpm?: number | null;
  /** Detector input per block (max |L|,|R| per sample), aligned with `blocks`. */
  traces?: (Float32Array | null)[];
  sampleRate?: number;
}

/**
 * Runs the worklet Compressor's peak detector over the traces and returns
 * the detector level in dB per sample, per block. Mirrors `processSample`:
 * a one-pole on the peak, attack when rising and release when falling.
 */
export function detectorDb(traces: (Float32Array | null)[], attack: number, release: number, sampleRate: number): (Float32Array | null)[] {
  const ca = 1 - Math.exp(-1 / (clamp(attack, 0.0001, 0.1) * sampleRate));
  const cr = 1 - Math.exp(-1 / (clamp(release, 0.01, 2) * sampleRate));
  let env = 0;
  return traces.map(t => {
    if (!t) return null;
    const out = new Float32Array(t.length);
    for (let i = 0; i < t.length; i++) {
      const pk = t[i];
      env += (pk - env) * (pk > env ? ca : cr);
      out[i] = 20 * Math.log10(Math.max(1e-9, env));
    }
    return out;
  });
}

/** `depth` scales the style's target reduction; 1 is the style's own amount. */
export function fitComp(blocks: number[], style: CompStyle, depth: number, options: FitOptions = {}): CompFit | null {
  const audible = blocks.flatMap((v, i) => Number.isFinite(v) && v > SILENCE_DB ? [i] : []);
  if (audible.length < BLOCK_RATE) return null;
  const sorted = audible.map(i => blocks[i]).sort((a, b) => a - b);
  const cut = percentile(sorted, style.loudPct);
  const loud = audible.filter(i => blocks[i] >= cut);
  const target = style.targetGr * depth;
  const tempo = options.bpm ?? estimateBpm(blocks);
  const release = Math.round(clamp(style.releaseBeats * 60 / (tempo ?? 120), 0.01, 2) * 1000) / 1000;

  // Per-block detector levels: exact from the trace, else RMS plus the offset.
  const traces = options.traces;
  const exact = !!traces && loud.every(i => traces[i]?.length) && !!options.sampleRate;
  const det = exact ? detectorDb(traces!, style.attack, release, options.sampleRate!) : null;
  const blockGr = (i: number, thr: number) => {
    const d = det?.[i];
    if (!d) return -compGainDb(blocks[i] + DETECTOR_OFFSET_DB, thr, style.ratio);
    let s = 0;
    for (let k = 0; k < d.length; k++) s += compGainDb(d[k], thr, style.ratio);
    return -s / d.length;
  };
  const gr = (set: number[], thr: number) => set.reduce((a, i) => a + blockGr(i, thr), 0) / set.length;
  // Reduction falls monotonically as the threshold rises: bisect on [-40, 0].
  let lo = -40, hi = 0;
  for (let n = 0; n < 16; n++) {
    const mid = (lo + hi) / 2;
    if (gr(loud, mid) > target) lo = mid; else hi = mid;
  }
  const threshold = Math.round((lo + hi) / 2 * 2) / 2;
  const level = (i: number) => {
    const d = det?.[i];
    if (!d) return blocks[i] + DETECTOR_OFFSET_DB;
    let s = 0;
    for (let k = 0; k < d.length; k++) s += d[k];
    return s / d.length;
  };
  return {
    threshold, ratio: style.ratio, attack: style.attack, release,
    loudGr: gr(loud, threshold), meanGr: gr(audible, threshold),
    rangeDb: percentile(sorted, 0.9) - percentile(sorted, 0.1),
    bpm: tempo, levels: audible.map(level), exact,
  };
}
