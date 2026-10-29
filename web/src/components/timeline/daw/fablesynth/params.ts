// Canonical parameter definitions. Every knob, preset and engine param keys off this.
// curve: 'lin' | 'log' (geometric min..max) | 'int'
import { SC_HP_DEF, SC_SOURCES } from './engine/sidechain';

export const fmtHz = (v: number) => (v >= 1000 ? (v / 1000).toFixed(2) + ' kHz' : v.toFixed(v < 100 ? 1 : 0) + ' Hz');
export const fmtSec = (v: number) => (v < 1 ? (v * 1000).toFixed(0) + ' ms' : v.toFixed(2) + ' s');
export const fmtPct = (v: number) => Math.round(v * 100) + '%';
export const fmtPan = (v: number) => (Math.abs(v) < 0.01 ? 'C' : (v < 0 ? Math.round(-v * 100) + 'L' : Math.round(v * 100) + 'R'));
export const fmtSigned = (v: number) => (v > 0 ? '+' : '') + Math.round(v);
export const fmtDb = (v: number) => (v > 0 ? '+' : '') + v.toFixed(1) + ' dB';
export const fmtBi = (v: number) => (v > 0 ? '+' : '') + Math.round(v * 100);
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
export const fmtNote = (v: number) => {
  const n = Math.round(v);
  return NOTE_NAMES[((n % 12) + 12) % 12] + (Math.floor(n / 12) - 1);
};

export const TABLE_NAMES = ['PRIME', 'BLOOM', 'PULSE', 'VOX', 'CHIME', 'GLITCH'];
// SVF types keep indices 0..4; comb + vowel are appended so existing presets stay valid.
export const FILTER_TYPES = ['LP 12', 'LP 24', 'BP 12', 'HP 12', 'NOTCH', 'COMB', 'VOWEL'];
export const FILTER_ROUTES = ['SERIAL', 'PARALLEL', 'SPLIT'];
export const LFO_SHAPES = ['SINE', 'TRI', 'SAW', 'SQR', 'S&H'];
export const LFO_DIVS = ['1/1', '1/2', '1/4', '1/4.', '1/4T', '1/8', '1/8.', '1/8T', '1/16', '1/16T', '1/32'];
// Cycles per beat (beat = quarter note) for each LFO_DIVS entry. Mirrors
// LFO_DIV_F in engine/worklet.js — keep the two in sync.
export const LFO_DIV_F = [0.25, 0.5, 1, 2 / 3, 1.5, 2, 4 / 3, 3, 4, 6, 8];
// The standalone web build has no host transport; synced LFOs (and their
// displays) lock to this tempo. Mirrors the worklet's default bpm.
export const SYNC_BPM = 120;
export const SUB_SHAPES = ['SINE', 'SQR'];
export const NOISE_TYPES = ['WHITE', 'PINK'];
// Append-only: saved routes store the index. 6.. are the Serum-parity sources.
// MOD WHL and AFTERTCH read the perf.* params; RANDOM is a per-note value.
export const MOD_SOURCES = ['—', 'LFO 1', 'LFO 2', 'MOD ENV', 'VELO', 'NOTE',
  'LFO 3', 'LFO 4', 'MOD ENV 2', 'MACRO 1', 'MACRO 2', 'MACRO 3', 'MACRO 4', 'MOD WHL', 'AFTERTCH', 'RANDOM'];
export const MACRO_COUNT = 4;
export const ENV_MODELS = ['CLASSIC', 'CURVE'];
/** MOD_SOURCES index of LFO n (1..4). */
export const lfoSource = (n: number) => (n <= 2 ? n : n + 3);
/** MOD_SOURCES index of macro n (1..4). */
export const macroSource = (n: number) => 8 + n;
// Log-curve modulation depth: a full route swings a Log param ×2^(x·D), i.e.
// ±D octaves. Mirrors MOD_LOG_D in engine/worklet.js — keep the two in sync.
export const MOD_LOG_D = 5;
// Modulation destinations (append-only; indices 0..10 keep their exact meaning so
// factory presets sound unchanged). dstTarget() below is the canonical map from a
// dst index to either a paramId (per-param dest) or a global token. Must match the
// C++ MOD_DESTS list in juce/source/dsp/Params.h index-for-index.
export const MOD_DESTS = [
  '—', 'A POS', 'B POS', 'F1 CUT', 'PITCH', 'AMP', 'PAN', 'A LVL', 'B LVL', 'F2 CUT', 'F2 RES',
  'A DETUNE', 'A SPREAD', 'A PAN', 'B DETUNE', 'B SPREAD', 'B PAN',
  'F1 RES', 'F1 DRIVE', 'F1 ENV', 'F1 KEY', 'F2 DRIVE', 'F2 ENV', 'F2 KEY',
  'SUB LVL', 'NOISE LVL',
  'A BLEND', 'B BLEND',
];

