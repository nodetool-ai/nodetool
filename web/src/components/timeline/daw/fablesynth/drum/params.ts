// Canonical DR-1 parameter definitions. Per-pad params are namespaced
// `pad<i>.<field>`; every knob, kit, and worklet message keys off this table
// (same params-as-truth discipline as WT-1's src/params.ts).
import { DRUM_SC_SOURCES, SC_HP_DEF } from '../engine/sidechain';

import {
  PARAM_DEFS, fmtHz, fmtSec, fmtPct, fmtPan, fmtBi,
  type ParamDef, type ParamValues,
} from '../params';

export const PAD_COUNT = 16;

// 4 drum tables (Task 2) followed by WT-1's six procedural tables, followed
// by 5 sample-derived TR-808 tables (Task 2 of the sampled-tables plan).
export const DRUM_TABLE_NAMES = [
  'THUD', 'CRACK', 'TINE', 'GRIT', 'PRIME', 'BLOOM', 'PULSE', 'VOX', 'CHIME', 'GLITCH',
  '808SD', '808CP', '808CH', '808OH', '808CY',
];
export const DRUM_SAMPLE_NAMES = [
  '808SD', '808CP', '808CH', '808OH', '808CY',
  '808BD', '808RS', '808CB', '808MA', '808CL',
  '808LC', '808MC', '808HC', '808LT', '808MT', '808HT',
  'UZU BD1', 'UZU BD2', 'UZU SD', 'UZU CP', 'UZU RIM', 'UZU HH', 'UZU OH', 'UZU RD',
  'UZU LT', 'UZU MT', 'UZU HT', 'UZU CR', 'UZU PERC', 'UZU SH', 'UZU TB', 'UZU MOD',
  'CC0 IMPACT KICK', 'CC0 IMPACT BASS', 'CC0 IMPACT SNARE', 'CC0 IMPACT CLAP', 'CC0 IMPACT RIM',
  'CC0 IMPACT CH', 'CC0 IMPACT OH', 'CC0 IMPACT TOM', 'CC0 IMPACT CY',
  'CC0 BOUNCE KICK 1', 'CC0 BOUNCE KICK 2', 'CC0 BOUNCE KICK 3', 'CC0 BOUNCE BASS',
  'CC0 BOUNCE SNARE 1', 'CC0 BOUNCE SNARE 2', 'CC0 BOUNCE CLAP', 'CC0 BOUNCE CH',
  'CC0 BOUNCE OH', 'CC0 BOUNCE TOM', 'CC0 BOUNCE CY',
];
export const DRUM_FILTER_TYPES = ['LP 12', 'LP 24', 'BP 12', 'HP 12', 'NOTCH'];
// Mod sources are per-pad: MOD ENV (per-pad decay env), VELO (hit velocity ×
// V→MOD), RAND (uniform ±1, drawn once per hit).
export const DMOD_SOURCES = ['—', 'MOD ENV', 'VELO', 'RAND'];
export const DMOD_DESTS = ['—', 'A POS', 'SAMPLE START', 'LEVEL', 'CUTOFF', 'PITCH', 'A FINE', 'SAMPLE FINE', 'NOISE LVL', 'RES'];
export const CHOKE_NAMES = ['—', 'CHK 1', 'CHK 2', 'CHK 3', 'CHK 4'];
export const OUT_NAMES = ['MAIN', 'AUX 1', 'AUX 2', 'AUX 3', 'AUX 4'];

export const pad = (i: number, field: string): string => `pad${i}.${field}`;

const fmtSt = (v: number) => (v > 0 ? '+' : '') + Math.round(v) + ' ST';
const fmtCt = (v: number) => (v > 0 ? '+' : '') + Math.round(v) + ' CT';

