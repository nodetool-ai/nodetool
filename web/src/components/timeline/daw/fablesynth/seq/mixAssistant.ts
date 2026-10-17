// SQ-4 mix assistant. It listens to the pre-FX master sum and the per-track
// post-fader taps, then proposes master EQ, dynamics, loudness and fader moves
// against a tonal-balance target. Everything here is pure so the browser panel
// only feeds analyser frames in and renders the plan that comes out.

import { BAND_HZ, SILENCE_DB, addBandPower, eqCurveDb, fitEq, powerDb as db, referenceById, rmsDb, type EqFit } from '../engine/autoEq';
import type { MachineId } from './protocol';
import type { MasterFxParams } from './masterFx';

export { BAND_HZ };
export type LoudnessTarget = -14 | -11 | -9;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

// Approximate BS.1770 K-weighting magnitude (power): the RLB high-pass near
// 38 Hz and the +4 dB high shelf near 1.5 kHz.
export function kWeightPower(f: number): number {
  const hp = f ** 4 / (f ** 4 + 38 ** 4);
  const shelf = 1 + (1.585 - 1) * (f * f / (f * f + 1500 * 1500));
  return hp * shelf * shelf;
}

export interface TrackInfo { machine: MachineId; name: string }

/** One track's analyser frame: time-domain samples and, optionally, its spectrum in dB. */
export interface TrackFrame { time: Float32Array; spectrum?: Float32Array }

/** Accumulates analyser frames while the assistant listens. */
export class MixListener {
  readonly bandPower = new Float64Array(BAND_HZ.length);
  readonly inBlocks: number[] = [];
  readonly outBlocks: number[] = [];
  readonly trackBlocks: number[][];
  readonly trackBandPower: Float64Array[];
  /** Linear power summed over every frame, silent ones included. */
  readonly trackPower: number[];
  frames = 0;
  peak = 0;

  constructor(readonly sampleRate: number, readonly fftSize: number, tracks: number) {
    this.trackBlocks = Array.from({ length: tracks }, () => []);
    this.trackBandPower = Array.from({ length: tracks }, () => new Float64Array(BAND_HZ.length));
    this.trackPower = new Array(tracks).fill(0);
  }

  /** `spectrum` is AnalyserNode float frequency data in dB. Returns true when the frame was audible. */
  add(spectrum: Float32Array, input: Float32Array, output?: Float32Array, tracks?: (TrackFrame | null)[]): boolean {
    const inDb = rmsDb(input);
    if (inDb < SILENCE_DB) return false;
    this.frames++;
    this.inBlocks.push(inDb);
    for (let i = 0; i < input.length; i++) this.peak = Math.max(this.peak, Math.abs(input[i]));
    if (output) { const o = rmsDb(output); if (o >= SILENCE_DB) this.outBlocks.push(o); }
    tracks?.forEach((t, i) => {
      if (!t || i >= this.trackBlocks.length) return;
      const v = rmsDb(t.time);
      this.trackPower[i] += 10 ** (v / 10);
      if (v < SILENCE_DB) return;
      this.trackBlocks[i].push(v);
      if (t.spectrum) addBandPower(this.trackBandPower[i], t.spectrum, this.sampleRate, t.spectrum.length * 2);
    });
    addBandPower(this.bandPower, spectrum, this.sampleRate, this.fftSize);
    return true;
  }
}

// BS.1770 style gating over block powers. The analyser frames are a mono
// downmix, so +3 dB restores the two-channel sum of a mostly correlated mix.
export function gatedLoudness(blocks: number[], kOffsetDb: number): number {
  const lufs = (v: number[]) => -0.691 + db(v.reduce((a, d) => a + 10 ** (d / 10), 0) / v.length) + kOffsetDb + 3.01;
  const abs = blocks.filter(d => d + kOffsetDb - 0.691 + 3.01 > -70);
  if (!abs.length) return -Infinity;
  const rel = lufs(abs) - 10;
  const gated = abs.filter(d => -0.691 + d + kOffsetDb + 3.01 > rel);
  return gated.length ? lufs(gated) : lufs(abs);
}

