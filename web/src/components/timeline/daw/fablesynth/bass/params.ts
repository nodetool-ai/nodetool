// Canonical BL-1 parameter definitions. Single mono voice, so ids are flat
// (no pad namespace) — every knob, patch and worklet message keys off this
// table (same params-as-truth discipline as WT-1/DR-1).

import {
  PARAM_DEFS, fmtHz, fmtSec, fmtPct, fmtBi,
  LFO_DIVS, LFO_SHAPES, TABLE_NAMES,
  type ParamDef, type ParamValues,
} from '../params';

export { LFO_DIVS, LFO_SHAPES, TABLE_NAMES };

export const BASS_FILTER_TYPES = ['LP 12', 'LP 24', 'BP 12', 'HP 12', 'NOTCH'];
export const SUB_SHAPES = ['SINE', 'SQR'];

// The sequencer's note 0 / keyboard's lowest key. C2 keeps a two-octave
// keyboard centered on classic acid bass territory (C2..B3).
export const ROOT_MIDI = 36;
export const KEY_COUNT = 25; // two octaves + top C

const fmtSt = (v: number) => (v > 0 ? '+' : '') + Math.round(v) + ' ST';
const fmtCt = (v: number) => (v > 0 ? '+' : '') + Math.round(v) + ' CT';