// The same definitions back both DR-1 FX layers: `pad<n>.fx.*` is an
// independent pad insert and unscoped `fx.*` is the post-mix drum-group strip.
// They intentionally share the advanced module layout and parameter ranges.
export const FX_DEFS: ParamDef[] = [
  { id: 'fx.drive.on', type: 'bool', def: 0 },
  { id: 'fx.drive.amt', label: 'AMT', min: 0, max: 1, def: 0.3, curve: 'lin', fmt: fmtPct },
  { id: 'fx.drive.mix', label: 'MIX', min: 0, max: 1, def: 1, curve: 'lin', fmt: fmtPct },
  { id: 'fx.comp.on', type: 'bool', def: 1 },
  { id: 'fx.comp.thr', label: 'THRESH', min: -40, max: 0, def: -16, curve: 'lin', fmt: (v) => Math.round(v) + ' dB' },
  // Retained for saved/native patches; web COMP now uses automatic gain.
  { id: 'fx.comp.gain', label: 'MAKEUP', min: 0, max: 12, def: 4, curve: 'lin', fmt: (v) => '+' + v.toFixed(1) + ' dB' },
  { id: 'fx.chorus.on', type: 'bool', def: 0 },
  { id: 'fx.chorus.rate', label: 'RATE', min: 0.05, max: 8, def: 0.6, curve: 'log', fmt: (v) => v.toFixed(2) + ' Hz' },
  { id: 'fx.chorus.depth', label: 'DEPTH', min: 0, max: 1, def: 0.4, curve: 'lin', fmt: fmtPct },
  { id: 'fx.chorus.mix', label: 'MIX', min: 0, max: 1, def: 0.2, curve: 'lin', fmt: fmtPct },
  { id: 'fx.delay.on', type: 'bool', def: 0 },
  { id: 'fx.delay.time', label: 'TIME', min: 0.02, max: 1.5, def: 0.36, curve: 'log', fmt: fmtSec },
  { id: 'fx.delay.fb', label: 'FDBK', min: 0, max: 0.92, def: 0.35, curve: 'lin', fmt: fmtPct },
  { id: 'fx.delay.mix', label: 'MIX', min: 0, max: 1, def: 0.15, curve: 'lin', fmt: fmtPct },
  { id: 'fx.reverb.on', type: 'bool', def: 1 },
  { id: 'fx.reverb.size', label: 'SIZE', min: 0, max: 1, def: 0.4, curve: 'lin', fmt: fmtPct },
  { id: 'fx.reverb.mix', label: 'MIX', min: 0, max: 1, def: 0.16, curve: 'lin', fmt: fmtPct },
  // Web OTT insert. Append so existing parameter ordering stays stable.
  { id: 'fx.ott.on', type: 'bool', def: 0 },
  { id: 'fx.ott.depth', label: 'DEPTH', min: 0, max: 1, def: 0.35, curve: 'lin', fmt: fmtPct },
  { id: 'fx.ott.time', label: 'TIME', min: 0.01, max: 10, def: 1, curve: 'log', fmt: fmtPct },
  { id: 'fx.ott.up', label: 'UPWARD', min: 0, max: 2, def: 1, curve: 'lin', fmt: fmtPct },
  { id: 'fx.ott.down', label: 'DOWNWARD', min: 0, max: 2, def: 1, curve: 'lin', fmt: fmtPct },
  // Legacy serialized field; web OTT now uses automatic gain.
  { id: 'fx.ott.gain', label: 'OUTPUT', min: -48, max: 24, def: 0, curve: 'lin', fmt: (v) => (v > 0 ? '+' : '') + v.toFixed(1) + ' dB' },
  ...PARAM_DEFS.filter((d) => d.id.startsWith('fx.eq.')),
  ...PARAM_DEFS.filter((d) => ['fx.comp.att', 'fx.comp.rel', 'fx.comp.ratio', 'fx.drive.tone', 'fx.drive.type'].includes(d.id)),
  ...PARAM_DEFS.filter((d) => /^fx\.(crush|reso|shift|spray|glitch)\./.test(d.id)),
  // COMP side-chain: another pad of this kit, or another SQ-4 track.
  { id: 'fx.comp.sc', type: 'enum', options: DRUM_SC_SOURCES, def: 0 },
  { id: 'fx.comp.schp', ...SC_HP_DEF },
];