// Global modulation tokens (no single owning control — assignable only from the
// matrix list). Per-param dests resolve to a paramId string instead. Mirrors the
// C++ DstSentinel enum (DST_PITCH/AMP/PAN/NONE) in Params.h.
export type GlobalDst = 'pitch' | 'amp' | 'pan' | 'none';

// Canonical dst index -> target. Returns a paramId string for per-param dests, or
// a GlobalDst token for none/PITCH/AMP/PAN. Mirrors C++ dstTarget() exactly so the
// two engines route identically. Keep in sync with MOD_DESTS above.
export function dstTarget(dst: number): ParamId | GlobalDst {
  switch (dst | 0) {
    case 1: return 'oscA.pos';
    case 2: return 'oscB.pos';
    case 3: return 'filter.cutoff';
    case 4: return 'pitch';
    case 5: return 'amp';
    case 6: return 'pan';
    case 7: return 'oscA.level';
    case 8: return 'oscB.level';
    case 9: return 'filter2.cutoff';
    case 10: return 'filter2.res';
    case 11: return 'oscA.detune';
    case 12: return 'oscA.spread';
    case 13: return 'oscA.pan';
    case 14: return 'oscB.detune';
    case 15: return 'oscB.spread';
    case 16: return 'oscB.pan';
    case 17: return 'filter.res';
    case 18: return 'filter.drive';
    case 19: return 'filter.env';
    case 20: return 'filter.key';
    case 21: return 'filter2.drive';
    case 22: return 'filter2.env';
    case 23: return 'filter2.key';
    case 24: return 'sub.level';
    case 25: return 'noise.level';
    case 26: return 'oscA.blend';
    case 27: return 'oscB.blend';
    default: return 'none';
  }
}

// A single modulation route: a source (MOD_SOURCES index) drives a destination
// (MOD_DESTS index) by `amt` (-1..1). Serum-style — any number of routes, built
// by dragging a source onto a control rather than filling fixed matrix slots.
export interface ModConnection {
  src: number;
  dst: number;
  amt: number;
  pol?: number; // MOD_POLARITY index, 0 = source native
  aux?: number; // MOD_SOURCES index of the aux scale, 0 = none
}

// Per-route polarity. SRC keeps the source's native range (LFOs and NOTE are
// bipolar, MOD ENV and VELO are unipolar); UNI and BI force it. Mirrors
// polarize() in the C++ Params.h.
export const MOD_POLARITY = ['SRC', 'UNI', 'BI'];
const SOURCE_BIPOLAR = [false, true, true, false, false, true, true, true, false, false, false, false, false, false, false, false];
export function routeBipolar(src: number, pol: number): boolean {
  return pol === 1 ? false : pol === 2 ? true : SOURCE_BIPOLAR[src] ?? false;
}
/** Polarity value that stores `bipolar` for this source (SRC when it is native). */
export function polarityFor(src: number, bipolar: boolean): number {
  return bipolar === (SOURCE_BIPOLAR[src] ?? false) ? 0 : bipolar ? 2 : 1;
}
/** Ring readout, e.g. "LFO 1 ±30%" (bipolar) or "VELO +30%" (unipolar). */
export function routeLabel(src: number, amt: number, bipolar: boolean): string {
  const pct = Math.round(amt * 100);
  return `${MOD_SOURCES[src] ?? 'MOD'} ${bipolar ? `±${Math.abs(pct)}` : pct < 0 ? pct : `+${pct}`}%`;
}
export function polarize(x: number, src: number, pol: number): number {
  const native = SOURCE_BIPOLAR[src] ?? false;
  const bi = routeBipolar(src, pol);
  return bi === native ? x : bi ? x * 2 - 1 : (x + 1) * 0.5;
}