export const BASS_PARAM_DEFS: ParamDef[] = [
  // ---- oscillator ----
  { id: 'osc.table', type: 'enum', options: TABLE_NAMES, def: 0 },
  { id: 'osc.pos', label: 'POS', min: 0, max: 1, def: 0.3, curve: 'lin', fmt: fmtPct },
  { id: 'osc.tune', label: 'TUNE', min: -24, max: 24, def: 0, curve: 'int', fmt: fmtSt },
  { id: 'osc.fine', label: 'FINE', min: -100, max: 100, def: 0, curve: 'int', fmt: fmtCt },
  { id: 'osc.unison', label: 'UNI', min: 1, max: 7, def: 1, curve: 'int', fmt: (v) => String(Math.round(v)) },
  { id: 'osc.detune', label: 'DET', min: 0, max: 1, def: 0.2, curve: 'lin', fmt: fmtPct },
  { id: 'osc.spread', label: 'SPRD', min: 0, max: 1, def: 0, curve: 'lin', fmt: fmtPct },
  { id: 'osc.level', label: 'LVL', min: 0, max: 1, def: 0.8, curve: 'lin', fmt: fmtPct },
  // ---- sub oscillator ----
  { id: 'sub.shape', type: 'enum', options: SUB_SHAPES, def: 0 },
  { id: 'sub.oct', label: 'OCT', min: -2, max: -1, def: -1, curve: 'int', fmt: (v) => String(Math.round(v)) },
  { id: 'sub.level', label: 'LVL', min: 0, max: 1, def: 0.55, curve: 'lin', fmt: fmtPct },
  // ---- filter ----
  { id: 'flt.type', type: 'enum', options: BASS_FILTER_TYPES, def: 1 },
  { id: 'flt.cut', label: 'CUT', min: 20, max: 20000, def: 340, curve: 'log', fmt: fmtHz },
  { id: 'flt.res', label: 'RES', min: 0, max: 1, def: 0.62, curve: 'lin', fmt: fmtPct },
  { id: 'flt.drive', label: 'DRIVE', min: 0, max: 1, def: 0.45, curve: 'lin', fmt: fmtPct },
  { id: 'flt.env', label: 'ENV', min: -1, max: 1, def: 0.7, curve: 'lin', fmt: fmtBi },
  { id: 'flt.track', label: 'TRACK', min: 0, max: 1, def: 0.3, curve: 'lin', fmt: fmtPct },
  // ---- envelopes: filter AD, amp ADSR ----
  { id: 'fenv.att', label: 'F·ATT', min: 0.0005, max: 0.5, def: 0.001, curve: 'log', fmt: fmtSec },
  { id: 'fenv.dec', label: 'F·DEC', min: 0.005, max: 4, def: 0.18, curve: 'log', fmt: fmtSec },
  { id: 'aenv.att', label: 'ATT', min: 0.0005, max: 0.5, def: 0.001, curve: 'log', fmt: fmtSec },
  { id: 'aenv.dec', label: 'DEC', min: 0.005, max: 4, def: 0.3, curve: 'log', fmt: fmtSec },
  { id: 'aenv.sus', label: 'SUS', min: 0, max: 1, def: 0.5, curve: 'lin', fmt: fmtPct },
  { id: 'aenv.rel', label: 'REL', min: 0.005, max: 2, def: 0.08, curve: 'log', fmt: fmtSec },
  // ---- accent + slide (one knob each: accent = level + env + decay) ----
  { id: 'acc.amt', label: 'ACC AMT', min: 0, max: 1, def: 0.7, curve: 'lin', fmt: fmtPct },
  { id: 'slide.time', label: 'SLD TIME', min: 0.01, max: 0.5, def: 0.06, curve: 'log', fmt: fmtSec },
  // ---- LFO → cutoff, bar-locked ----
  { id: 'lfo.rate', type: 'enum', options: LFO_DIVS, def: 6 }, // 1/8.
  { id: 'lfo.shape', type: 'enum', options: LFO_SHAPES, def: 0 },
  { id: 'lfo.depth', label: 'DEPTH', min: 0, max: 1, def: 0.15, curve: 'lin', fmt: fmtPct },
  // ---- FX (post-accent insert chain) ----
  { id: 'fx.drive.on', type: 'bool', def: 1 },
  { id: 'fx.drive.amt', label: 'AMT', min: 0, max: 1, def: 0.35, curve: 'lin', fmt: fmtPct },
  { id: 'fx.drive.mix', label: 'MIX', min: 0, max: 1, def: 0.2, curve: 'lin', fmt: fmtPct },
  { id: 'fx.chorus.on', type: 'bool', def: 0 },
  { id: 'fx.chorus.rate', label: 'RATE', min: 0.05, max: 8, def: 0.6, curve: 'log', fmt: (v) => v.toFixed(2) + ' Hz' },
  { id: 'fx.chorus.depth', label: 'DEPTH', min: 0, max: 1, def: 0.3, curve: 'lin', fmt: fmtPct },
  { id: 'fx.chorus.mix', label: 'MIX', min: 0, max: 1, def: 0.12, curve: 'lin', fmt: fmtPct },
  { id: 'fx.delay.on', type: 'bool', def: 0 },
  { id: 'fx.delay.time', label: 'TIME', min: 0.02, max: 1.5, def: 0.375, curve: 'log', fmt: fmtSec },
  { id: 'fx.delay.fb', label: 'FDBK', min: 0, max: 0.92, def: 0.42, curve: 'lin', fmt: fmtPct },
  { id: 'fx.delay.mix', label: 'MIX', min: 0, max: 1, def: 0.18, curve: 'lin', fmt: fmtPct },
  { id: 'fx.reverb.on', type: 'bool', def: 1 },
  { id: 'fx.reverb.size', label: 'SIZE', min: 0, max: 1, def: 0.3, curve: 'lin', fmt: fmtPct },
  { id: 'fx.reverb.mix', label: 'MIX', min: 0, max: 1, def: 0.1, curve: 'lin', fmt: fmtPct },
  // ---- transport + master ----
  { id: 'seq.bpm', label: 'BPM', min: 60, max: 200, def: 138, curve: 'int', fmt: (v) => String(Math.round(v)) },
  { id: 'master.swing', label: 'SWING', min: 0, max: 1, def: 0.3, curve: 'lin', fmt: fmtPct },
  // Final visible gain stage: after FX, before the limiter.
  { id: 'master.volume', label: 'OUTPUT', min: 0, max: 1, def: 0.78, curve: 'lin', fmt: fmtPct },
  // Append web-only dynamics to preserve existing parameter positions.
  { id: 'fx.comp.on', type: 'bool', def: 0 },
  { id: 'fx.comp.thr', label: 'THRESH', min: -40, max: 0, def: -16, curve: 'lin', fmt: (v) => Math.round(v) + ' dB' },
  { id: 'fx.ott.on', type: 'bool', def: 0 },
  { id: 'fx.ott.depth', label: 'DEPTH', min: 0, max: 1, def: 0.35, curve: 'lin', fmt: fmtPct },
  { id: 'fx.ott.time', label: 'TIME', min: 0.01, max: 10, def: 1, curve: 'log', fmt: fmtPct },
  { id: 'fx.ott.up', label: 'UPWARD', min: 0, max: 2, def: 1, curve: 'lin', fmt: fmtPct },
  { id: 'fx.ott.down', label: 'DOWNWARD', min: 0, max: 2, def: 1, curve: 'lin', fmt: fmtPct },
  ...PARAM_DEFS.filter((d) => d.id.startsWith('fx.eq.')),
  ...PARAM_DEFS.filter((d) => ['fx.comp.att', 'fx.comp.rel', 'fx.comp.ratio', 'fx.drive.tone', 'fx.drive.type'].includes(d.id)),
  ...PARAM_DEFS.filter((d) => d.id === 'fx.comp.sc' || d.id === 'fx.comp.schp'),
  // Timeline only: the note velocity (1..127) at which a note counts as accented.
  { id: 'acc.vel', label: 'ACC VEL', min: 1, max: 127, def: 100, curve: 'int', fmt: (v) => String(Math.round(v)) },
];

export const BASS_PARAMS: Record<string, ParamDef> = Object.fromEntries(BASS_PARAM_DEFS.map((d) => [d.id, d]));

export function defaultBassParams(): ParamValues {
  const o: ParamValues = {};
  for (const d of BASS_PARAM_DEFS) o[d.id] = d.def;
  return o;
}