// The post-mix drum group starts with the reference strip: firm OTT and
// compression into soft saturation, while modulation and space stay opt-in.
// Pad inserts retain the neutral FX_DEFS values above so individual voices do
// not inherit bus processing.
const GROUP_FX_DEFAULTS: Record<string, number> = {
  'fx.ott.on': 1,
  'fx.comp.on': 1,
  'fx.drive.on': 1,
  'fx.chorus.on': 0,
  'fx.delay.on': 0,
  'fx.reverb.on': 0,
};

function oscFields(): ParamDef[] {
  return [
    { id: 'oscA.table', type: 'enum', options: DRUM_TABLE_NAMES, def: 0 },
    { id: 'oscA.pos', label: 'POS', min: 0, max: 1, def: 0, curve: 'lin', fmt: fmtPct },
    { id: 'oscA.tune', label: 'TUNE', min: -48, max: 48, def: 0, curve: 'int', fmt: fmtSt },
    { id: 'oscA.fine', label: 'FINE', min: -100, max: 100, def: 0, curve: 'int', fmt: fmtCt },
    { id: 'oscA.phase', label: 'PHASE', min: 0, max: 1, def: 0, curve: 'lin', fmt: fmtPct },
    { id: 'oscA.unison', label: 'UNI', min: 1, max: 7, def: 1, curve: 'int', fmt: (v) => String(Math.round(v)) },
    { id: 'oscA.detune', label: 'DET', min: 0, max: 1, def: 0.2, curve: 'lin', fmt: fmtPct },
    { id: 'oscA.level', label: 'LVL', min: 0, max: 1, def: 0.75, curve: 'lin', fmt: fmtPct },
  ];
}

// Keep the legacy oscB ids and eight field slots so saved automation and every
// later flat C++ parameter index remain stable. They now describe a one-shot
// sample player rather than a cyclic oscillator.
function sampleFields(): ParamDef[] {
  return [
    { id: 'oscB.table', label: 'SAMPLE', type: 'enum', options: DRUM_SAMPLE_NAMES, def: 0 },
    { id: 'oscB.pos', label: 'START', min: 0, max: 1, def: 0, curve: 'lin', fmt: fmtPct },
    { id: 'oscB.tune', label: 'TUNE', min: -48, max: 48, def: 0, curve: 'int', fmt: fmtSt },
    { id: 'oscB.fine', label: 'FINE', min: -100, max: 100, def: 0, curve: 'int', fmt: fmtCt },
    { id: 'oscB.phase', label: 'REV', min: 0, max: 1, def: 0, curve: 'int', fmt: (v) => v >= 0.5 ? 'ON' : 'OFF' },
    { id: 'oscB.unison', label: 'MODE', min: 1, max: 1, def: 1, curve: 'int', fmt: () => '1-SHOT' },
    { id: 'oscB.detune', label: 'END', min: 0, max: 1, def: 1, curve: 'lin', fmt: fmtPct },
    { id: 'oscB.level', label: 'LVL', min: 0, max: 1, def: 0, curve: 'lin', fmt: fmtPct },
  ];
}