// Tint per MOD_SOURCES index. Each source reuses the accent of the panel it
// lives in (LFO 1 cyan, LFO 2 amber, MOD ENV violet, velocity/note slate) so a
// mod ring's color tells you where the movement comes from at a glance.
export const SOURCE_COLORS = ['', '#4de8ff', '#ffa14d', '#b18cff', '#9fb4d8', '#9fb4d8',
  '#6ff2a6', '#ff7ab6', '#d58cff', '#ffd24d', '#ffd24d', '#ffd24d', '#ffd24d', '#9fb4d8', '#9fb4d8', '#9fb4d8'];

// Which MOD_DESTS slot a given knob/slider drives — used for drag-to-assign and
// the on-control modulation rings. Pitch/amp/pan are global (no single control)
// and so are only assignable from the matrix list, not by dragging onto a knob.
export const DEST_OF_PARAM: Record<string, number> = {
  'oscA.pos': 1,
  'oscB.pos': 2,
  'filter.cutoff': 3,
  'oscA.level': 7,
  'oscB.level': 8,
  'filter2.cutoff': 9,
  'filter2.res': 10,
  'oscA.detune': 11,
  'oscA.spread': 12,
  'oscA.pan': 13,
  'oscB.detune': 14,
  'oscB.spread': 15,
  'oscB.pan': 16,
  'filter.res': 17,
  'filter.drive': 18,
  'filter.env': 19,
  'filter.key': 20,
  'filter2.drive': 21,
  'filter2.env': 22,
  'filter2.key': 23,
  'sub.level': 24,
  'noise.level': 25,
  'oscA.blend': 26,
  'oscB.blend': 27,
};

export type Curve = 'lin' | 'log' | 'int';
export type ParamType = 'bool' | 'enum';

export interface ParamDef {
  id: string;
  label?: string;
  min?: number;
  max?: number;
  def: number;
  curve?: Curve;
  fmt?: (v: number) => string;
  type?: ParamType;
  options?: string[];
}

export type ParamId = string;
export type ParamValues = Record<ParamId, number>;

function oscParams(prefix: string, defOn: number, defTable: number): ParamDef[] {
  return [
    { id: `${prefix}.on`, type: 'bool', def: defOn },
    { id: `${prefix}.table`, type: 'enum', options: TABLE_NAMES, def: defTable },
    { id: `${prefix}.pos`, label: 'POS', min: 0, max: 1, def: 0, curve: 'lin', fmt: fmtPct },
    { id: `${prefix}.oct`, label: 'OCT', min: -3, max: 3, def: 0, curve: 'int', fmt: fmtSigned },
    { id: `${prefix}.semi`, label: 'SEMI', min: -12, max: 12, def: 0, curve: 'int', fmt: fmtSigned },
    { id: `${prefix}.fine`, label: 'FINE', min: -100, max: 100, def: 0, curve: 'int', fmt: fmtSigned },
    { id: `${prefix}.unison`, label: 'UNI', min: 1, max: 16, def: 1, curve: 'int', fmt: (v) => String(Math.round(v)) },
    { id: `${prefix}.detune`, label: 'DETUNE', min: 0, max: 1, def: 0.2, curve: 'lin', fmt: fmtPct },
    { id: `${prefix}.spread`, label: 'SPREAD', min: 0, max: 1, def: 0.6, curve: 'lin', fmt: fmtPct },
    { id: `${prefix}.blend`, label: 'BLEND', min: 0, max: 1, def: 1.0, curve: 'lin', fmt: fmtPct },
    { id: `${prefix}.level`, label: 'LEVEL', min: 0, max: 1, def: 0.75, curve: 'lin', fmt: fmtPct },
    { id: `${prefix}.pan`, label: 'PAN', min: -1, max: 1, def: 0, curve: 'lin', fmt: fmtPan },
  ];
}

// One filter's parameter set. For COMB the cutoff knob tunes the comb pitch and
// RES sets feedback; for VOWEL cutoff morphs A-E-I-O-U and RES sharpens the formants.
function filterParams(prefix: string, defOn: number, defType: number, defCut: number): ParamDef[] {
  return [
    { id: `${prefix}.on`, type: 'bool', def: defOn },
    { id: `${prefix}.type`, type: 'enum', options: FILTER_TYPES, def: defType },
    { id: `${prefix}.cutoff`, label: 'CUTOFF', min: 20, max: 20000, def: defCut, curve: 'log', fmt: fmtHz },
    { id: `${prefix}.res`, label: 'RES', min: 0, max: 1, def: 0.18, curve: 'lin', fmt: fmtPct },
    { id: `${prefix}.drive`, label: 'DRIVE', min: 0, max: 1, def: 0, curve: 'lin', fmt: fmtPct },
    { id: `${prefix}.env`, label: 'ENV', min: -1, max: 1, def: 0, curve: 'lin', fmt: fmtBi },
    { id: `${prefix}.key`, label: 'KEY', min: 0, max: 1, def: 0, curve: 'lin', fmt: fmtPct },
  ];
}