const median = (v: number[]) => {
  const s = [...v].sort((a, b) => a - b), h = s.length >> 1;
  return s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2;
};

const percentile = (v: number[], p: number) => {
  if (!v.length) return -Infinity;
  const s = [...v].sort((a, b) => a - b);
  return s[clamp(Math.round((s.length - 1) * p), 0, s.length - 1)];
};

export interface MixAnalysis {
  /** Measured band level in dB relative to the total. */
  spectrum: number[];
  lufsIn: number;
  lufsOut: number;
  peakDb: number;
  crestDb: number;
  /** Loud-section short-term level (90th percentile) of the pre-FX sum. */
  loudDb: number;
  kOffsetDb: number;
  /** Per track, null when the track was heard in under a quarter of the window. */
  tracks: (TrackStats | null)[];
  seconds: number;
}

export interface TrackStats {
  /** Gated loudness while the track plays. */
  lufs: number;
  /** Mean K-weighted power over the whole window, linear, for loudness prediction. */
  power: number;
  /** Fraction of the window in which the track is audible. */
  activity: number;
  /** Fraction of the track's energy below 160 Hz. */
  lowShare: number;
  /** 10th–90th percentile spread of its block levels, dB. */
  rangeDb: number;
}

const kOffset = (bands: Float64Array) => {
  const total = bands.reduce((a, b) => a + b, 0);
  return total > 0 ? db(BAND_HZ.reduce((a, f, i) => a + bands[i] * kWeightPower(f), 0) / total) : 0;
};

export function analyse(listener: MixListener): MixAnalysis {
  const total = listener.bandPower.reduce((a, b) => a + b, 0) || 1e-20;
  const kOffsetDb = kOffset(listener.bandPower);
  const raw = Array.from(listener.bandPower, p => db(p / total));
  const blockSeconds = listener.fftSize / listener.sampleRate;
  const lufsIn = gatedLoudness(listener.inBlocks, kOffsetDb);
  const peakDb = 20 * Math.log10(Math.max(listener.peak, 1e-10));
  const meanIn = db(listener.inBlocks.reduce((a, d) => a + 10 ** (d / 10), 0) / Math.max(1, listener.inBlocks.length));
  return {
    spectrum: raw,
    lufsIn,
    lufsOut: gatedLoudness(listener.outBlocks, kOffsetDb),
    peakDb,
    crestDb: peakDb - meanIn,
    loudDb: percentile(listener.inBlocks, 0.9),
    kOffsetDb,
    // Each track is weighted by its own spectrum; without one it shares the
    // mix estimate. Tracks heard in under a quarter of the window are left out.
    tracks: listener.trackBlocks.map((b, i) => {
      if (!listener.frames || b.length < listener.frames / 4) return null;
      const bands = listener.trackBandPower[i], bandTotal = bands.reduce((x, y) => x + y, 0);
      const k = bandTotal > 0 ? kOffset(bands) : kOffsetDb;
      return {
        lufs: gatedLoudness(b, k),
        power: listener.trackPower[i] / listener.frames * 10 ** (k / 10),
        activity: b.length / listener.frames,
        lowShare: bandTotal > 0 ? BAND_HZ.reduce((x, f, j) => x + (f < 160 ? bands[j] : 0), 0) / bandTotal : 0,
        rangeDb: percentile(b, 0.9) - percentile(b, 0.1),
      };
    }),
    seconds: listener.frames * blockSeconds,
  };
}

export interface AssistMove { id: string; label: string; from: string; to: string }
export interface AssistPlan {
  masterFx: Partial<MasterFxParams>;
  trackVol: (number | null)[];
  masterVol: number | null;
  eq: EqFit;
  levels: TrackLevel[];
  moves: AssistMove[];
  notes: string[];
}

export interface PlanInput {
  analysis: MixAnalysis;
  /** An `EQ_REFERENCES` id. */
  reference: string;
  loudness: LoudnessTarget;
  /** 0..1 — how much of each measured deviation to correct. */
  amount: number;
  bpm: number;
  sampleRate: number;
  masterFx: MasterFxParams;
  masterVol: number;
  trackVol: number[];
  tracks: TrackInfo[];
  /** Per-track role overrides; null or missing uses the detected role. */
  roles?: (MixRole | null)[];
}