// One pad's field suffixes + defs (id fields are RELATIVE here; padded below).
const PAD_DEFS: ParamDef[] = [
  ...oscFields(),
  ...sampleFields(),
  { id: 'noise.color', label: 'COLOR', min: -1, max: 1, def: 0, curve: 'lin', fmt: fmtBi },
  { id: 'noise.level', label: 'LVL', min: 0, max: 1, def: 0, curve: 'lin', fmt: fmtPct },
  { id: 'ring.freq', label: 'RING Hz', min: 20, max: 12000, def: 1200, curve: 'log', fmt: fmtHz },
  { id: 'ring.mix', label: 'RING', min: 0, max: 1, def: 0, curve: 'lin', fmt: fmtPct },
  { id: 'penv.amt', label: 'AMT', min: -48, max: 48, def: 0, curve: 'int', fmt: fmtSt },
  { id: 'penv.dec', label: 'DEC', min: 0.005, max: 2, def: 0.06, curve: 'log', fmt: fmtSec },
  { id: 'aenv.att', label: 'ATT', min: 0.0005, max: 0.5, def: 0.001, curve: 'log', fmt: fmtSec },
  { id: 'aenv.hold', label: 'HOLD', min: 0, max: 0.25, def: 0.01, curve: 'lin', fmt: fmtSec },
  { id: 'aenv.dec', label: 'DEC', min: 0.005, max: 4, def: 0.24, curve: 'log', fmt: fmtSec },
  { id: 'aenv.curve', label: 'CURVE', min: 0, max: 1, def: 0.35, curve: 'lin', fmt: fmtPct },
  { id: 'flt.on', type: 'bool', def: 0 },
  { id: 'flt.type', type: 'enum', options: DRUM_FILTER_TYPES, def: 0 },
  { id: 'flt.cut', label: 'CUT', min: 20, max: 20000, def: 1800, curve: 'log', fmt: fmtHz },
  { id: 'flt.res', label: 'RES', min: 0, max: 1, def: 0.18, curve: 'lin', fmt: fmtPct },
  { id: 'flt.drive', label: 'DRIVE', min: 0, max: 1, def: 0, curve: 'lin', fmt: fmtPct },
  ...[1, 2, 3, 4].flatMap((n): ParamDef[] => [
    { id: `mod${n}.src`, type: 'enum', options: DMOD_SOURCES, def: 0 },
    { id: `mod${n}.dst`, type: 'enum', options: DMOD_DESTS, def: 0 },
    { id: `mod${n}.amt`, label: '', min: -1, max: 1, def: 0, curve: 'lin', fmt: fmtBi },
  ]),
  { id: 'modenv.dec', label: 'DEC', min: 0.005, max: 2, def: 0.084, curve: 'log', fmt: fmtSec },
  { id: 'lvl', label: 'LVL', min: 0, max: 1, def: 0.8, curve: 'lin', fmt: fmtPct },
  { id: 'pan', label: 'PAN', min: -1, max: 1, def: 0, curve: 'lin', fmt: fmtPan },
  { id: 'v2l', label: 'V→LVL', min: 0, max: 1, def: 0.6, curve: 'lin', fmt: fmtPct },
  { id: 'v2m', label: 'V→MOD', min: 0, max: 1, def: 0.4, curve: 'lin', fmt: fmtPct },
  { id: 'choke', type: 'enum', options: CHOKE_NAMES, def: 0, min: 0, max: 4, curve: 'int' },
  { id: 'out', type: 'enum', options: OUT_NAMES, def: 0, min: 0, max: 4, curve: 'int' },
  ...FX_DEFS,
];

export const PAD_FIELDS: string[] = PAD_DEFS.map((d) => d.id);

const GLOBAL_DEFS: ParamDef[] = [
  { id: 'seq.bpm', label: 'BPM', min: 60, max: 200, def: 126, curve: 'int', fmt: (v) => String(Math.round(v)) },
  { id: 'master.swing', label: 'SWING', min: 0, max: 1, def: 0.22, curve: 'lin', fmt: fmtPct },
  // Final visible gain stage: after summed pad FX, before the limiter.
  { id: 'master.volume', label: 'OUTPUT', min: 0, max: 1, def: 0.78, curve: 'lin', fmt: fmtPct },
  ...FX_DEFS.map((d) => ({ ...d, def: GROUP_FX_DEFAULTS[d.id] ?? d.def })),
];

export const DRUM_PARAM_DEFS: ParamDef[] = [
  ...Array.from({ length: PAD_COUNT }, (_, i) =>
    PAD_DEFS.map((d) => ({ ...d, id: pad(i, d.id) })),
  ).flat(),
  ...GLOBAL_DEFS,
];

export const DRUM_PARAMS: Record<string, ParamDef> = Object.fromEntries(DRUM_PARAM_DEFS.map((d) => [d.id, d]));

export function defaultDrumParams(): ParamValues {
  const o: ParamValues = {};
  for (const d of DRUM_PARAM_DEFS) o[d.id] = d.def;
  return o;
}