function lfoParams(prefix: string, defRate: number): ParamDef[] {
  return [
    { id: `${prefix}.shape`, type: 'enum', options: LFO_SHAPES, def: 0 },
    { id: `${prefix}.rate`, label: 'RATE', min: 0.02, max: 30, def: defRate, curve: 'log', fmt: (v) => v.toFixed(2) + ' Hz' },
    { id: `${prefix}.sync`, type: 'bool', def: 0 },
    { id: `${prefix}.syncrate`, type: 'enum', options: LFO_DIVS, def: 2 },
    { id: `${prefix}.rise`, label: 'RISE', min: 0, max: 5, def: 0, curve: 'lin', fmt: fmtSec },
    { id: `${prefix}.phase`, label: 'PHASE', min: 0, max: 1, def: 0, curve: 'lin', fmt: fmtPct },
    { id: `${prefix}.retrig`, type: 'bool', def: 1 },
  ];
}

// One mod-matrix slot (mat1..mat16): a source enum, a dest enum and a bipolar
// amount. Mirrors the C++ addMat order in Params.cpp so preset ids line up 1:1.
function matParams(n: number): ParamDef[] {
  return [
    { id: `mat${n}.src`, type: 'enum', options: MOD_SOURCES, def: 0 },
    { id: `mat${n}.dst`, type: 'enum', options: MOD_DESTS, def: 0 },
    { id: `mat${n}.amt`, label: 'AMT', min: -1, max: 1, def: 0, curve: 'lin', fmt: fmtBi },
  ];
}