export type MixRole = 'drums' | 'perc' | 'bass' | 'lead' | 'pad';

// Loudness of each role relative to the drums, in LU, for dance arrangements.
// Kick and bass carry the groove; the lead sits clear above the pads.
export const MIX_ROLES: { id: MixRole; label: string; lu: number }[] = [
  { id: 'drums', label: 'DRUMS', lu: 0 },
  { id: 'bass', label: 'BASS', lu: -2 },
  { id: 'lead', label: 'LEAD', lu: -6 },
  { id: 'perc', label: 'PERC', lu: -6 },
  { id: 'pad', label: 'PAD', lu: -7 },
];
const roleLu = (r: MixRole) => MIX_ROLES.find(x => x.id === r)!.lu;

// Generic track names state the role outright; authored names fall through.
const NAME_ROLES: [RegExp, MixRole][] = [
  [/\b(KICK|DRUMS?|BEAT|KIT)\b/, 'drums'], [/\b(HATS?|PERC|SHAKER|RIDE|CLAP|TOPS)\b/, 'perc'],
  [/\b(BASS|SUB)\b/, 'bass'], [/\b(LEAD|MELODY|HOOK|ARP|STABS?)\b/, 'lead'], [/\b(PADS?|CHORDS?|STRINGS|KEYS|DRONE)\b/, 'pad'],
];

/** Guesses a track's role from its name, machine, register and how it sustains. */
export function detectRole(machine: MachineId, t: TrackStats, name = ''): MixRole {
  const named = NAME_ROLES.find(([re]) => re.test(name.toUpperCase()));
  if (named) return named[1];
  if (machine === 'DR1') return t.lowShare < 0.15 ? 'perc' : 'drums';
  if (t.lowShare > (machine === 'BL1' ? 0.3 : 0.45)) return 'bass';
  return t.activity > 0.75 && t.rangeDb < 8 ? 'pad' : 'lead';
}

export interface TrackLevel {
  index: number; name: string;
  role: MixRole; detected: MixRole;
  /** Level and target on a common scale where the drum role sits at 0 LU. */
  current: number; target: number;
  /** Planned fader move in dB, 0 when the track stays. */
  move: number;
}

const fmtGain = (v: number) => `${v > 0 ? '+' : ''}${v.toFixed(1)} dB`;
const fmtHz = (v: number) => v >= 1000 ? `${(v / 1000).toFixed(v >= 10000 ? 0 : 1)} kHz` : `${Math.round(v)} Hz`;
const volDb = (from: number, to: number) => 40 * Math.log10(Math.max(to, 1e-6) / Math.max(from, 1e-6));

export function buildPlan(input: PlanInput): AssistPlan {
  const { analysis: a, amount, sampleRate } = input;
  const ref = referenceById(input.reference);
  const moves: AssistMove[] = [];
  const notes: string[] = [];
  const fx: Partial<MasterFxParams> = {};
  const prev = input.masterFx;

  const eq = fitEq(a.spectrum, ref, amount, sampleRate);
  const [lo, mid, mid2, hi] = eq.bands;
  Object.assign(fx, {
    'master.fx.eq.on': eq.change ? 1 : 0,
    'master.fx.eq.low': lo.gain, 'master.fx.eq.lfreq': lo.freq, 'master.fx.eq.lq': lo.q, 'master.fx.eq.ltype': lo.type, 'master.fx.eq.lon': 1,
    'master.fx.eq.mid': mid.gain, 'master.fx.eq.mfreq': mid.freq, 'master.fx.eq.mq': mid.q, 'master.fx.eq.mtype': mid.type, 'master.fx.eq.mon': 1,
    'master.fx.eq.mid2': mid2.gain, 'master.fx.eq.m2freq': mid2.freq, 'master.fx.eq.m2q': mid2.q, 'master.fx.eq.m2type': mid2.type, 'master.fx.eq.m2on': 1,
    'master.fx.eq.high': hi.gain, 'master.fx.eq.hfreq': hi.freq, 'master.fx.eq.hq': hi.q, 'master.fx.eq.htype': hi.type, 'master.fx.eq.hon': 1,
  });
  if (lo.gain) moves.push({ id: 'eq.low', label: `EQ LOW SHELF ${fmtHz(lo.freq)}`, from: fmtGain(prev['master.fx.eq.low']), to: fmtGain(lo.gain) });
  if (mid.gain) moves.push({ id: 'eq.mid', label: `EQ BELL ${fmtHz(mid.freq)}`, from: fmtGain(prev['master.fx.eq.mid']), to: fmtGain(mid.gain) });
  if (mid2.gain) moves.push({ id: 'eq.mid2', label: `EQ BELL ${fmtHz(mid2.freq)}`, from: fmtGain(prev['master.fx.eq.mid2']), to: fmtGain(mid2.gain) });
  if (hi.gain) moves.push({ id: 'eq.high', label: `EQ HIGH SHELF ${fmtHz(hi.freq)}`, from: fmtGain(prev['master.fx.eq.high']), to: fmtGain(hi.gain) });
  if (!eq.change) notes.push(`Tonal balance is already inside the ${ref.label} reference.`);
  const eqDb = BAND_HZ.map(f => eq.change ? eqCurveDb(eq.bands, f, sampleRate) : 0);

  // Faders: every heard track has a role target. The common offset is the
  // median error, so the fewest faders move; if a boost runs out of fader
  // travel, all moves shift down together and the master fader makes it up.
  const heard = a.tracks.flatMap((t, i) => t && Number.isFinite(t.lufs) && input.tracks[i] ? [{ i, t, info: input.tracks[i] }] : []);
  const roled = heard.length > 1 ? heard.map(x => {
    const detected = detectRole(x.info.machine, x.t, x.info.name);
    return { ...x, detected, role: input.roles?.[x.i] ?? detected };
  }) : [];
  const count = (r: MixRole) => roled.filter(x => x.role === r).length;
  // Tracks that share a role share its space: two of them sit 1.5 dB lower each.
  const target = roled.map(x => roleLu(x.role) - 5 * Math.log10(count(x.role)));
  const err = roled.map((x, k) => target[k] - x.t.lufs);
  const m = roled.length ? median(err) : 0;
  const up = roled.map(x => volDb(input.trackVol[x.i], 1));
  const want = err.map(e => clamp((e - m) * amount, -6, 6));
  const shift = Math.max(0, ...want.map((d, k) => d - up[k]));
  if (shift > 0.5) notes.push(`A track fader is at the top, so the other faders drop ${shift.toFixed(1)} dB instead.`);
  const trackDb = want.map(d => d - shift).map(d => Math.abs(d) < 1 && shift <= 0.5 ? 0 : d);
  // The tracks add as uncorrelated power, so fader moves scale the pre-FX sum.
  const sumShift = () => {
    const before = roled.reduce((s, x) => s + x.t.power, 0);
    return before > 0 ? db(roled.reduce((s, x, k) => s + x.t.power * 10 ** (trackDb[k] / 10), 0) / before) : 0;
  };

  // Loudness: predict the EQ and fader effect from the measurement. The
  // session stores the track faders but not the master fader, so the track
  // faders move together first and the master fader takes only the rest.
  // Dynamics changes are not modelled, so a second listen confirms the result.
  let masterVol: number | null = null, masterDb = 0;
  if (Number.isFinite(a.lufsOut)) {
    const p = BAND_HZ.map((f, i) => 10 ** (a.spectrum[i] / 10) * kWeightPower(f));
    const eqShift = db(p.reduce((s, v, i) => s + v * 10 ** (eqDb[i] / 10), 0) / p.reduce((s, v) => s + v, 0));
    const delta = clamp(input.loudness - (a.lufsOut + eqShift + sumShift()), -6, 6);
    if (Math.abs(delta) >= 0.5) {
      const room = roled.length ? Math.min(...trackDb.map((d, k) => up[k] - d)) : 0;
      const lift = roled.length ? Math.min(delta, Math.max(0, room)) : 0;
      if (Math.abs(lift) >= 0.5) trackDb.forEach((_, k) => trackDb[k] += lift);
      const rest = delta - (Math.abs(lift) >= 0.5 ? lift : 0);
      if (Math.abs(rest) >= 0.5) {
        const to = clamp(input.masterVol * 10 ** (rest / 40), 0, 1);
        if (Math.abs(volDb(input.masterVol, to)) >= 0.5) { masterVol = to; masterDb = volDb(input.masterVol, to); }
        if (roled.length) notes.push('The track faders are at the top, so the master fader takes the rest.');
        if (rest - masterDb > 0.5) notes.push('The master and track faders are at the top. Raise the comp makeup to get louder.');
      }
    }
  }

  // Dynamics follow the crest factor. A dense, already-squashed input gets
  // less OTT; the comp attack stays slow enough to pass the kick transient,
  // and its release follows the tempo so it recovers between beats. The
  // threshold follows the fader moves, which change the level into the comp.
  const crest = a.crestDb;
  const ottDepth = Math.round((crest > 18 ? 0.32 : crest > 13 ? 0.22 : 0.12) * (0.5 + amount / 2) * 100) / 100;
  const ratio = crest > 18 ? 3 : crest > 13 ? 2.5 : 2;
  const thr = Math.round(clamp(a.loudDb + sumShift() + 2, -36, -6));
  const rel = Math.round(clamp(30 / input.bpm, 0.08, 0.4) * 1000) / 1000;
  Object.assign(fx, {
    'master.fx.ott.on': 1, 'master.fx.ott.depth': ottDepth,
    'master.fx.comp.on': 1, 'master.fx.comp.thr': thr, 'master.fx.comp.att': 0.01, 'master.fx.comp.rel': rel, 'master.fx.comp.ratio': ratio,
    'master.fx.limiter.on': 1, 'master.fx.limiter.ceiling': -1,
  });
  moves.push({ id: 'ott.depth', label: 'OTT DEPTH', from: `${Math.round(prev['master.fx.ott.depth'] * 100)}%`, to: `${Math.round(ottDepth * 100)}%` });
  moves.push({ id: 'comp', label: 'GLUE COMP', from: `${prev['master.fx.comp.ratio'].toFixed(1)}:1 @ ${Math.round(prev['master.fx.comp.thr'])} dB`, to: `${ratio.toFixed(1)}:1 @ ${thr} dB` });
  moves.push({ id: 'comp.time', label: 'COMP ATTACK / RELEASE', from: `${Math.round(prev['master.fx.comp.att'] * 1000)} / ${Math.round(prev['master.fx.comp.rel'] * 1000)} ms`, to: `10 / ${Math.round(rel * 1000)} ms` });
  if (prev['master.fx.limiter.ceiling'] !== -1 || prev['master.fx.limiter.on'] < .5) moves.push({ id: 'limiter', label: 'LIMITER CEILING', from: fmtGain(prev['master.fx.limiter.ceiling']), to: '-1.0 dB' });

  const trackVol: (number | null)[] = input.trackVol.map(() => null);
  const levels: TrackLevel[] = roled.map((x, k) => {
    const from = input.trackVol[x.i];
    const to = clamp(from * 10 ** (trackDb[k] / 40), 0, 1);
    const move = trackDb[k] ? volDb(from, to) : 0;
    if (move) {
      trackVol[x.i] = to;
      moves.push({ id: `track.${x.i}`, label: `${x.info.name} · ${x.role.toUpperCase()}`, from: `${Math.round(from * 100)}`, to: `${Math.round(to * 100)} (${fmtGain(move)})` });
    }
    return { index: x.i, name: x.info.name, role: x.role, detected: x.detected, current: x.t.lufs + m, target: target[k], move };
  });
  if (roled.length && !levels.some(l => l.move)) notes.push('The track levels already match their roles.');
  if (heard.length < input.tracks.length) notes.push('Silent or muted tracks were left out of the balance.');
  if (masterVol !== null) moves.push({ id: 'master', label: `MASTER → ${input.loudness} LUFS`, from: `${Math.round(input.masterVol * 100)}`, to: `${Math.round(masterVol * 100)} (${fmtGain(masterDb)})` });
  return { masterFx: fx, trackVol, masterVol, eq, levels, moves, notes };
}