export const PARAM_DEFS: ParamDef[] = [
  ...oscParams('oscA', 1, 0),
  ...oscParams('oscB', 0, 1),

  { id: 'sub.on', type: 'bool', def: 0 },
  { id: 'sub.shape', type: 'enum', options: SUB_SHAPES, def: 0 },
  { id: 'sub.oct', label: 'OCT', min: -2, max: -1, def: -1, curve: 'int', fmt: fmtSigned },
  { id: 'sub.level', label: 'LEVEL', min: 0, max: 1, def: 0.5, curve: 'lin', fmt: fmtPct },
  { id: 'noise.on', type: 'bool', def: 0 },
  { id: 'noise.type', type: 'enum', options: NOISE_TYPES, def: 0 },
  { id: 'noise.level', label: 'LEVEL', min: 0, max: 1, def: 0.25, curve: 'lin', fmt: fmtPct },

  ...filterParams('filter', 1, 1, 9000),
  { id: 'filter.route', type: 'enum', options: FILTER_ROUTES, def: 0 },
  ...filterParams('filter2', 0, 0, 2000),

  { id: 'env1.a', label: 'ATK', min: 0.001, max: 8, def: 0.004, curve: 'log', fmt: fmtSec },
  { id: 'env1.d', label: 'DEC', min: 0.005, max: 10, def: 0.25, curve: 'log', fmt: fmtSec },
  { id: 'env1.s', label: 'SUS', min: 0, max: 1, def: 0.8, curve: 'lin', fmt: fmtPct },
  { id: 'env1.r', label: 'REL', min: 0.005, max: 12, def: 0.3, curve: 'log', fmt: fmtSec },
  { id: 'env2.a', label: 'ATK', min: 0.001, max: 8, def: 0.01, curve: 'log', fmt: fmtSec },
  { id: 'env2.d', label: 'DEC', min: 0.005, max: 10, def: 0.35, curve: 'log', fmt: fmtSec },
  { id: 'env2.s', label: 'SUS', min: 0, max: 1, def: 0, curve: 'lin', fmt: fmtPct },
  { id: 'env2.r', label: 'REL', min: 0.005, max: 12, def: 0.3, curve: 'log', fmt: fmtSec },

  ...lfoParams('lfo1', 2),
  ...lfoParams('lfo2', 5),

  ...Array.from({ length: 16 }, (_, i) => matParams(i + 1)).flat(),

  // Four-band EQ. Keep the original gain IDs and defaults for existing patches;
  // additional controls are appended below to preserve parameter indices.
  { id: 'fx.eq.on', type: 'bool', def: 0 },
  { id: 'fx.eq.low', label: 'LOW', min: -15, max: 15, def: 0, curve: 'lin', fmt: fmtDb },
  { id: 'fx.eq.mid', label: 'MID', min: -15, max: 15, def: 0, curve: 'lin', fmt: fmtDb },
  { id: 'fx.eq.mfreq', label: 'FREQ', min: 20, max: 20000, def: 900, curve: 'log', fmt: fmtHz },
  { id: 'fx.eq.high', label: 'HIGH', min: -15, max: 15, def: 0, curve: 'lin', fmt: fmtDb },

  { id: 'fx.drive.on', type: 'bool', def: 0 },
  { id: 'fx.drive.amt', label: 'AMOUNT', min: 0, max: 1, def: 0.3, curve: 'lin', fmt: fmtPct },
  { id: 'fx.drive.mix', label: 'MIX', min: 0, max: 1, def: 1, curve: 'lin', fmt: fmtPct },
  { id: 'fx.chorus.on', type: 'bool', def: 0 },
  { id: 'fx.chorus.rate', label: 'RATE', min: 0.05, max: 8, def: 0.6, curve: 'log', fmt: (v) => v.toFixed(2) + ' Hz' },
  { id: 'fx.chorus.depth', label: 'DEPTH', min: 0, max: 1, def: 0.5, curve: 'lin', fmt: fmtPct },
  { id: 'fx.chorus.mix', label: 'MIX', min: 0, max: 1, def: 0.5, curve: 'lin', fmt: fmtPct },
  { id: 'fx.delay.on', type: 'bool', def: 0 },
  { id: 'fx.delay.time', label: 'TIME', min: 0.02, max: 1.5, def: 0.36, curve: 'log', fmt: fmtSec },
  { id: 'fx.delay.fb', label: 'FDBK', min: 0, max: 0.92, def: 0.35, curve: 'lin', fmt: fmtPct },
  { id: 'fx.delay.mix', label: 'MIX', min: 0, max: 1, def: 0.3, curve: 'lin', fmt: fmtPct },
  { id: 'fx.reverb.on', type: 'bool', def: 0 },
  { id: 'fx.reverb.size', label: 'SIZE', min: 0, max: 1, def: 0.5, curve: 'lin', fmt: fmtPct },
  { id: 'fx.reverb.mix', label: 'MIX', min: 0, max: 1, def: 0.3, curve: 'lin', fmt: fmtPct },

  // Leveling "glue" compressor — the last FX. Defaults ON so patches sit at
  // roughly the same loudness (WebAudio DynamicsCompressor semantics).
  { id: 'fx.comp.on', type: 'bool', def: 1 },
  { id: 'fx.comp.thr', label: 'THRESH', min: -40, max: 0, def: -18, curve: 'lin', fmt: (v) => Math.round(v) + ' dB' },
  { id: 'fx.comp.gain', label: 'MAKEUP', min: 0, max: 12, def: 4, curve: 'lin', fmt: (v) => '+' + v.toFixed(1) + ' dB' },

  // Final visible gain stage: after FX, before DC blocking and limiting.
  { id: 'master.volume', label: 'OUTPUT', min: 0, max: 1, def: 0.75, curve: 'lin', fmt: fmtPct },
  { id: 'master.glide', label: 'GLIDE', min: 0, max: 0.5, def: 0, curve: 'lin', fmt: fmtSec },
  { id: 'master.mono', type: 'bool', def: 0 },

  // Note sequencer. seq.bpm also drives the worklet's virtual transport, so
  // synced LFOs phase-lock to the sequencer tempo while it plays.
  { id: 'seq.bpm', label: 'BPM', min: 60, max: 200, def: 120, curve: 'int', fmt: (v) => String(Math.round(v)) },
  { id: 'seq.swing', label: 'SWING', min: 0, max: 1, def: 0, curve: 'lin', fmt: fmtPct },
  { id: 'seq.root', label: 'ROOT', min: 24, max: 72, def: 48, curve: 'int', fmt: fmtNote },

  // Appended to retain all established WT-1 parameter IDs. Dynamics has
  // automatic level matching; fx.comp.gain remains serialized only.
  { id: 'fx.ott.on', type: 'bool', def: 0 },
  { id: 'fx.ott.depth', label: 'DEPTH', min: 0, max: 1, def: 0.35, curve: 'lin', fmt: fmtPct },
  { id: 'fx.ott.time', label: 'TIME', min: 0.01, max: 10, def: 1, curve: 'log', fmt: fmtPct },
  { id: 'fx.ott.up', label: 'UPWARD', min: 0, max: 2, def: 1, curve: 'lin', fmt: fmtPct },
  { id: 'fx.ott.down', label: 'DOWNWARD', min: 0, max: 2, def: 1, curve: 'lin', fmt: fmtPct },

  // Web parametric EQ extension: shelves + two bells, all freely tunable.
  { id: 'fx.eq.lfreq', label: 'FREQ', min: 20, max: 20000, def: 120, curve: 'log', fmt: fmtHz },
  { id: 'fx.eq.m2freq', label: 'FREQ', min: 20, max: 20000, def: 2500, curve: 'log', fmt: fmtHz },
  { id: 'fx.eq.hfreq', label: 'FREQ', min: 20, max: 20000, def: 6000, curve: 'log', fmt: fmtHz },
  { id: 'fx.eq.mid2', label: 'GAIN', min: -15, max: 15, def: 0, curve: 'lin', fmt: fmtDb },
  ...(['l', 'm', 'm2', 'h'] as const).flatMap((band, i): ParamDef[] => [
    { id: `fx.eq.${band}q`, label: 'Q', min: 0.2, max: 12, def: i === 0 || i === 3 ? Math.SQRT1_2 : 0.9, curve: 'log', fmt: v => v.toFixed(2) },
    { id: `fx.eq.${band}type`, type: 'enum', options: ['LOW SHELF', 'BELL', 'HIGH SHELF'], def: i === 0 ? 0 : i === 3 ? 2 : 1 },
    { id: `fx.eq.${band}on`, type: 'bool', def: 1 },
  ]),
  // Tape echo extension; keep the original delay IDs and saved timings.
  { id: 'fx.delay.tone', label: 'TONE', min: 400, max: 12000, def: 4500, curve: 'log', fmt: fmtHz },
  { id: 'fx.delay.sat', label: 'SAT', min: 0, max: 1, def: 0.2, curve: 'lin', fmt: fmtPct },
  { id: 'fx.delay.wow', label: 'WOW', min: 0, max: 1, def: 0.18, curve: 'lin', fmt: fmtPct },
  { id: 'fx.delay.flutter', label: 'FLUTTER', min: 0, max: 1, def: 0.12, curve: 'lin', fmt: fmtPct },
  { id: 'fx.delay.width', label: 'WIDTH', min: 0, max: 1, def: 1, curve: 'lin', fmt: fmtPct },
  { id: 'fx.delay.mode', type: 'enum', options: ['PING PONG', 'STEREO'], def: 0 },
  { id: 'fx.delay.sync', type: 'bool', def: 0 },
  { id: 'fx.delay.div', type: 'enum', options: ['1/4', '1/4.', '1/8', '1/8.', '1/8T', '1/16'], def: 3 },
  // Dynamics and drive extensions. Neutral defaults preserve existing patches.
  { id: 'fx.comp.att', label: 'ATTACK', min: 0.0001, max: 0.1, def: 0.003, curve: 'log', fmt: v => v < 0.01 ? (v * 1000).toFixed(1) + ' ms' : fmtSec(v) },
  { id: 'fx.comp.rel', label: 'RELEASE', min: 0.01, max: 2, def: 0.25, curve: 'log', fmt: fmtSec },
  { id: 'fx.comp.ratio', label: 'RATIO', min: 1, max: 20, def: 4, curve: 'log', fmt: v => v.toFixed(1) + ':1' },
  { id: 'fx.drive.tone', label: 'TONE', min: -1, max: 1, def: 0, curve: 'lin', fmt: v => v === 0 ? 'NEUTRAL' : `${Math.round(Math.abs(v) * 100)}% ${v < 0 ? 'DARK' : 'BRIGHT'}` },
  { id: 'fx.drive.type', type: 'enum', options: ['SOFT', 'TAPE', 'HARD'], def: 0 },
  // LAB page (native LabFx). Stages default off; the web engine does not
  // render them yet but keeps the values so sessions round-trip.
  { id: 'fx.crush.on', type: 'bool', def: 0 },
  { id: 'fx.crush.bits', label: 'BITS', min: 1, max: 16, def: 6, curve: 'lin', fmt: v => v.toFixed(1) },
  { id: 'fx.crush.rate', label: 'RATE', min: 200, max: 48000, def: 6000, curve: 'log', fmt: fmtHz },
  { id: 'fx.crush.chaos', label: 'CHAOS', min: 0, max: 1, def: 0.2, curve: 'lin', fmt: fmtPct },
  { id: 'fx.crush.mix', label: 'MIX', min: 0, max: 1, def: 1, curve: 'lin', fmt: fmtPct },
  { id: 'fx.reso.on', type: 'bool', def: 0 },
  { id: 'fx.reso.note', label: 'NOTE', min: 24, max: 84, def: 48, curve: 'int', fmt: fmtNote },
  { id: 'fx.reso.chord', type: 'enum', options: ['OCTAVES', 'FIFTHS', 'MINOR 7', 'MAJOR 9', 'SUS 4', 'TRITONE'], def: 2 },
  { id: 'fx.reso.decay', label: 'DECAY', min: 0, max: 1, def: 0.7, curve: 'lin', fmt: fmtPct },
  { id: 'fx.reso.mix', label: 'MIX', min: 0, max: 1, def: 0.5, curve: 'lin', fmt: fmtPct },
  { id: 'fx.shift.on', type: 'bool', def: 0 },
  { id: 'fx.shift.hz', label: 'SHIFT', min: -1000, max: 1000, def: 60, curve: 'lin', fmt: v => fmtSigned(v) + ' Hz' },
  { id: 'fx.shift.fb', label: 'SPIRAL', min: 0, max: 0.9, def: 0.5, curve: 'lin', fmt: fmtPct },
  { id: 'fx.shift.spread', label: 'SPREAD', min: 0, max: 1, def: 0.5, curve: 'lin', fmt: fmtPct },
  { id: 'fx.shift.mix', label: 'MIX', min: 0, max: 1, def: 0.5, curve: 'lin', fmt: fmtPct },
  { id: 'fx.spray.on', type: 'bool', def: 0 },
  { id: 'fx.spray.pitch', label: 'PITCH', min: -24, max: 24, def: 12, curve: 'int', fmt: v => fmtSigned(v) + ' st' },
  { id: 'fx.spray.density', label: 'DENSITY', min: 1, max: 40, def: 12, curve: 'log', fmt: v => v.toFixed(1) + '/s' },
  { id: 'fx.spray.scatter', label: 'SCATTER', min: 0, max: 1, def: 0.4, curve: 'lin', fmt: fmtPct },
  { id: 'fx.spray.mix', label: 'MIX', min: 0, max: 1, def: 0.45, curve: 'lin', fmt: fmtPct },
  { id: 'fx.glitch.on', type: 'bool', def: 0 },
  { id: 'fx.glitch.div', type: 'enum', options: ['1/4', '1/8', '1/16', '1/32', '1/64'], def: 2 },
  { id: 'fx.glitch.chance', label: 'CHANCE', min: 0, max: 1, def: 0.35, curve: 'lin', fmt: fmtPct },
  { id: 'fx.glitch.drift', label: 'DRIFT', min: -1, max: 1, def: 0, curve: 'lin', fmt: fmtBi },
  { id: 'fx.glitch.mix', label: 'MIX', min: 0, max: 1, def: 1, curve: 'lin', fmt: fmtPct },

  // Per-route polarity, appended so established parameter indices stay stable.
  ...Array.from({ length: 16 }, (_, i): ParamDef =>
    ({ id: `mat${i + 1}.pol`, type: 'enum', options: MOD_POLARITY, def: 0 })),

  // Serum-parity modulators, appended for stable indices: LFO 3/4, a second
  // mod envelope, four macros, performance controls, and a per-route aux
  // source that scales the route by the aux's unipolar value (0 = none).
  ...lfoParams('lfo3', 1),
  ...lfoParams('lfo4', 0.5),
  { id: 'env3.a', label: 'ATK', min: 0.001, max: 8, def: 0.01, curve: 'log', fmt: fmtSec },
  { id: 'env3.d', label: 'DEC', min: 0.005, max: 10, def: 0.35, curve: 'log', fmt: fmtSec },
  { id: 'env3.s', label: 'SUS', min: 0, max: 1, def: 0, curve: 'lin', fmt: fmtPct },
  { id: 'env3.r', label: 'REL', min: 0.005, max: 12, def: 0.3, curve: 'log', fmt: fmtSec },
  ...Array.from({ length: MACRO_COUNT }, (_, i): ParamDef =>
    ({ id: `macro${i + 1}`, label: `MACRO ${i + 1}`, min: 0, max: 1, def: 0, curve: 'lin', fmt: fmtPct })),
  { id: 'perf.modwheel', label: 'MOD WHL', min: 0, max: 1, def: 0, curve: 'lin', fmt: fmtPct },
  { id: 'perf.aftertouch', label: 'AFTERTCH', min: 0, max: 1, def: 0, curve: 'lin', fmt: fmtPct },
  ...Array.from({ length: 16 }, (_, i): ParamDef =>
    ({ id: `mat${i + 1}.aux`, type: 'enum', options: MOD_SOURCES, def: 0 })),

  // Envelope model per envelope (appended). CLASSIC is the original RC shape.
  // CURVE ends each segment exactly at its time, adds HOLD, and bends each
  // segment by a power curve: 50% is linear, the exponent doubles every 12%.
  ...[1, 2, 3].flatMap((n): ParamDef[] => [
    { id: `env${n}.model`, type: 'enum', options: ENV_MODELS, def: 0 },
    { id: `env${n}.h`, label: 'HOLD', min: 0, max: 8, def: 0, curve: 'lin', fmt: fmtSec },
    { id: `env${n}.ac`, label: 'A CRV', min: 0, max: 1, def: 0.5, curve: 'lin', fmt: fmtPct },
    { id: `env${n}.dc`, label: 'D CRV', min: 0, max: 1, def: 0.67, curve: 'lin', fmt: fmtPct },
    { id: `env${n}.rc`, label: 'R CRV', min: 0, max: 1, def: 0.67, curve: 'lin', fmt: fmtPct },
  ]),
  // Mono note change: LEGATO keeps the envelopes running (the original WT-1
  // mono); off retriggers envelopes, per-note LFOs and RANDOM (Serum MONO).
  { id: 'master.legato', type: 'bool', def: 1 },
  // COMP side-chain (src/engine/sidechain.ts), appended to keep positions.
  { id: 'fx.comp.sc', type: 'enum', options: SC_SOURCES, def: 0 },
  { id: 'fx.comp.schp', ...SC_HP_DEF },
  // Lookahead peak limiter. Only the timeline's limiter insert runs it; WT-1
  // has no limiter stage and ignores these ids. Appended to keep positions.
  { id: 'fx.limit.on', type: 'bool', def: 1 },
  { id: 'fx.limit.gain', label: 'INPUT', min: 0, max: 24, def: 0, curve: 'lin', fmt: (v) => '+' + v.toFixed(1) + ' dB' },
  { id: 'fx.limit.ceil', label: 'CEILING', min: -12, max: 0, def: -1, curve: 'lin', fmt: (v) => v.toFixed(1) + ' dB' },
  { id: 'fx.limit.rel', label: 'RELEASE', min: 0.01, max: 1, def: 0.1, curve: 'log', fmt: fmtSec },
];

export const PARAMS: Record<string, ParamDef> = Object.fromEntries(PARAM_DEFS.map((d) => [d.id, d]));

export function defaultParams(): ParamValues {
  const o: ParamValues = {};
  for (const d of PARAM_DEFS) o[d.id] = d.def;
  return o;
}

// normalized [0,1] <-> value mapping
export function normToValue(def: ParamDef, n: number): number {
  n = Math.min(1, Math.max(0, n));
  const min = def.min as number;
  const max = def.max as number;
  if (def.curve === 'log') return min * Math.pow(max / min, n);
  const v = min + (max - min) * n;
  return def.curve === 'int' ? Math.round(v) : v;
}
export function valueToNorm(def: ParamDef, v: number): number {
  const min = def.min as number;
  const max = def.max as number;
  if (def.curve === 'log') return Math.log(v / min) / Math.log(max / min);
  return (v - min) / (max - min);
}
