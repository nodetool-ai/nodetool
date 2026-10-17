// Factory presets. Each entry overrides defaults from params.ts.
// Table indices: 0 PRIME, 1 BLOOM, 2 PULSE, 3 VOX, 4 CHIME, 5 GLITCH
// Mod sources: 0 —, 1 LFO1, 2 LFO2, 3 MODENV, 4 VELO, 5 NOTE
// Mod dests:   0 —, 1 A POS, 2 B POS, 3 F1 CUT, 4 PITCH, 5 AMP, 6 PAN, 7 A LVL,
//              8 B LVL, 9 F2 CUT, 10 F2 RES

import { defaultParams, type ModConnection, type ParamValues } from './params';
import { MOD_MATRIX_SIZE } from './store/slotHelpers';
import type { SerializedUserTable } from './engine/usertables';

export interface Preset {
  name: string;
  params: Partial<ParamValues>;
  // Modulation routes from older user presets. Routes now live entirely in the
  // `mat{n}.*` params (params-as-truth); factory presets encode them there and
  // current saves carry them in `params`. This optional array is kept only so
  // pre-existing user presets still load — `resolvePresetMods` expands it into
  // slots in order (truncating beyond 16). See `resolvePresetMods` below.
  mods?: ModConnection[];
  // Optional embedded user wavetables. When present they define the table pool
  // the preset's `*.table` indices (>= TABLE_NAMES.length) address. Factory
  // presets omit this and only use the 6 procedural tables. See
  // engine/usertables.ts for the serialization format.
  tables?: SerializedUserTable[];
}

export const FACTORY_PRESETS: Preset[] = [
  { name: 'INIT', params: {} },

  {
    name: 'VELVET PAD',
    params: {
      'oscA.table': 1, 'oscA.pos': 0.34, 'oscA.unison': 5, 'oscA.detune': 0.28, 'oscA.spread': 0.85, 'oscA.level': 0.7,
      'oscB.on': 1, 'oscB.table': 3, 'oscB.pos': 0.22, 'oscB.level': 0.42, 'oscB.unison': 3, 'oscB.detune': 0.2, 'oscB.fine': 6,
      'filter.type': 1, 'filter.cutoff': 1400, 'filter.res': 0.12, 'filter.env': 0.35, 'filter.key': 0.3,
      'env1.a': 0.9, 'env1.d': 1.2, 'env1.s': 0.82, 'env1.r': 1.8,
      'env2.a': 1.6, 'env2.d': 2.5, 'env2.s': 0.55, 'env2.r': 2.2,
      'lfo1.rate': 0.13,
      'mat1.src': 1, 'mat1.dst': 1, 'mat1.amt': 0.3,
      'mat2.src': 2, 'mat2.dst': 6, 'mat2.amt': 0.25, 'lfo2.rate': 0.21,
      'fx.chorus.on': 1, 'fx.chorus.mix': 0.55,
      'fx.reverb.on': 1, 'fx.reverb.size': 0.72, 'fx.reverb.mix': 0.42,
    
      'fx.eq.on': 1, 'fx.eq.low': -2, 'fx.eq.mid': -1.1, 'fx.eq.mfreq': 405, 'fx.eq.high': 3.1,
    },
  },

  {
    name: 'ACID LINE',
    params: {
      'fx.ott.on': 1, 'fx.ott.depth': 0.24, 'fx.ott.time': 1.1, 'fx.ott.up': 0.65, 'fx.ott.down': 0.8,
      'fx.comp.on': 1, 'fx.comp.thr': -20, 'fx.comp.att': 0.018, 'fx.comp.rel': 0.1, 'fx.comp.ratio': 3,
      'oscA.table': 0, 'oscA.pos': 0.66, 'oscA.level': 0.85,
      'sub.on': 1, 'sub.level': 0.4, 'sub.oct': -1,
      'filter.type': 1, 'filter.cutoff': 240, 'filter.res': 0.78, 'filter.env': 0.85, 'filter.drive': 0.35,
      'env1.a': 0.002, 'env1.d': 0.3, 'env1.s': 0.45, 'env1.r': 0.08,
      'env2.a': 0.001, 'env2.d': 0.19, 'env2.s': 0, 'env2.r': 0.12,
      'master.glide': 0.06, 'master.mono': 1,
      'fx.drive.on': 1, 'fx.drive.amt': 0.45, 'fx.drive.mix': 0.2,
      'fx.delay.on': 1, 'fx.delay.time': 0.18, 'fx.delay.fb': 0.3, 'fx.delay.mix': 0.22,

      'fx.eq.on': 1, 'fx.eq.low': -6, 'fx.eq.mid': -6, 'fx.eq.mfreq': 263, 'fx.eq.high': 6,
    },
  },

  {
    name: 'CRYSTAL PLUCK',
    params: {
      'fx.ott.on': 1, 'fx.ott.depth': 0.16, 'fx.ott.time': 1.4, 'fx.ott.up': 0.5, 'fx.ott.down': 0.65,
      'fx.comp.on': 1, 'fx.comp.thr': -18, 'fx.comp.att': 0.025, 'fx.comp.rel': 0.12, 'fx.comp.ratio': 2.5,
      'oscA.table': 4, 'oscA.pos': 0.72, 'oscA.oct': 1, 'oscA.level': 0.8, 'oscA.unison': 2, 'oscA.detune': 0.1, 'oscA.spread': 0.5,
      'filter.type': 0, 'filter.cutoff': 3200, 'filter.res': 0.2, 'filter.env': 0.6, 'filter.key': 0.6,
      'env1.a': 0.001, 'env1.d': 0.5, 'env1.s': 0, 'env1.r': 0.6,
      'env2.a': 0.001, 'env2.d': 0.32, 'env2.s': 0, 'env2.r': 0.3,
      'mat1.src': 4, 'mat1.dst': 3, 'mat1.amt': 0.35,
      'mat2.src': 3, 'mat2.dst': 1, 'mat2.amt': -0.4,
      'fx.delay.on': 1, 'fx.delay.time': 0.42, 'fx.delay.fb': 0.42, 'fx.delay.mix': 0.3,
      'fx.reverb.on': 1, 'fx.reverb.size': 0.55, 'fx.reverb.mix': 0.35,
    
      'fx.eq.on': 1, 'fx.eq.low': 6, 'fx.eq.mid': 4.7, 'fx.eq.mfreq': 709, 'fx.eq.high': -6,
    },
  },

  {
    name: 'HYPER SAW',
    params: {
      'fx.ott.on': 1, 'fx.ott.depth': 0.3, 'fx.ott.time': 1, 'fx.ott.up': 0.8, 'fx.ott.down': 0.85,
      'fx.comp.on': 1, 'fx.comp.thr': -20, 'fx.comp.att': 0.025, 'fx.comp.rel': 0.16, 'fx.comp.ratio': 3,
      'oscA.table': 0, 'oscA.pos': 0.66, 'oscA.unison': 7, 'oscA.detune': 0.42, 'oscA.spread': 1, 'oscA.level': 0.8,
      'oscB.on': 1, 'oscB.table': 0, 'oscB.pos': 0.66, 'oscB.oct': 1, 'oscB.unison': 5, 'oscB.detune': 0.35, 'oscB.spread': 0.9, 'oscB.level': 0.45,
      'sub.on': 1, 'sub.level': 0.45,
      'filter.type': 0, 'filter.cutoff': 12000, 'filter.res': 0.05,
      'env1.a': 0.01, 'env1.d': 0.4, 'env1.s': 0.9, 'env1.r': 0.5,
      'fx.chorus.on': 1, 'fx.chorus.rate': 0.4, 'fx.chorus.mix': 0.4,
      'fx.reverb.on': 1, 'fx.reverb.size': 0.4, 'fx.reverb.mix': 0.22,
    
      'fx.eq.on': 1, 'fx.eq.low': 5.1, 'fx.eq.mid': 6, 'fx.eq.mfreq': 598, 'fx.eq.high': -6,
    },
  },

  {
    name: 'VOWEL TALK',
    params: {
      'fx.ott.on': 1, 'fx.ott.depth': 0.3, 'fx.ott.time': 1, 'fx.ott.up': 0.85, 'fx.ott.down': 0.75,
      'fx.comp.on': 1, 'fx.comp.thr': -20, 'fx.comp.att': 0.018, 'fx.comp.rel': 0.14, 'fx.comp.ratio': 3,
      'oscA.table': 3, 'oscA.pos': 0.1, 'oscA.level': 0.85, 'oscA.unison': 3, 'oscA.detune': 0.12, 'oscA.spread': 0.6,
      'sub.on': 1, 'sub.level': 0.5, 'sub.oct': -1,
      'filter.type': 0, 'filter.cutoff': 4500, 'filter.res': 0.25,
      'env1.a': 0.01, 'env1.d': 0.3, 'env1.s': 0.85, 'env1.r': 0.25,
      'lfo1.shape': 1, 'lfo1.rate': 0.6,
      'mat1.src': 1, 'mat1.dst': 1, 'mat1.amt': 0.55,
      'mat2.src': 5, 'mat2.dst': 1, 'mat2.amt': 0.3,
      'fx.drive.on': 1, 'fx.drive.amt': 0.22, 'fx.drive.mix': 0.2,
    
      'fx.eq.on': 1, 'fx.eq.low': 4.5, 'fx.eq.mid': 5.2, 'fx.eq.mfreq': 916, 'fx.eq.high': -6,
    },
  },

  {
    name: 'CATHEDRAL BELL',
    params: {
      'oscA.table': 4, 'oscA.pos': 1, 'oscA.oct': 1, 'oscA.level': 0.75,
      'oscB.on': 1, 'oscB.table': 4, 'oscB.pos': 0.5, 'oscB.oct': 2, 'oscB.fine': 9, 'oscB.level': 0.3,
      'filter.type': 0, 'filter.cutoff': 9000, 'filter.res': 0.05, 'filter.key': 0.5,
      'env1.a': 0.001, 'env1.d': 2.8, 'env1.s': 0.12, 'env1.r': 3.5,
      'env2.a': 0.001, 'env2.d': 1.8, 'env2.s': 0, 'env2.r': 1.5,
      'mat1.src': 3, 'mat1.dst': 1, 'mat1.amt': -0.5,
      'lfo2.rate': 4.6, 'mat2.src': 2, 'mat2.dst': 4, 'mat2.amt': 0.015,
      'fx.reverb.on': 1, 'fx.reverb.size': 0.9, 'fx.reverb.mix': 0.5,
      'fx.delay.on': 1, 'fx.delay.time': 0.6, 'fx.delay.fb': 0.35, 'fx.delay.mix': 0.18,
    
      'fx.eq.on': 1, 'fx.eq.low': 6, 'fx.eq.mid': 5.2, 'fx.eq.mfreq': 693, 'fx.eq.high': -6,
    },
  },

  {
    name: 'NEURO WOBBLE',
    params: {
      'fx.ott.on': 1, 'fx.ott.depth': 0.38, 'fx.ott.time': 0.85, 'fx.ott.up': 0.9, 'fx.ott.down': 0.9,
      'fx.comp.on': 1, 'fx.comp.thr': -22, 'fx.comp.att': 0.015, 'fx.comp.rel': 0.12, 'fx.comp.ratio': 3.5,
      'oscA.table': 5, 'oscA.pos': 0.3, 'oscA.level': 0.8,
      'oscB.on': 1, 'oscB.table': 0, 'oscB.pos': 1, 'oscB.oct': -1, 'oscB.level': 0.55,
      'sub.on': 1, 'sub.level': 0.55, 'sub.oct': -1,
      'filter.type': 1, 'filter.cutoff': 700, 'filter.res': 0.45, 'filter.drive': 0.4,
      'env1.a': 0.003, 'env1.d': 0.3, 'env1.s': 0.9, 'env1.r': 0.15,
      'lfo1.shape': 0, 'lfo1.rate': 2.2,
      'mat1.src': 1, 'mat1.dst': 3, 'mat1.amt': 0.55,
      'mat2.src': 1, 'mat2.dst': 1, 'mat2.amt': 0.5,
      'mat3.src': 1, 'mat3.dst': 2, 'mat3.amt': -0.35,
      'fx.drive.on': 1, 'fx.drive.amt': 0.5, 'fx.drive.mix': 0.2,
    
      'fx.eq.on': 1, 'fx.eq.low': -3.8, 'fx.eq.mid': 3, 'fx.eq.mfreq': 356, 'fx.eq.high': 0.8,
    },
  },

  // ---- Iconic Serum-style sounds ----------------------------------------

  {
    // Detuned twin-saw Reese: the staple drum'n'bass / neuro foundation.
    name: 'REESE BASS',
    params: {
      'fx.ott.on': 1, 'fx.ott.depth': 0.26, 'fx.ott.time': 1.25, 'fx.ott.up': 0.65, 'fx.ott.down': 0.8,
      'fx.comp.on': 1, 'fx.comp.thr': -20, 'fx.comp.att': 0.025, 'fx.comp.rel': 0.16, 'fx.comp.ratio': 3,
      'oscA.table': 0, 'oscA.pos': 0.66, 'oscA.unison': 4, 'oscA.detune': 0.5, 'oscA.spread': 0.35, 'oscA.level': 0.85,
      'oscB.on': 1, 'oscB.table': 0, 'oscB.pos': 0.66, 'oscB.semi': -12, 'oscB.unison': 2, 'oscB.detune': 0.28, 'oscB.level': 0.5,
      'sub.on': 1, 'sub.level': 0.5, 'sub.oct': -1,
      'filter.type': 1, 'filter.cutoff': 520, 'filter.res': 0.26, 'filter.drive': 0.3, 'filter.key': 0.2,
      'env1.a': 0.005, 'env1.d': 0.4, 'env1.s': 0.85, 'env1.r': 0.18,
      'lfo1.shape': 0, 'lfo1.rate': 0.16,
      'mat1.src': 1, 'mat1.dst': 3, 'mat1.amt': 0.18,
      'mat2.src': 1, 'mat2.dst': 1, 'mat2.amt': 0.12,
      'fx.drive.on': 1, 'fx.drive.amt': 0.35, 'fx.drive.mix': 0.2,
    
      'fx.eq.on': 1, 'fx.eq.low': -6, 'fx.eq.mid': -6, 'fx.eq.mfreq': 320, 'fx.eq.high': 6,
    },
  },

  {
    // The legendary stacked-fifths saw lead — second osc a fifth up.
    name: 'POWER FIFTHS',
    params: {
      'master.volume': 0.5005, // Match the original output after adding drive.
      'fx.ott.on': 1, 'fx.ott.depth': 0.24, 'fx.ott.time': 1.15, 'fx.ott.up': 0.6, 'fx.ott.down': 0.8,
      'fx.comp.on': 1, 'fx.comp.thr': -20, 'fx.comp.att': 0.025, 'fx.comp.rel': 0.15, 'fx.comp.ratio': 3,
      'fx.drive.on': 1, 'fx.drive.amt': 0.18, 'fx.drive.mix': 0.2, 'fx.drive.type': 1, 'fx.drive.tone': -0.18,
      'oscA.table': 0, 'oscA.pos': 0.66, 'oscA.unison': 3, 'oscA.detune': 0.22, 'oscA.spread': 0.7, 'oscA.level': 0.7,
      'oscB.on': 1, 'oscB.table': 0, 'oscB.pos': 0.66, 'oscB.semi': 7, 'oscB.unison': 3, 'oscB.detune': 0.22, 'oscB.spread': 0.7, 'oscB.level': 0.55,
      'sub.on': 1, 'sub.level': 0.35,
      'filter.type': 0, 'filter.cutoff': 6500, 'filter.res': 0.12, 'filter.env': 0.3, 'filter.key': 0.3,
      'env1.a': 0.005, 'env1.d': 0.6, 'env1.s': 0.8, 'env1.r': 0.35,
      'env2.a': 0.005, 'env2.d': 0.3, 'env2.s': 0, 'env2.r': 0.2,
      'fx.chorus.on': 1, 'fx.chorus.mix': 0.35,
      'fx.delay.on': 1, 'fx.delay.time': 0.33, 'fx.delay.fb': 0.32, 'fx.delay.mix': 0.22,
      'fx.reverb.on': 1, 'fx.reverb.size': 0.5, 'fx.reverb.mix': 0.26,
    
      'fx.eq.on': 1, 'fx.eq.low': 5.3, 'fx.eq.mid': 6, 'fx.eq.mfreq': 601, 'fx.eq.high': -6,
    },
  },

  {
    // Talking dubstep growl: LFO sweeps the vowel table + cutoff into drive.
    name: 'GROWL BASS',
    params: {
      'fx.ott.on': 1, 'fx.ott.depth': 0.4, 'fx.ott.time': 0.85, 'fx.ott.up': 1, 'fx.ott.down': 0.85,
      'fx.comp.on': 1, 'fx.comp.thr': -22, 'fx.comp.att': 0.015, 'fx.comp.rel': 0.11, 'fx.comp.ratio': 3.5,
      'oscA.table': 3, 'oscA.pos': 0.15, 'oscA.unison': 2, 'oscA.detune': 0.14, 'oscA.spread': 0.5, 'oscA.level': 0.85,
      'oscB.on': 1, 'oscB.table': 0, 'oscB.pos': 0.66, 'oscB.oct': -1, 'oscB.level': 0.5,
      'sub.on': 1, 'sub.level': 0.55, 'sub.oct': -1,
      'filter.type': 1, 'filter.cutoff': 650, 'filter.res': 0.45, 'filter.drive': 0.5,
      'env1.a': 0.004, 'env1.d': 0.3, 'env1.s': 0.9, 'env1.r': 0.12,
      'lfo1.shape': 1, 'lfo1.rate': 5.5,
      'mat1.src': 1, 'mat1.dst': 1, 'mat1.amt': 0.7,
      'mat2.src': 1, 'mat2.dst': 3, 'mat2.amt': 0.4,
      'fx.drive.on': 1, 'fx.drive.amt': 0.55, 'fx.drive.mix': 0.2,
    
      'fx.eq.on': 1, 'fx.eq.low': -6, 'fx.eq.mid': -4.8, 'fx.eq.mfreq': 620, 'fx.eq.high': 6,
    },
  },

  {
    // Wide future-bass chord stab — 7-voice supersaw under a bloom layer.
    name: 'FUTURE CHORD',
    params: {
      'fx.ott.on': 1, 'fx.ott.depth': 0.3, 'fx.ott.time': 1.25, 'fx.ott.up': 0.75, 'fx.ott.down': 0.8,
      'fx.comp.on': 1, 'fx.comp.thr': -20, 'fx.comp.att': 0.03, 'fx.comp.rel': 0.18, 'fx.comp.ratio': 3,
      'oscA.table': 0, 'oscA.pos': 0.66, 'oscA.unison': 7, 'oscA.detune': 0.32, 'oscA.spread': 1, 'oscA.level': 0.72,
      'oscB.on': 1, 'oscB.table': 1, 'oscB.pos': 0.4, 'oscB.unison': 3, 'oscB.detune': 0.24, 'oscB.spread': 0.8, 'oscB.level': 0.4,
      'filter.type': 0, 'filter.cutoff': 8000, 'filter.res': 0.08, 'filter.env': 0.25, 'filter.key': 0.2,
      'env1.a': 0.02, 'env1.d': 0.5, 'env1.s': 0.85, 'env1.r': 0.6,
      'lfo1.shape': 0, 'lfo1.rate': 0.5,
      'mat1.src': 1, 'mat1.dst': 1, 'mat1.amt': 0.3,
      'mat2.src': 1, 'mat2.dst': 3, 'mat2.amt': 0.2,
      'fx.chorus.on': 1, 'fx.chorus.rate': 0.5, 'fx.chorus.mix': 0.5,
      'fx.reverb.on': 1, 'fx.reverb.size': 0.68, 'fx.reverb.mix': 0.42,
    
      'fx.eq.on': 1, 'fx.eq.low': 5.7, 'fx.eq.mid': 6, 'fx.eq.mfreq': 431, 'fx.eq.high': -6,
    },
  },

  {
    // Aggressive riddim screech — square-wave hook clamped by a fast LFO + drive.
    name: 'SCREECH LEAD',
    params: {
      'fx.ott.on': 1, 'fx.ott.depth': 0.24, 'fx.ott.time': 1.1, 'fx.ott.up': 0.5, 'fx.ott.down': 0.9,
      'fx.comp.on': 1, 'fx.comp.thr': -20, 'fx.comp.att': 0.02, 'fx.comp.rel': 0.12, 'fx.comp.ratio': 3,
      'oscA.table': 2, 'oscA.pos': 0.7, 'oscA.unison': 3, 'oscA.detune': 0.3, 'oscA.spread': 0.7, 'oscA.level': 0.78,
      'oscB.on': 1, 'oscB.table': 5, 'oscB.pos': 0.4, 'oscB.level': 0.4,
      'filter.type': 2, 'filter.cutoff': 1800, 'filter.res': 0.6, 'filter.drive': 0.4,
      'env1.a': 0.004, 'env1.d': 0.4, 'env1.s': 0.85, 'env1.r': 0.15,
      'master.mono': 1,
      'lfo1.shape': 3, 'lfo1.rate': 8,
      'mat1.src': 1, 'mat1.dst': 3, 'mat1.amt': 0.5,
      'mat2.src': 1, 'mat2.dst': 2, 'mat2.amt': 0.4,
      'mat3.src': 4, 'mat3.dst': 3, 'mat3.amt': 0.3,
      'fx.drive.on': 1, 'fx.drive.amt': 0.6, 'fx.drive.mix': 0.2,
      'fx.delay.on': 1, 'fx.delay.time': 0.25, 'fx.delay.fb': 0.3, 'fx.delay.mix': 0.18,

      'fx.eq.on': 1, 'fx.eq.low': 6, 'fx.eq.mid': 2.5, 'fx.eq.mfreq': 734, 'fx.eq.high': -6,
    },
  },

  {
    // Hardstyle "donk" stab: hollow pulse with a mod-env pitch blip on attack.
    name: 'DONK STAB',
    params: {
      'fx.ott.on': 1, 'fx.ott.depth': 0.28, 'fx.ott.time': 1.4, 'fx.ott.up': 0.65, 'fx.ott.down': 0.8,
      'fx.comp.on': 1, 'fx.comp.thr': -21, 'fx.comp.att': 0.025, 'fx.comp.rel': 0.095, 'fx.comp.ratio': 3.5,
      'oscA.table': 2, 'oscA.pos': 0.25, 'oscA.level': 0.85,
      'oscB.on': 1, 'oscB.table': 0, 'oscB.pos': 1, 'oscB.oct': 1, 'oscB.level': 0.28,
      'sub.on': 1, 'sub.level': 0.4,
      'filter.type': 0, 'filter.cutoff': 3500, 'filter.res': 0.3, 'filter.env': 0.5, 'filter.key': 0.3,
      'env1.a': 0.002, 'env1.d': 0.16, 'env1.s': 0, 'env1.r': 0.1,
      'env2.a': 0.002, 'env2.d': 0.05, 'env2.s': 0, 'env2.r': 0.05,
      'mat1.src': 3, 'mat1.dst': 4, 'mat1.amt': 0.25,
      'fx.drive.on': 1, 'fx.drive.amt': 0.3, 'fx.drive.mix': 0.2,
      'fx.reverb.on': 1, 'fx.reverb.size': 0.4, 'fx.reverb.mix': 0.2,
    
      'fx.eq.on': 1, 'fx.eq.low': 6, 'fx.eq.mid': 6, 'fx.eq.mfreq': 900, 'fx.eq.high': -6,
    },
  },

  {
    // Progressive-house pluck: snappy saw, key-tracked filter, ping-pong delay.
    name: 'HOUSE PLUCK',
    params: {
      'master.volume': 0.5365, // Match the original output after adding drive.
      'fx.ott.on': 1, 'fx.ott.depth': 0.2, 'fx.ott.time': 1.5, 'fx.ott.up': 0.5, 'fx.ott.down': 0.7,
      'fx.comp.on': 1, 'fx.comp.thr': -20, 'fx.comp.att': 0.03, 'fx.comp.rel': 0.1, 'fx.comp.ratio': 3,
      'fx.drive.on': 1, 'fx.drive.amt': 0.16, 'fx.drive.mix': 0.2, 'fx.drive.type': 1, 'fx.drive.tone': -0.18,
      'oscA.table': 0, 'oscA.pos': 0.66, 'oscA.oct': 1, 'oscA.unison': 3, 'oscA.detune': 0.18, 'oscA.spread': 0.6, 'oscA.level': 0.78,
      'oscB.on': 1, 'oscB.table': 2, 'oscB.pos': 0.3, 'oscB.oct': 1, 'oscB.semi': 12, 'oscB.level': 0.3,
      'filter.type': 1, 'filter.cutoff': 2200, 'filter.res': 0.2, 'filter.env': 0.55, 'filter.key': 0.5,
      'env1.a': 0.003, 'env1.d': 0.28, 'env1.s': 0, 'env1.r': 0.2,
      'env2.a': 0.003, 'env2.d': 0.18, 'env2.s': 0, 'env2.r': 0.15,
      'fx.chorus.on': 1, 'fx.chorus.mix': 0.3,
      'fx.delay.on': 1, 'fx.delay.time': 0.38, 'fx.delay.fb': 0.4, 'fx.delay.mix': 0.3,
      'fx.reverb.on': 1, 'fx.reverb.size': 0.5, 'fx.reverb.mix': 0.25,
    
      'fx.eq.on': 1, 'fx.eq.low': 4, 'fx.eq.mid': -5.8, 'fx.eq.mfreq': 504, 'fx.eq.high': 1.7,
    },
  },

  {
    // Bright trap bell melody: detuned chimes an octave apart, long tail, echo.
    name: 'TRAP BELL',
    params: {
      'oscA.table': 4, 'oscA.pos': 0.85, 'oscA.oct': 1, 'oscA.unison': 2, 'oscA.detune': 0.12, 'oscA.spread': 0.5, 'oscA.level': 0.8,
      'oscB.on': 1, 'oscB.table': 4, 'oscB.pos': 0.6, 'oscB.oct': 1, 'oscB.semi': 12, 'oscB.fine': 4, 'oscB.level': 0.32,
      'filter.type': 0, 'filter.cutoff': 7000, 'filter.res': 0.1, 'filter.key': 0.5,
      'env1.a': 0.001, 'env1.d': 0.9, 'env1.s': 0.1, 'env1.r': 0.8,
      'env2.a': 0.001, 'env2.d': 0.4, 'env2.s': 0, 'env2.r': 0.4,
      'mat1.src': 3, 'mat1.dst': 1, 'mat1.amt': -0.3,
      'fx.delay.on': 1, 'fx.delay.time': 0.3, 'fx.delay.fb': 0.45, 'fx.delay.mix': 0.32,
      'fx.reverb.on': 1, 'fx.reverb.size': 0.7, 'fx.reverb.mix': 0.4,
    
      'fx.eq.on': 1, 'fx.eq.low': 6, 'fx.eq.mid': 4.2, 'fx.eq.mfreq': 680, 'fx.eq.high': -6,
    },
  },

  {
    // Chiptune square lead: raw (filter off), PWM sweep + a touch of vibrato.
    name: '8-BIT LEAD',
    params: {
      'oscA.table': 2, 'oscA.pos': 0, 'oscA.level': 0.8,
      'filter.on': 0,
      'env1.a': 0.001, 'env1.d': 0.1, 'env1.s': 0.7, 'env1.r': 0.05,
      'master.mono': 1,
      'lfo1.shape': 0, 'lfo1.rate': 6,
      'mat1.src': 1, 'mat1.dst': 4, 'mat1.amt': 0.01,
      'mat2.src': 1, 'mat2.dst': 1, 'mat2.amt': 0.2,
      'fx.delay.on': 1, 'fx.delay.time': 0.25, 'fx.delay.fb': 0.25, 'fx.delay.mix': 0.2,

      'fx.eq.on': 1, 'fx.eq.low': 6, 'fx.eq.mid': 6, 'fx.eq.mfreq': 507, 'fx.eq.high': -6,
    },
  },

  {
    // Slow evolving atmosphere: dual LFOs crawl across cutoff, position and pan.
    name: 'DARK DRONE',
    params: {
      'oscA.table': 1, 'oscA.pos': 0.2, 'oscA.unison': 4, 'oscA.detune': 0.3, 'oscA.spread': 0.9, 'oscA.level': 0.7,
      'oscB.on': 1, 'oscB.table': 3, 'oscB.pos': 0.5, 'oscB.oct': -1, 'oscB.unison': 2, 'oscB.detune': 0.2, 'oscB.level': 0.45,
      'sub.on': 1, 'sub.level': 0.35, 'sub.oct': -2,
      'filter.type': 1, 'filter.cutoff': 300, 'filter.res': 0.15,
      'env1.a': 2.5, 'env1.d': 3, 'env1.s': 0.7, 'env1.r': 4,
      'lfo1.shape': 0, 'lfo1.rate': 0.08,
      'lfo2.shape': 0, 'lfo2.rate': 0.05,
      'mat1.src': 1, 'mat1.dst': 3, 'mat1.amt': 0.4,
      'mat2.src': 2, 'mat2.dst': 1, 'mat2.amt': 0.5,
      'mat3.src': 2, 'mat3.dst': 6, 'mat3.amt': 0.4,
      'fx.chorus.on': 1, 'fx.chorus.mix': 0.5,
      'fx.reverb.on': 1, 'fx.reverb.size': 0.9, 'fx.reverb.mix': 0.5,
    
      'fx.eq.on': 1, 'fx.eq.low': -6, 'fx.eq.mid': -4.1, 'fx.eq.mfreq': 361, 'fx.eq.high': 6,
    },
  },

  {
    // Classic dubstep wobble: square LFO throws the lowpass open and shut.
    name: 'WUB BASS',
    params: {
      'fx.ott.on': 1, 'fx.ott.depth': 0.34, 'fx.ott.time': 1, 'fx.ott.up': 0.85, 'fx.ott.down': 0.8,
      'fx.comp.on': 1, 'fx.comp.thr': -22, 'fx.comp.att': 0.02, 'fx.comp.rel': 0.13, 'fx.comp.ratio': 3.5,
      'oscA.table': 0, 'oscA.pos': 1, 'oscA.unison': 2, 'oscA.detune': 0.1, 'oscA.level': 0.8,
      'oscB.on': 1, 'oscB.table': 2, 'oscB.pos': 0.5, 'oscB.oct': -1, 'oscB.level': 0.5,
      'sub.on': 1, 'sub.level': 0.6, 'sub.oct': -1,
      'filter.type': 1, 'filter.cutoff': 400, 'filter.res': 0.55, 'filter.drive': 0.45,
      'env1.a': 0.004, 'env1.d': 0.3, 'env1.s': 0.95, 'env1.r': 0.12,
      'lfo1.shape': 0, 'lfo1.rate': 4,
      'mat1.src': 1, 'mat1.dst': 3, 'mat1.amt': 0.7,
      'fx.drive.on': 1, 'fx.drive.amt': 0.4, 'fx.drive.mix': 0.2,
    
      'fx.eq.on': 1, 'fx.eq.low': -0.4, 'fx.eq.mid': 5.7, 'fx.eq.mfreq': 493, 'fx.eq.high': -5.3,
    },
  },

  {
    // Portamento mono-style lead: glide between notes, squelchy resonant filter.
    name: 'GLIDE LEAD',
    params: {
      'oscA.table': 0, 'oscA.pos': 0.66, 'oscA.oct': 1, 'oscA.unison': 2, 'oscA.detune': 0.12, 'oscA.spread': 0.4, 'oscA.level': 0.82,
      'oscB.on': 1, 'oscB.table': 2, 'oscB.pos': 0.4, 'oscB.oct': 1, 'oscB.semi': -12, 'oscB.level': 0.4,
      'filter.type': 1, 'filter.cutoff': 1600, 'filter.res': 0.4, 'filter.env': 0.5, 'filter.key': 0.4,
      'env1.a': 0.005, 'env1.d': 0.5, 'env1.s': 0.6, 'env1.r': 0.25,
      'env2.a': 0.005, 'env2.d': 0.3, 'env2.s': 0.2, 'env2.r': 0.2,
      'master.glide': 0.12, 'master.mono': 1,
      'lfo1.shape': 0, 'lfo1.rate': 5,
      'mat1.src': 1, 'mat1.dst': 4, 'mat1.amt': 0.008,
      'fx.delay.on': 1, 'fx.delay.time': 0.3, 'fx.delay.fb': 0.35, 'fx.delay.mix': 0.25,
      'fx.reverb.on': 1, 'fx.reverb.size': 0.45, 'fx.reverb.mix': 0.22,

      'fx.eq.on': 1, 'fx.eq.low': 1.3, 'fx.eq.mid': -4.5, 'fx.eq.mfreq': 546, 'fx.eq.high': 3.2,
    },
  },

  // ---- Acoustic & classic keys ------------------------------------------

  {
    // Tine e-piano: near-sine body + a quiet CHIME "tine" layer an octave up.
    // Velocity opens the filter and brings the tine forward; slow pan tremolo.
    name: 'MELLOW RHODES',
    params: {
      'oscA.table': 0, 'oscA.pos': 0.08, 'oscA.level': 0.8,
      'oscB.on': 1, 'oscB.table': 4, 'oscB.pos': 0.12, 'oscB.oct': 1, 'oscB.level': 0.18,
      'filter.type': 0, 'filter.cutoff': 1200, 'filter.res': 0.1, 'filter.env': 0.45, 'filter.key': 0.4,
      'env1.a': 0.002, 'env1.d': 1.4, 'env1.s': 0.42, 'env1.r': 0.5,
      'env2.a': 0.001, 'env2.d': 0.35, 'env2.s': 0, 'env2.r': 0.3,
      'lfo1.rate': 0.9,
      'mat1.src': 4, 'mat1.dst': 3, 'mat1.amt': 0.4,
      'mat2.src': 4, 'mat2.dst': 8, 'mat2.amt': 0.35,
      'mat3.src': 1, 'mat3.dst': 6, 'mat3.amt': 0.3,
      'fx.chorus.on': 1, 'fx.chorus.mix': 0.35,
      'fx.reverb.on': 1, 'fx.reverb.size': 0.35, 'fx.reverb.mix': 0.25,
    
      'fx.eq.on': 1, 'fx.eq.low': -6, 'fx.eq.mid': -6, 'fx.eq.mfreq': 302, 'fx.eq.high': 6,
    },
  },

  {
    // Bright FM-style "Dyno" e-piano: sine body, glassy bell partials two
    // octaves up, deep chorus. Harder velocity = brighter and more bell.
    name: 'DYNO EPIANO',
    params: {
      'fx.ott.on': 1, 'fx.ott.depth': 0.14, 'fx.ott.time': 1.5, 'fx.ott.up': 0.45, 'fx.ott.down': 0.65,
      'fx.comp.on': 1, 'fx.comp.thr': -18, 'fx.comp.att': 0.03, 'fx.comp.rel': 0.14, 'fx.comp.ratio': 2.5,
      'oscA.table': 0, 'oscA.pos': 0.05, 'oscA.level': 0.75,
      'oscB.on': 1, 'oscB.table': 4, 'oscB.pos': 0.3, 'oscB.oct': 2, 'oscB.level': 0.15,
      'filter.type': 0, 'filter.cutoff': 2500, 'filter.res': 0.08, 'filter.env': 0.3, 'filter.key': 0.5,
      'env1.a': 0.001, 'env1.d': 1.8, 'env1.s': 0.3, 'env1.r': 0.6,
      'env2.a': 0.001, 'env2.d': 0.5, 'env2.s': 0, 'env2.r': 0.4,
      'mat1.src': 4, 'mat1.dst': 3, 'mat1.amt': 0.45,
      'mat2.src': 4, 'mat2.dst': 8, 'mat2.amt': 0.4,
      'fx.chorus.on': 1, 'fx.chorus.rate': 0.7, 'fx.chorus.mix': 0.5,
      'fx.reverb.on': 1, 'fx.reverb.size': 0.4, 'fx.reverb.mix': 0.24,
    
      'fx.eq.on': 1, 'fx.eq.low': 1.4, 'fx.eq.mid': 2.3, 'fx.eq.mfreq': 443, 'fx.eq.high': -3.7,
    },
  },

  {
    // Clean drawbar organ: sine 8' + 4' (osc B up an octave) + sine sub as the
    // 16' drawbar. Gated envelope, rotary-style vibrato + pan from LFO 1.
    name: 'DRAWBAR ORGAN',
    params: {
      'oscA.table': 0, 'oscA.pos': 0, 'oscA.level': 0.7,
      'oscB.on': 1, 'oscB.table': 0, 'oscB.pos': 0, 'oscB.oct': 1, 'oscB.level': 0.5,
      'sub.on': 1, 'sub.level': 0.6, 'sub.oct': -1,
      'filter.on': 0,
      'env1.a': 0.003, 'env1.d': 0.1, 'env1.s': 1, 'env1.r': 0.05,
      'lfo1.rate': 6.5,
      'mat1.src': 1, 'mat1.dst': 4, 'mat1.amt': 0.004,
      'mat2.src': 1, 'mat2.dst': 6, 'mat2.amt': 0.25,
      'fx.chorus.on': 1, 'fx.chorus.rate': 0.8, 'fx.chorus.mix': 0.4,
      'fx.reverb.on': 1, 'fx.reverb.size': 0.35, 'fx.reverb.mix': 0.18,
    
      'fx.eq.on': 1, 'fx.eq.low': -6, 'fx.eq.mid': -6, 'fx.eq.mfreq': 309, 'fx.eq.high': 6,
    },
  },

  {
    // Overdriven rock organ: square stack through drive with a faster
    // Leslie-style wobble panning the whole thing.
    name: 'ROCK ORGAN',
    params: {
      'fx.ott.on': 1, 'fx.ott.depth': 0.2, 'fx.ott.time': 1.2, 'fx.ott.up': 0.6, 'fx.ott.down': 0.8,
      'fx.comp.on': 1, 'fx.comp.thr': -20, 'fx.comp.att': 0.02, 'fx.comp.rel': 0.15, 'fx.comp.ratio': 3,
      'oscA.table': 2, 'oscA.pos': 0, 'oscA.unison': 2, 'oscA.detune': 0.08, 'oscA.level': 0.75,
      'oscB.on': 1, 'oscB.table': 0, 'oscB.pos': 0, 'oscB.oct': 1, 'oscB.level': 0.45,
      'sub.on': 1, 'sub.level': 0.5, 'sub.oct': -1,
      'filter.type': 1, 'filter.cutoff': 5000, 'filter.res': 0.1,
      'env1.a': 0.002, 'env1.d': 0.1, 'env1.s': 1, 'env1.r': 0.06,
      'lfo1.rate': 5.5,
      'mat1.src': 1, 'mat1.dst': 4, 'mat1.amt': 0.005,
      'mat2.src': 1, 'mat2.dst': 6, 'mat2.amt': 0.35,
      'fx.drive.on': 1, 'fx.drive.amt': 0.5, 'fx.drive.mix': 0.2,
      'fx.chorus.on': 1, 'fx.chorus.rate': 1.2, 'fx.chorus.mix': 0.45,
    
      'fx.eq.on': 1, 'fx.eq.low': -3.4, 'fx.eq.mid': 3.4, 'fx.eq.mfreq': 410, 'fx.eq.high': 0,
    },
  },

  {
    // Classic analog string machine: wide detuned saws, slow bow-in, heavy
    // chorus. LFO 1 drifts the table position for ensemble motion.
    name: 'ANALOG STRINGS',
    params: {
      'oscA.table': 0, 'oscA.pos': 0.62, 'oscA.unison': 7, 'oscA.detune': 0.3, 'oscA.spread': 1, 'oscA.level': 0.65,
      'oscB.on': 1, 'oscB.table': 0, 'oscB.pos': 0.66, 'oscB.oct': 1, 'oscB.unison': 3, 'oscB.detune': 0.22, 'oscB.spread': 0.8, 'oscB.level': 0.3,
      'filter.type': 0, 'filter.cutoff': 2800, 'filter.res': 0.08, 'filter.key': 0.2,
      'env1.a': 0.5, 'env1.d': 1, 'env1.s': 0.85, 'env1.r': 1.2,
      'lfo1.rate': 0.25, 'lfo2.rate': 0.11,
      'mat1.src': 1, 'mat1.dst': 1, 'mat1.amt': 0.12,
      'mat2.src': 2, 'mat2.dst': 6, 'mat2.amt': 0.2,
      'fx.chorus.on': 1, 'fx.chorus.rate': 0.5, 'fx.chorus.mix': 0.55,
      'fx.reverb.on': 1, 'fx.reverb.size': 0.7, 'fx.reverb.mix': 0.35,
    
      'fx.eq.on': 1, 'fx.eq.low': 2.6, 'fx.eq.mid': 2.9, 'fx.eq.mfreq': 467, 'fx.eq.high': -5.5,
    },
  },

  {
    // Dark cinematic ensemble: BLOOM stack over a low saw, mod env slowly
    // blooms the table open while the section swells in a big hall.
    name: 'CINEMA STRINGS',
    params: {
      'oscA.table': 1, 'oscA.pos': 0.45, 'oscA.unison': 5, 'oscA.detune': 0.25, 'oscA.spread': 0.9, 'oscA.level': 0.68,
      'oscB.on': 1, 'oscB.table': 0, 'oscB.pos': 0.6, 'oscB.oct': -1, 'oscB.level': 0.4,
      'filter.type': 0, 'filter.cutoff': 1500, 'filter.res': 0.1, 'filter.env': 0.3, 'filter.key': 0.2,
      'env1.a': 1.2, 'env1.d': 2, 'env1.s': 0.75, 'env1.r': 2.5,
      'env2.a': 2.5, 'env2.d': 3, 'env2.s': 0.4, 'env2.r': 2,
      'mat1.src': 3, 'mat1.dst': 1, 'mat1.amt': 0.3,
      'fx.chorus.on': 1, 'fx.chorus.mix': 0.4,
      'fx.reverb.on': 1, 'fx.reverb.size': 0.85, 'fx.reverb.mix': 0.45,
    
      'fx.eq.on': 1, 'fx.eq.low': -0.6, 'fx.eq.mid': 1.2, 'fx.eq.mfreq': 392, 'fx.eq.high': -0.6,
    },
  },

  {
    // Punchy brass section: tight detuned saws, the filter "blats" open on a
    // slightly-lagged mod env, subtle vibrato, a touch of drive.
    name: 'BRASS SECTION',
    params: {
      'fx.ott.on': 1, 'fx.ott.depth': 0.18, 'fx.ott.time': 1.3, 'fx.ott.up': 0.5, 'fx.ott.down': 0.7,
      'fx.comp.on': 1, 'fx.comp.thr': -18, 'fx.comp.att': 0.03, 'fx.comp.rel': 0.14, 'fx.comp.ratio': 2.5,
      'oscA.table': 0, 'oscA.pos': 0.66, 'oscA.unison': 3, 'oscA.detune': 0.15, 'oscA.spread': 0.5, 'oscA.level': 0.8,
      'oscB.on': 1, 'oscB.table': 0, 'oscB.pos': 0.66, 'oscB.fine': 8, 'oscB.level': 0.5,
      'sub.on': 1, 'sub.level': 0.3,
      'filter.type': 0, 'filter.cutoff': 900, 'filter.res': 0.15, 'filter.env': 0.7, 'filter.key': 0.3,
      'env1.a': 0.03, 'env1.d': 0.3, 'env1.s': 0.85, 'env1.r': 0.2,
      'env2.a': 0.06, 'env2.d': 0.35, 'env2.s': 0.55, 'env2.r': 0.2,
      'lfo1.rate': 5,
      'mat1.src': 4, 'mat1.dst': 3, 'mat1.amt': 0.3,
      'mat2.src': 1, 'mat2.dst': 4, 'mat2.amt': 0.003,
      'fx.drive.on': 1, 'fx.drive.amt': 0.25, 'fx.drive.mix': 0.2,
      'fx.reverb.on': 1, 'fx.reverb.size': 0.4, 'fx.reverb.mix': 0.22,
    
      'fx.eq.on': 1, 'fx.eq.low': 5.7, 'fx.eq.mid': 6, 'fx.eq.mfreq': 547, 'fx.eq.high': -6,
    },
  },

  {
    // Soft 80s synth brass: wide saws over a low pulse, slower filter swell,
    // chorused into a warm pad-adjacent brass bed.
    name: 'SOFT BRASS',
    params: {
      'oscA.table': 0, 'oscA.pos': 0.66, 'oscA.unison': 5, 'oscA.detune': 0.28, 'oscA.spread': 0.9, 'oscA.level': 0.7,
      'oscB.on': 1, 'oscB.table': 2, 'oscB.pos': 0.15, 'oscB.oct': -1, 'oscB.level': 0.45,
      'filter.type': 0, 'filter.cutoff': 1200, 'filter.res': 0.1, 'filter.env': 0.5, 'filter.key': 0.25,
      'env1.a': 0.12, 'env1.d': 0.6, 'env1.s': 0.8, 'env1.r': 0.8,
      'env2.a': 1.5, 'env2.d': 0.8, 'env2.s': 0.4, 'env2.r': 0.6,
      'fx.chorus.on': 1, 'fx.chorus.mix': 0.45,
      'fx.reverb.on': 1, 'fx.reverb.size': 0.55, 'fx.reverb.mix': 0.3,
    
      'fx.eq.on': 1, 'fx.eq.low': 1.2, 'fx.eq.mid': 2, 'fx.eq.mfreq': 443, 'fx.eq.high': -3.2,
    },
  },

  {
    // Rounded nylon-string pluck: tri-saw body with an octave sine, velocity
    // brightness and a mod-env flick of table position on the attack.
    name: 'NYLON PLUCK',
    params: {
      'oscA.table': 0, 'oscA.pos': 0.3, 'oscA.level': 0.8,
      'oscB.on': 1, 'oscB.table': 0, 'oscB.pos': 0.05, 'oscB.oct': 1, 'oscB.level': 0.25,
      'filter.type': 0, 'filter.cutoff': 1800, 'filter.res': 0.12, 'filter.env': 0.5, 'filter.key': 0.6,
      'env1.a': 0.001, 'env1.d': 0.7, 'env1.s': 0, 'env1.r': 0.35,
      'env2.a': 0.001, 'env2.d': 0.25, 'env2.s': 0, 'env2.r': 0.2,
      'mat1.src': 4, 'mat1.dst': 3, 'mat1.amt': 0.35,
      'mat2.src': 3, 'mat2.dst': 1, 'mat2.amt': 0.25,
      'fx.delay.on': 1, 'fx.delay.time': 0.32, 'fx.delay.fb': 0.28, 'fx.delay.mix': 0.18,
      'fx.reverb.on': 1, 'fx.reverb.size': 0.45, 'fx.reverb.mix': 0.25,
    
      'fx.eq.on': 1, 'fx.eq.low': -5.6, 'fx.eq.mid': -2.5, 'fx.eq.mfreq': 276, 'fx.eq.high': 6,
    },
  },

  {
    // Kalimba-style thumb pluck: sparse CHIME partials with a short strike
    // that flicks the table bright then settles, echoing gently.
    name: 'KALIMBA PLUCK',
    params: {
      'oscA.table': 4, 'oscA.pos': 0.15, 'oscA.level': 0.85,
      'oscB.on': 1, 'oscB.table': 0, 'oscB.pos': 0, 'oscB.oct': 1, 'oscB.level': 0.2,
      'filter.type': 0, 'filter.cutoff': 2600, 'filter.res': 0.1, 'filter.env': 0.4, 'filter.key': 0.7,
      'env1.a': 0.001, 'env1.d': 0.45, 'env1.s': 0, 'env1.r': 0.4,
      'env2.a': 0.001, 'env2.d': 0.12, 'env2.s': 0, 'env2.r': 0.1,
      'mat1.src': 3, 'mat1.dst': 1, 'mat1.amt': 0.35,
      'mat2.src': 4, 'mat2.dst': 3, 'mat2.amt': 0.3,
      'fx.delay.on': 1, 'fx.delay.time': 0.28, 'fx.delay.fb': 0.3, 'fx.delay.mix': 0.22,
      'fx.reverb.on': 1, 'fx.reverb.size': 0.5, 'fx.reverb.mix': 0.28,
    
      'fx.eq.on': 1, 'fx.eq.low': -6, 'fx.eq.mid': -6, 'fx.eq.mfreq': 277, 'fx.eq.high': 6,
    },
  },

  {
    // Concert harp: warm triangle-ish string with a faint chime sparkle, long
    // natural decay into a wide hall — glissando-ready.
    name: 'CELTIC HARP',
    params: {
      'oscA.table': 0, 'oscA.pos': 0.22, 'oscA.unison': 2, 'oscA.detune': 0.06, 'oscA.spread': 0.4, 'oscA.level': 0.8,
      'oscB.on': 1, 'oscB.table': 4, 'oscB.pos': 0.08, 'oscB.oct': 1, 'oscB.level': 0.15,
      'filter.type': 0, 'filter.cutoff': 2200, 'filter.res': 0.1, 'filter.env': 0.45, 'filter.key': 0.65,
      'env1.a': 0.001, 'env1.d': 1.3, 'env1.s': 0, 'env1.r': 1.1,
      'env2.a': 0.001, 'env2.d': 0.3, 'env2.s': 0, 'env2.r': 0.25,
      'mat1.src': 4, 'mat1.dst': 3, 'mat1.amt': 0.35,
      'mat2.src': 3, 'mat2.dst': 1, 'mat2.amt': 0.2,
      'fx.delay.on': 1, 'fx.delay.time': 0.36, 'fx.delay.fb': 0.3, 'fx.delay.mix': 0.15,
      'fx.reverb.on': 1, 'fx.reverb.size': 0.75, 'fx.reverb.mix': 0.38,
    
      'fx.eq.on': 1, 'fx.eq.low': -6, 'fx.eq.mid': -0.6, 'fx.eq.mfreq': 273, 'fx.eq.high': 6,
    },
  },

  // ---- Engine showcase / sound design ------------------------------------
  // Each of these leans on a feature no other factory patch touches: the COMB
  // and VOWEL filter types, SPLIT dual-filter routing, the noise oscillator,
  // S&H LFOs, LFO rise, and beat-synced LFOs.

  {
    // Karplus-Strong-style plucked string: a white-noise burst excites the
    // tuned COMB filter, whose delay pitch tracks the keyboard (key = 1).
    name: 'HARPSI COMB',
    params: {
      'oscA.table': 0, 'oscA.pos': 0, 'oscA.level': 0.45,
      'noise.on': 1, 'noise.level': 0.85,
      'filter.type': 5, 'filter.cutoff': 262, 'filter.res': 0.88, 'filter.key': 1,
      'env1.a': 0.001, 'env1.d': 1.1, 'env1.s': 0, 'env1.r': 0.9,
      'fx.delay.on': 1, 'fx.delay.time': 0.34, 'fx.delay.fb': 0.3, 'fx.delay.mix': 0.2,
      'fx.reverb.on': 1, 'fx.reverb.size': 0.5, 'fx.reverb.mix': 0.28,
    
      'fx.eq.on': 1, 'fx.eq.low': 6, 'fx.eq.mid': 6, 'fx.eq.mfreq': 1165, 'fx.eq.high': -6,
    },
  },

  {
    // Whispered vowel-filter choir: BLOOM stack sung through the VOWEL filter,
    // LFO 1 slowly mouthing A-E-I-O-U while LFO 2 drifts the stereo image.
    name: 'GHOST CHOIR',
    params: {
      'oscA.table': 1, 'oscA.pos': 0.5, 'oscA.unison': 5, 'oscA.detune': 0.22, 'oscA.spread': 0.9, 'oscA.level': 0.9,
      'oscB.on': 1, 'oscB.table': 3, 'oscB.pos': 0.35, 'oscB.fine': -7, 'oscB.level': 0.5,
      'filter.type': 6, 'filter.cutoff': 700, 'filter.res': 0.4,
      'env1.a': 1.4, 'env1.d': 2, 'env1.s': 0.8, 'env1.r': 2.4,
      'lfo1.rate': 0.09, 'lfo2.rate': 0.13,
      'mat1.src': 1, 'mat1.dst': 3, 'mat1.amt': 0.35,
      'mat2.src': 2, 'mat2.dst': 6, 'mat2.amt': 0.25,
      'fx.chorus.on': 1, 'fx.chorus.mix': 0.45,
      'fx.reverb.on': 1, 'fx.reverb.size': 0.85, 'fx.reverb.mix': 0.45,
    
      'fx.eq.on': 1, 'fx.eq.low': 6, 'fx.eq.mid': -3, 'fx.eq.mfreq': 582, 'fx.eq.high': -6,
    },
  },

  {
    // Sci-fi computer chatter: a fast S&H LFO randomly re-dials timbre, filter
    // and pan every step so held notes burble like a telemetry feed.
    name: 'DATA STREAM',
    params: {
      'fx.ott.on': 1, 'fx.ott.depth': 0.24, 'fx.ott.time': 1.1, 'fx.ott.up': 0.7, 'fx.ott.down': 0.7,
      'fx.comp.on': 1, 'fx.comp.thr': -20, 'fx.comp.att': 0.018, 'fx.comp.rel': 0.09, 'fx.comp.ratio': 3,
      'oscA.table': 5, 'oscA.pos': 0.55, 'oscA.level': 0.8,
      'filter.type': 1, 'filter.cutoff': 1400, 'filter.res': 0.5,
      'env1.a': 0.002, 'env1.d': 0.2, 'env1.s': 0.8, 'env1.r': 0.08,
      'lfo1.shape': 4, 'lfo1.rate': 9,
      'mat1.src': 1, 'mat1.dst': 3, 'mat1.amt': 0.55,
      'mat2.src': 1, 'mat2.dst': 1, 'mat2.amt': 0.6,
      'mat3.src': 1, 'mat3.dst': 6, 'mat3.amt': 0.5,
      'fx.delay.on': 1, 'fx.delay.time': 0.22, 'fx.delay.fb': 0.4, 'fx.delay.mix': 0.28,
    
      'fx.eq.on': 1, 'fx.eq.low': 1.9, 'fx.eq.mid': 4.5, 'fx.eq.mfreq': 356, 'fx.eq.high': -6,
    },
  },

  {
    // Breathing shoreline pad: pink noise swells against a soft BLOOM bed as
    // one slow LFO pushes the surf in and out and another rolls the pan.
    name: 'OCEAN AIR',
    params: {
      'oscA.table': 1, 'oscA.pos': 0.25, 'oscA.unison': 4, 'oscA.detune': 0.25, 'oscA.spread': 0.9, 'oscA.level': 0.6,
      'noise.on': 1, 'noise.type': 1, 'noise.level': 0.35,
      'filter.type': 0, 'filter.cutoff': 1900, 'filter.res': 0.1,
      'env1.a': 1.8, 'env1.d': 2.5, 'env1.s': 0.8, 'env1.r': 3,
      'lfo1.rate': 0.07, 'lfo2.rate': 0.05,
      'mat1.src': 1, 'mat1.dst': 25, 'mat1.amt': 0.3,
      'mat2.src': 1, 'mat2.dst': 3, 'mat2.amt': 0.3,
      'mat3.src': 2, 'mat3.dst': 6, 'mat3.amt': 0.3,
      'fx.chorus.on': 1, 'fx.chorus.mix': 0.4,
      'fx.reverb.on': 1, 'fx.reverb.size': 0.9, 'fx.reverb.mix': 0.5,
    
      'fx.eq.on': 1, 'fx.eq.low': 3.5, 'fx.eq.mid': 4.9, 'fx.eq.mfreq': 450, 'fx.eq.high': -6,
    },
  },

  {
    // SPLIT-routed pad: osc A saws feed a lowpass, osc B (an octave up) feeds
    // a highpass, and two LFOs counter-sweep the halves past each other.
    name: 'TWIN SKY',
    params: {
      'oscA.table': 0, 'oscA.pos': 0.62, 'oscA.unison': 6, 'oscA.detune': 0.28, 'oscA.spread': 1, 'oscA.level': 0.65,
      'oscB.on': 1, 'oscB.table': 0, 'oscB.pos': 0.66, 'oscB.oct': 1, 'oscB.unison': 3, 'oscB.detune': 0.2, 'oscB.spread': 0.8, 'oscB.level': 0.4,
      'filter.route': 2, 'filter.type': 0, 'filter.cutoff': 900, 'filter.res': 0.2,
      'filter2.on': 1, 'filter2.type': 3, 'filter2.cutoff': 2500, 'filter2.res': 0.25,
      'env1.a': 0.8, 'env1.d': 1.5, 'env1.s': 0.85, 'env1.r': 1.8,
      'lfo1.rate': 0.15, 'lfo2.rate': 0.11,
      'mat1.src': 1, 'mat1.dst': 3, 'mat1.amt': 0.4,
      'mat2.src': 2, 'mat2.dst': 9, 'mat2.amt': -0.4,
      'fx.chorus.on': 1, 'fx.chorus.mix': 0.5,
      'fx.reverb.on': 1, 'fx.reverb.size': 0.7, 'fx.reverb.mix': 0.35,
    
      'fx.eq.on': 1, 'fx.eq.low': 5.7, 'fx.eq.mid': 6, 'fx.eq.mfreq': 507, 'fx.eq.high': -6,
    },
  },

  {
    // Worn-cassette keys: soft sine-triangle body, a hint of bitcrush and tape
    // hiss, and an S&H LFO smearing pitch like a warped capstan.
    name: 'TAPE KEYS',
    params: {
      'oscA.table': 0, 'oscA.pos': 0.12, 'oscA.level': 0.8,
      'oscB.on': 1, 'oscB.table': 5, 'oscB.pos': 0.15, 'oscB.level': 0.15,
      'noise.on': 1, 'noise.type': 1, 'noise.level': 0.08,
      'filter.type': 0, 'filter.cutoff': 1500, 'filter.res': 0.12, 'filter.env': 0.3, 'filter.key': 0.35,
      'env1.a': 0.002, 'env1.d': 1.2, 'env1.s': 0.35, 'env1.r': 0.5,
      'env2.a': 0.001, 'env2.d': 0.3, 'env2.s': 0, 'env2.r': 0.25,
      'lfo1.shape': 4, 'lfo1.rate': 3.2,
      'mat1.src': 1, 'mat1.dst': 4, 'mat1.amt': 0.006,
      'mat2.src': 4, 'mat2.dst': 3, 'mat2.amt': 0.35,
      'fx.chorus.on': 1, 'fx.chorus.mix': 0.4,
      'fx.reverb.on': 1, 'fx.reverb.size': 0.4, 'fx.reverb.mix': 0.28,
    
      'fx.eq.on': 1, 'fx.eq.low': -6, 'fx.eq.mid': -4.8, 'fx.eq.mfreq': 264, 'fx.eq.high': 6,
    },
  },

  {
    // Talkbox bass: saw + square sub pushed through the VOWEL filter; the mod
    // env spits a formant on each attack while a triangle LFO keeps it chewing.
    name: 'TALKBOX BASS',
    params: {
      'fx.ott.on': 1, 'fx.ott.depth': 0.34, 'fx.ott.time': 1, 'fx.ott.up': 0.85, 'fx.ott.down': 0.8,
      'fx.comp.on': 1, 'fx.comp.thr': -22, 'fx.comp.att': 0.02, 'fx.comp.rel': 0.13, 'fx.comp.ratio': 3,
      'oscA.table': 0, 'oscA.pos': 0.66, 'oscA.level': 1,
      'sub.on': 1, 'sub.shape': 1, 'sub.level': 0.65, 'sub.oct': -1,
      'filter.type': 6, 'filter.cutoff': 500, 'filter.res': 0.45,
      'env1.a': 0.003, 'env1.d': 0.3, 'env1.s': 0.9, 'env1.r': 0.12,
      'env2.a': 0.005, 'env2.d': 0.28, 'env2.s': 0, 'env2.r': 0.15,
      'lfo1.shape': 1, 'lfo1.rate': 4.5,
      'mat1.src': 3, 'mat1.dst': 3, 'mat1.amt': 0.5,
      'mat2.src': 1, 'mat2.dst': 3, 'mat2.amt': 0.25,
      'fx.drive.on': 1, 'fx.drive.amt': 0.4, 'fx.drive.mix': 0.2,
    
      'fx.eq.on': 1, 'fx.eq.low': 6, 'fx.eq.mid': 0.2, 'fx.eq.mfreq': 577, 'fx.eq.high': -6,
    },
  },

  {
    // Slow-motion riser pad: the mod env spends seconds blooming the table and
    // filter open while a delayed-vibrato LFO (rise) fades in on top.
    name: 'AURORA RISER',
    params: {
      'oscA.table': 1, 'oscA.pos': 0.3, 'oscA.unison': 6, 'oscA.detune': 0.3, 'oscA.spread': 1, 'oscA.level': 0.65,
      'oscB.on': 1, 'oscB.table': 0, 'oscB.pos': 0, 'oscB.oct': 1, 'oscB.fine': 8, 'oscB.level': 0.3,
      'filter.type': 0, 'filter.cutoff': 1000, 'filter.res': 0.12,
      'env1.a': 2.5, 'env1.d': 3, 'env1.s': 1, 'env1.r': 3.5,
      'env2.a': 4, 'env2.d': 5, 'env2.s': 1, 'env2.r': 3,
      'lfo1.rate': 5.5, 'lfo1.rise': 3.5,
      'mat1.src': 3, 'mat1.dst': 1, 'mat1.amt': 0.6,
      'mat2.src': 3, 'mat2.dst': 3, 'mat2.amt': 0.5,
      'mat3.src': 1, 'mat3.dst': 4, 'mat3.amt': 0.006,
      'fx.chorus.on': 1, 'fx.chorus.mix': 0.45,
      'fx.reverb.on': 1, 'fx.reverb.size': 0.9, 'fx.reverb.mix': 0.5,
    
      'fx.eq.on': 1, 'fx.eq.low': -1.5, 'fx.eq.mid': -0.5, 'fx.eq.mfreq': 372, 'fx.eq.high': 2,
    },
  },

  {
    // Gamelan pot gong: two CHIME layers a fourth apart beat inharmonically
    // through a bandpass; the strike settles as the mod env pulls B's table back.
    name: 'GAMELAN POT',
    params: {
      'oscA.table': 4, 'oscA.pos': 0.65, 'oscA.level': 1,
      'oscB.on': 1, 'oscB.table': 4, 'oscB.pos': 0.4, 'oscB.semi': 5, 'oscB.fine': -12, 'oscB.level': 0.45,
      'filter.type': 2, 'filter.cutoff': 1500, 'filter.res': 0.3, 'filter.key': 0.6,
      'env1.a': 0.001, 'env1.d': 1.6, 'env1.s': 0, 'env1.r': 1.4,
      'env2.a': 0.001, 'env2.d': 0.5, 'env2.s': 0, 'env2.r': 0.4,
      'mat1.src': 3, 'mat1.dst': 2, 'mat1.amt': -0.4,
      'mat2.src': 4, 'mat2.dst': 3, 'mat2.amt': 0.3,
      'fx.delay.on': 1, 'fx.delay.time': 0.45, 'fx.delay.fb': 0.35, 'fx.delay.mix': 0.22,
      'fx.reverb.on': 1, 'fx.reverb.size': 0.65, 'fx.reverb.mix': 0.32,
    
      'fx.eq.on': 1, 'fx.eq.low': 6, 'fx.eq.mid': 5.9, 'fx.eq.mfreq': 1183, 'fx.eq.high': -6,
    },
  },

  {
    // Sidechain-feel pad: a beat-synced saw LFO (free-running, locked to the
    // transport downbeat) ducks the amp every quarter note and lets it swell back.
    name: 'PUMP PAD',
    params: {
      'oscA.table': 0, 'oscA.pos': 0.66, 'oscA.unison': 7, 'oscA.detune': 0.35, 'oscA.spread': 1, 'oscA.level': 0.7,
      'oscB.on': 1, 'oscB.table': 2, 'oscB.pos': 0.2, 'oscB.oct': -1, 'oscB.level': 0.4,
      'filter.type': 0, 'filter.cutoff': 3000, 'filter.res': 0.1,
      'env1.a': 0.05, 'env1.d': 0.5, 'env1.s': 0.9, 'env1.r': 0.4,
      'lfo1.shape': 2, 'lfo1.sync': 1, 'lfo1.syncrate': 2, 'lfo1.retrig': 0,
      'mat1.src': 1, 'mat1.dst': 5, 'mat1.amt': -1,
      'fx.chorus.on': 1, 'fx.chorus.mix': 0.4,
      'fx.reverb.on': 1, 'fx.reverb.size': 0.5, 'fx.reverb.mix': 0.3,
    
      'fx.eq.on': 1, 'fx.eq.low': 3.3, 'fx.eq.mid': 3.5, 'fx.eq.mfreq': 475, 'fx.eq.high': -6,
    },
  },

  // ---- Hall of fame: classic synth homages --------------------------------

  {
    // Minimoog-style solo lead: two close saws over an octave-down third osc,
    // fat 24 dB lowpass with a little drive, short glide and hand vibrato.
    name: 'MINI LEAD',
    params: {
      'fx.ott.on': 1, 'fx.ott.depth': 0.18, 'fx.ott.time': 1.2, 'fx.ott.up': 0.5, 'fx.ott.down': 0.7,
      'fx.comp.on': 1, 'fx.comp.thr': -18, 'fx.comp.att': 0.025, 'fx.comp.rel': 0.12, 'fx.comp.ratio': 2.5,
      'oscA.table': 0, 'oscA.pos': 0.66, 'oscA.unison': 2, 'oscA.detune': 0.12, 'oscA.spread': 0.2, 'oscA.level': 0.85,
      'oscB.on': 1, 'oscB.table': 0, 'oscB.pos': 0.66, 'oscB.oct': -1, 'oscB.fine': 6, 'oscB.level': 0.5,
      'filter.type': 1, 'filter.cutoff': 1300, 'filter.res': 0.3, 'filter.env': 0.55, 'filter.key': 0.35, 'filter.drive': 0.2,
      'env1.a': 0.004, 'env1.d': 0.35, 'env1.s': 0.75, 'env1.r': 0.15,
      'env2.a': 0.002, 'env2.d': 0.4, 'env2.s': 0.3, 'env2.r': 0.2,
      'master.glide': 0.05, 'master.mono': 1,
      'lfo1.rate': 5.2,
      'mat1.src': 1, 'mat1.dst': 4, 'mat1.amt': 0.005,
      'fx.drive.on': 1, 'fx.drive.amt': 0.3, 'fx.drive.mix': 0.2,
      'fx.delay.on': 1, 'fx.delay.time': 0.28, 'fx.delay.fb': 0.25, 'fx.delay.mix': 0.15,

      'fx.eq.on': 1, 'fx.eq.low': -3.9, 'fx.eq.mid': -3.9, 'fx.eq.mfreq': 430, 'fx.eq.high': 6,
    },
  },

  {
    // Juno-style PWM dream pad: pulse-width motion from a slow LFO and thick
    // ensemble chorus, kept sub-free so the pad stays open rather than muddy.
    name: 'JUNO DREAM',
    params: {
      'oscA.table': 2, 'oscA.pos': 0.35, 'oscA.unison': 3, 'oscA.detune': 0.15, 'oscA.spread': 0.7, 'oscA.level': 0.75,
      'filter.type': 1, 'filter.cutoff': 2000, 'filter.res': 0.12, 'filter.env': 0.25, 'filter.key': 0.25,
      'env1.a': 0.4, 'env1.d': 1, 'env1.s': 0.8, 'env1.r': 1.4,
      'lfo1.rate': 0.4, 'lfo2.rate': 0.17,
      'mat1.src': 1, 'mat1.dst': 1, 'mat1.amt': 0.3,
      'mat2.src': 2, 'mat2.dst': 6, 'mat2.amt': 0.2,
      'fx.chorus.on': 1, 'fx.chorus.rate': 0.5, 'fx.chorus.mix': 0.6,
      'fx.reverb.on': 1, 'fx.reverb.size': 0.6, 'fx.reverb.mix': 0.3,
    
      'fx.eq.on': 1, 'fx.eq.low': -6, 'fx.eq.mid': -1, 'fx.eq.mfreq': 448, 'fx.eq.high': 6,
    },
  },

  {
    // OB-style "Jump" brass: bright saw + wide pulse hitting an almost-open
    // filter with just a kiss of envelope — instant arena stab.
    name: 'JUMP BRASS',
    params: {
      'master.volume': 0.5033, // Match the original output after adding drive.
      'fx.ott.on': 1, 'fx.ott.depth': 0.22, 'fx.ott.time': 1.4, 'fx.ott.up': 0.6, 'fx.ott.down': 0.75,
      'fx.comp.on': 1, 'fx.comp.thr': -20, 'fx.comp.att': 0.03, 'fx.comp.rel': 0.12, 'fx.comp.ratio': 3,
      'fx.drive.on': 1, 'fx.drive.amt': 0.18, 'fx.drive.mix': 0.2, 'fx.drive.type': 1, 'fx.drive.tone': -0.18,
      'oscA.table': 0, 'oscA.pos': 0.66, 'oscA.unison': 2, 'oscA.detune': 0.18, 'oscA.spread': 0.6, 'oscA.level': 0.8,
      'oscB.on': 1, 'oscB.table': 2, 'oscB.pos': 0.1, 'oscB.fine': -7, 'oscB.level': 0.6,
      'filter.type': 0, 'filter.cutoff': 4500, 'filter.res': 0.08, 'filter.env': 0.15, 'filter.key': 0.3,
      'env1.a': 0.005, 'env1.d': 0.4, 'env1.s': 0.9, 'env1.r': 0.3,
      'env2.a': 0.003, 'env2.d': 0.25, 'env2.s': 0.4, 'env2.r': 0.25,
      'fx.chorus.on': 1, 'fx.chorus.mix': 0.35,
      'fx.reverb.on': 1, 'fx.reverb.size': 0.5, 'fx.reverb.mix': 0.28,
    
      'fx.eq.on': 1, 'fx.eq.low': 4.6, 'fx.eq.mid': 5.7, 'fx.eq.mfreq': 553, 'fx.eq.high': -6,
    },
  },

  {
    // CS-80 film-score brass: slow filter swell, ribbon-style glide and the
    // signature delayed vibrato (LFO rise), soaked in hall reverb.
    name: 'BLADE BRASS',
    params: {
      'oscA.table': 0, 'oscA.pos': 0.66, 'oscA.unison': 2, 'oscA.detune': 0.1, 'oscA.spread': 0.4, 'oscA.level': 0.8,
      'oscB.on': 1, 'oscB.table': 2, 'oscB.pos': 0.25, 'oscB.fine': 9, 'oscB.level': 0.5,
      'filter.type': 0, 'filter.cutoff': 900, 'filter.res': 0.2, 'filter.env': 0.6, 'filter.key': 0.3,
      'env1.a': 0.15, 'env1.d': 0.8, 'env1.s': 0.85, 'env1.r': 1.6,
      'env2.a': 0.25, 'env2.d': 1.2, 'env2.s': 0.6, 'env2.r': 1,
      'master.glide': 0.09,
      'lfo1.rate': 4.2, 'lfo1.rise': 1.2,
      'mat1.src': 1, 'mat1.dst': 4, 'mat1.amt': 0.006,
      'fx.chorus.on': 1, 'fx.chorus.mix': 0.3,
      'fx.reverb.on': 1, 'fx.reverb.size': 0.8, 'fx.reverb.mix': 0.42,
    
      'fx.eq.on': 1, 'fx.eq.low': 3.6, 'fx.eq.mid': 2.8, 'fx.eq.mfreq': 499, 'fx.eq.high': -6,
    },
  },

  {
    // D-50-style fantasy patch: a bell strike (mod env lifts osc A) rings out
    // and hands over to a breathy vox pad with a whisper of pink noise.
    name: 'FANTA BELLS',
    params: {
      'oscA.table': 4, 'oscA.pos': 0.6, 'oscA.oct': 1, 'oscA.level': 0.15,
      'oscB.on': 1, 'oscB.table': 3, 'oscB.pos': 0.4, 'oscB.unison': 3, 'oscB.detune': 0.18, 'oscB.spread': 0.8, 'oscB.level': 0.5,
      'noise.on': 1, 'noise.type': 1, 'noise.level': 0.12,
      'filter.type': 0, 'filter.cutoff': 3500, 'filter.res': 0.08, 'filter.key': 0.4,
      'env1.a': 0.005, 'env1.d': 1.5, 'env1.s': 0.75, 'env1.r': 2,
      'env2.a': 0.001, 'env2.d': 1.2, 'env2.s': 0, 'env2.r': 1,
      'lfo1.rate': 0.3,
      'mat1.src': 3, 'mat1.dst': 7, 'mat1.amt': 0.5,
      'mat2.src': 1, 'mat2.dst': 6, 'mat2.amt': 0.2,
      'fx.chorus.on': 1, 'fx.chorus.mix': 0.35,
      'fx.reverb.on': 1, 'fx.reverb.size': 0.85, 'fx.reverb.mix': 0.45,
    
      'fx.eq.on': 1, 'fx.eq.low': 6, 'fx.eq.mid': 0.9, 'fx.eq.mfreq': 624, 'fx.eq.high': -6,
    },
  },

  {
    // Taurus-style pedal bass: saw + square an octave apart over a deep sub,
    // dark driven 24 dB lowpass and a slow foot-glide between notes.
    name: 'TAURUS PEDAL',
    params: {
      'oscA.table': 0, 'oscA.pos': 0.66, 'oscA.level': 0.8,
      'oscB.on': 1, 'oscB.table': 0, 'oscB.pos': 1, 'oscB.oct': -1, 'oscB.level': 0.5,
      'sub.on': 1, 'sub.level': 0.7, 'sub.oct': -1,
      'filter.type': 1, 'filter.cutoff': 380, 'filter.res': 0.2, 'filter.env': 0.45, 'filter.drive': 0.3,
      'env1.a': 0.004, 'env1.d': 0.5, 'env1.s': 0.8, 'env1.r': 0.25,
      'env2.a': 0.003, 'env2.d': 0.4, 'env2.s': 0.2, 'env2.r': 0.2,
      'master.glide': 0.07, 'master.mono': 1,
      'fx.drive.on': 1, 'fx.drive.amt': 0.35, 'fx.drive.mix': 0.2,

      'fx.eq.on': 1, 'fx.eq.low': -6, 'fx.eq.mid': -6, 'fx.eq.mfreq': 288, 'fx.eq.high': 6,
    },
  },

  {
    // PPG-style digital wave sweep: the mod env scans the VOX table from dark
    // to glassy on every note, with a glitchy sparkle layer an octave up.
    name: 'WAVE DANCER',
    params: {
      'oscA.table': 3, 'oscA.pos': 0.2, 'oscA.level': 0.7,
      'oscB.on': 1, 'oscB.table': 5, 'oscB.pos': 0.35, 'oscB.oct': 1, 'oscB.level': 0.3,
      'filter.type': 0, 'filter.cutoff': 3800, 'filter.res': 0.15, 'filter.key': 0.3,
      'env1.a': 0.004, 'env1.d': 0.6, 'env1.s': 0.7, 'env1.r': 0.4,
      'env2.a': 0.01, 'env2.d': 0.6, 'env2.s': 0.25, 'env2.r': 0.3,
      'mat1.src': 3, 'mat1.dst': 1, 'mat1.amt': 0.55,
      'mat2.src': 4, 'mat2.dst': 1, 'mat2.amt': 0.3,
      'fx.chorus.on': 1, 'fx.chorus.mix': 0.3,
      'fx.delay.on': 1, 'fx.delay.time': 0.3, 'fx.delay.fb': 0.3, 'fx.delay.mix': 0.2,
    
      'fx.eq.on': 1, 'fx.eq.low': 6, 'fx.eq.mid': -1.4, 'fx.eq.mfreq': 694, 'fx.eq.high': -6,
    },
  },

  {
    // "Funky Worm" whistle lead: a bare sine an octave up with huge
    // portamento and wide vibrato — the G-funk siren.
    name: 'FUNKY WORM',
    params: {
      'fx.ott.on': 1, 'fx.ott.depth': 0.22, 'fx.ott.time': 1.2, 'fx.ott.up': 0.6, 'fx.ott.down': 0.75,
      'fx.comp.on': 1, 'fx.comp.thr': -20, 'fx.comp.att': 0.025, 'fx.comp.rel': 0.1, 'fx.comp.ratio': 3,
      'oscA.table': 0, 'oscA.pos': 0, 'oscA.oct': 1, 'oscA.level': 0.9,
      'filter.type': 0, 'filter.cutoff': 4000, 'filter.res': 0.1, 'filter.key': 0.5,
      'env1.a': 0.002, 'env1.d': 0.3, 'env1.s': 0.85, 'env1.r': 0.15,
      'master.glide': 0.22, 'master.mono': 1,
      'lfo1.rate': 5.8,
      'mat1.src': 1, 'mat1.dst': 4, 'mat1.amt': 0.007,
      'fx.drive.on': 1, 'fx.drive.amt': 0.2, 'fx.drive.mix': 0.2,
      'fx.delay.on': 1, 'fx.delay.time': 0.25, 'fx.delay.fb': 0.2, 'fx.delay.mix': 0.15,

      'fx.eq.on': 1, 'fx.eq.low': -6, 'fx.eq.mid': -6, 'fx.eq.mfreq': 396, 'fx.eq.high': 6,
    },
  },

  {
    // DX100-style "Lately Bass": a solid sine core whose bright saw bite
    // decays away FM-fast, velocity digging the filter open.
    name: 'LATELY BASS',
    params: {
      'master.volume': 0.4767, // Match the original output after adding drive.
      'fx.ott.on': 1, 'fx.ott.depth': 0.26, 'fx.ott.time': 1.4, 'fx.ott.up': 0.65, 'fx.ott.down': 0.75,
      'fx.comp.on': 1, 'fx.comp.thr': -21, 'fx.comp.att': 0.028, 'fx.comp.rel': 0.1, 'fx.comp.ratio': 3,
      'fx.drive.on': 1, 'fx.drive.amt': 0.22, 'fx.drive.mix': 0.2, 'fx.drive.type': 1, 'fx.drive.tone': -0.18,
      'oscA.table': 0, 'oscA.pos': 0.05, 'oscA.level': 0.9,
      'oscB.on': 1, 'oscB.table': 0, 'oscB.pos': 0.66, 'oscB.level': 0.45,
      'sub.on': 1, 'sub.level': 0.4, 'sub.oct': -1,
      'filter.type': 0, 'filter.cutoff': 700, 'filter.res': 0.12, 'filter.env': 0.65, 'filter.key': 0.4,
      'env1.a': 0.001, 'env1.d': 0.4, 'env1.s': 0.6, 'env1.r': 0.1,
      'env2.a': 0.001, 'env2.d': 0.18, 'env2.s': 0, 'env2.r': 0.1,
      'mat1.src': 4, 'mat1.dst': 3, 'mat1.amt': 0.4,
    
      'fx.eq.on': 1, 'fx.eq.low': -4.2, 'fx.eq.mid': -0.5, 'fx.eq.mfreq': 271, 'fx.eq.high': 4.7,
    },
  },

  {
    // Prophet-style poly stab: saw against a slightly-sharp pulse, snappy
    // half-sustain envelope and a resonant filter bite.
    name: 'PROPHET STAB',
    params: {
      'master.volume': 0.4805, // Match the original output after adding drive.
      'fx.ott.on': 1, 'fx.ott.depth': 0.24, 'fx.ott.time': 1.5, 'fx.ott.up': 0.6, 'fx.ott.down': 0.75,
      'fx.comp.on': 1, 'fx.comp.thr': -20, 'fx.comp.att': 0.03, 'fx.comp.rel': 0.11, 'fx.comp.ratio': 3,
      'fx.drive.on': 1, 'fx.drive.amt': 0.2, 'fx.drive.mix': 0.2, 'fx.drive.type': 1, 'fx.drive.tone': -0.18,
      'oscA.table': 0, 'oscA.pos': 0.66, 'oscA.unison': 2, 'oscA.detune': 0.1, 'oscA.spread': 0.5, 'oscA.level': 0.75,
      'oscB.on': 1, 'oscB.table': 2, 'oscB.pos': 0.3, 'oscB.fine': 5, 'oscB.level': 0.55,
      'filter.type': 0, 'filter.cutoff': 1700, 'filter.res': 0.25, 'filter.env': 0.55, 'filter.key': 0.4,
      'env1.a': 0.003, 'env1.d': 0.5, 'env1.s': 0.35, 'env1.r': 0.3,
      'env2.a': 0.002, 'env2.d': 0.35, 'env2.s': 0.1, 'env2.r': 0.25,
      'fx.chorus.on': 1, 'fx.chorus.mix': 0.25,
      'fx.reverb.on': 1, 'fx.reverb.size': 0.45, 'fx.reverb.mix': 0.22,
    
      'fx.eq.on': 1, 'fx.eq.low': 1, 'fx.eq.mid': 1.1, 'fx.eq.mfreq': 458, 'fx.eq.high': -2.1,
    },
  },

  // ---- Ambient glide leads (51+) -----------------------------------------
  // Smooth near-sine voices for the AMBIENT sessions: slow attacks, long
  // releases, master.glide portamento and prominent long delays. All stay
  // "clean" (no drive) per the session-preset lead contract.

  {
    // Foghorn drifting in the dark: pure sine over a sine sub, closed LP24,
    // vibrato that fades in late and a long delay smeared into big reverb.
    name: 'FOG LIGHT',
    params: {
      'oscA.table': 0, 'oscA.pos': 0.02, 'oscA.level': 0.8,
      'sub.on': 1, 'sub.shape': 0, 'sub.oct': -1, 'sub.level': 0.45,
      'filter.type': 1, 'filter.cutoff': 1100, 'filter.res': 0.08, 'filter.env': 0.15, 'filter.key': 0.3,
      'env1.a': 0.25, 'env1.d': 1.5, 'env1.s': 0.85, 'env1.r': 2.5,
      'env2.a': 0.4, 'env2.d': 1.2, 'env2.s': 0.3, 'env2.r': 1.5,
      'master.glide': 0.22, 'master.mono': 1,
      'lfo1.shape': 0, 'lfo1.rate': 4.5, 'lfo1.rise': 1.2,
      'lfo2.rate': 0.08,
      'mat1.src': 1, 'mat1.dst': 4, 'mat1.amt': 0.006,
      'mat2.src': 2, 'mat2.dst': 3, 'mat2.amt': 0.15,
      'fx.delay.on': 1, 'fx.delay.time': 0.8, 'fx.delay.fb': 0.55, 'fx.delay.mix': 0.4,
      'fx.reverb.on': 1, 'fx.reverb.size': 0.85, 'fx.reverb.mix': 0.45,
      'fx.eq.on': 1, 'fx.eq.low': 1.5, 'fx.eq.high': -4,
    },
  },

  {
    // Liquid glass ribbon: sine core with a breathing chime shimmer an octave
    // up, soft chorus and a long delay that lets each glide bloom.
    name: 'GLASS RIBBON',
    params: {
      'oscA.table': 0, 'oscA.pos': 0, 'oscA.level': 0.75,
      'oscB.on': 1, 'oscB.table': 4, 'oscB.pos': 0.2, 'oscB.oct': 1, 'oscB.level': 0.22,
      'filter.type': 0, 'filter.cutoff': 3500, 'filter.res': 0.1,
      'env1.a': 0.12, 'env1.d': 1.2, 'env1.s': 0.8, 'env1.r': 2,
      'master.glide': 0.14, 'master.mono': 1,
      'lfo1.shape': 0, 'lfo1.rate': 5, 'lfo1.rise': 1,
      'lfo2.rate': 0.15,
      'mat1.src': 1, 'mat1.dst': 4, 'mat1.amt': 0.007,
      'mat2.src': 2, 'mat2.dst': 8, 'mat2.amt': 0.15,
      'fx.chorus.on': 1, 'fx.chorus.rate': 0.4, 'fx.chorus.mix': 0.4,
      'fx.delay.on': 1, 'fx.delay.time': 0.7, 'fx.delay.fb': 0.5, 'fx.delay.mix': 0.38,
      'fx.reverb.on': 1, 'fx.reverb.size': 0.7, 'fx.reverb.mix': 0.35,
      'fx.eq.on': 1, 'fx.eq.low': 0.5, 'fx.eq.high': 1,
    },
  },

  {
    // Cold wire in the north sky: a bare high sine pair, barely detuned, with
    // the longest, iciest delay of the set and a slow vibrato rise.
    name: 'NORTH WIRE',
    params: {
      'oscA.table': 0, 'oscA.pos': 0, 'oscA.oct': 1, 'oscA.unison': 2, 'oscA.detune': 0.06, 'oscA.spread': 0.3, 'oscA.level': 0.8,
      'filter.type': 0, 'filter.cutoff': 6000, 'filter.res': 0.05,
      'env1.a': 0.06, 'env1.d': 1, 'env1.s': 0.75, 'env1.r': 1.8,
      'master.glide': 0.18, 'master.mono': 1,
      'lfo1.shape': 0, 'lfo1.rate': 5.5, 'lfo1.rise': 1.5,
      'mat1.src': 1, 'mat1.dst': 4, 'mat1.amt': 0.005,
      'fx.delay.on': 1, 'fx.delay.time': 1.0, 'fx.delay.fb': 0.65, 'fx.delay.mix': 0.5,
      'fx.reverb.on': 1, 'fx.reverb.size': 0.8, 'fx.reverb.mix': 0.35,
      'fx.eq.on': 1, 'fx.eq.low': -2, 'fx.eq.high': 2,
    },
  },

  {
    // Ceremonial breath flute: warm sine with a whisper of pink noise that
    // swells slowly, gentle vibrato and a long warm delay.
    name: 'TEMPLE BREATH',
    params: {
      'oscA.table': 0, 'oscA.pos': 0.05, 'oscA.level': 0.78,
      'noise.on': 1, 'noise.type': 1, 'noise.level': 0.12,
      'filter.type': 0, 'filter.cutoff': 2400, 'filter.res': 0.12, 'filter.key': 0.3,
      'env1.a': 0.18, 'env1.d': 1.4, 'env1.s': 0.85, 'env1.r': 2.2,
      'master.glide': 0.16, 'master.mono': 1,
      'lfo1.shape': 0, 'lfo1.rate': 4.2, 'lfo1.rise': 1.4,
      'lfo2.rate': 0.1,
      'mat1.src': 1, 'mat1.dst': 4, 'mat1.amt': 0.008,
      'mat2.src': 2, 'mat2.dst': 25, 'mat2.amt': 0.1,
      'fx.chorus.on': 1, 'fx.chorus.mix': 0.3,
      'fx.delay.on': 1, 'fx.delay.time': 0.7, 'fx.delay.fb': 0.52, 'fx.delay.mix': 0.36,
      'fx.reverb.on': 1, 'fx.reverb.size': 0.75, 'fx.reverb.mix': 0.4,
      'fx.eq.on': 1, 'fx.eq.low': 2, 'fx.eq.mid': 1.5, 'fx.eq.mfreq': 500, 'fx.eq.high': -3,
    },
  },

  // 55-57: genre voices for the MINIMAL / FUTURE BASS / TRIP HOP / DUB
  // session presets (SQ-4 references these by index — append only).

  {
    // Reedy mono dub lead: VOX table with a breath layer, slow vibrato that
    // rises after the onset, and a long dotted echo doing the dub work.
    name: 'MELODICA',
    params: {
      'oscA.table': 3, 'oscA.pos': 0.3, 'oscA.level': 0.82,
      'noise.on': 1, 'noise.type': 1, 'noise.level': 0.08,
      'filter.type': 1, 'filter.cutoff': 1900, 'filter.res': 0.14, 'filter.env': 0.2, 'filter.key': 0.35,
      'env1.a': 0.03, 'env1.d': 0.6, 'env1.s': 0.8, 'env1.r': 0.35,
      'env2.a': 0.02, 'env2.d': 0.5, 'env2.s': 0.3, 'env2.r': 0.3,
      'master.glide': 0.05, 'master.mono': 1,
      'lfo1.shape': 0, 'lfo1.rate': 5.2, 'lfo1.rise': 0.9,
      'mat1.src': 1, 'mat1.dst': 4, 'mat1.amt': 0.006,
      'fx.delay.on': 1, 'fx.delay.time': 0.56, 'fx.delay.fb': 0.58, 'fx.delay.mix': 0.38,
      'fx.reverb.on': 1, 'fx.reverb.size': 0.6, 'fx.reverb.mix': 0.24,
      'fx.eq.on': 1, 'fx.eq.low': -2, 'fx.eq.mid': 2.5, 'fx.eq.mfreq': 900, 'fx.eq.high': 1.5,
    },
  },

  {
    // Offbeat-organ chord stab for the DUB pads: sustain-free hit whose tail
    // is all echo and room, so a held chord reads as one skank per bar.
    name: 'DUB SKANK',
    params: {
      'oscA.table': 0, 'oscA.pos': 0.04, 'oscA.level': 0.72,
      'oscB.on': 1, 'oscB.table': 0, 'oscB.pos': 0.02, 'oscB.oct': 1, 'oscB.level': 0.45,
      'filter.type': 1, 'filter.cutoff': 2600, 'filter.res': 0.18, 'filter.env': 0.12, 'filter.key': 0.3,
      'env1.a': 0.002, 'env1.d': 0.32, 'env1.s': 0, 'env1.r': 0.28,
      'env2.a': 0.002, 'env2.d': 0.25, 'env2.s': 0, 'env2.r': 0.2,
      'lfo2.rate': 0.14,
      'mat1.src': 2, 'mat1.dst': 6, 'mat1.amt': 0.2,
      'fx.chorus.on': 1, 'fx.chorus.mix': 0.3,
      'fx.delay.on': 1, 'fx.delay.time': 0.42, 'fx.delay.fb': 0.62, 'fx.delay.mix': 0.44,
      'fx.reverb.on': 1, 'fx.reverb.size': 0.7, 'fx.reverb.mix': 0.35,
      'fx.eq.on': 1, 'fx.eq.low': -3, 'fx.eq.mid': 1, 'fx.eq.mfreq': 700, 'fx.eq.high': 2,
    },
  },

  {
    // Minimal-techno bleep: one narrow pulse frame, hair-trigger pluck
    // envelope, and a 3/16 ping-pong so single notes become the whole groove.
    name: 'BLEEP TECH',
    params: {
      'oscA.table': 2, 'oscA.pos': 0.12, 'oscA.oct': 1, 'oscA.level': 0.8,
      'filter.type': 1, 'filter.cutoff': 3200, 'filter.res': 0.22, 'filter.env': 0.3, 'filter.key': 0.5,
      'env1.a': 0.001, 'env1.d': 0.14, 'env1.s': 0, 'env1.r': 0.1,
      'env2.a': 0.001, 'env2.d': 0.1, 'env2.s': 0, 'env2.r': 0.08,
      'master.mono': 1,
      'lfo2.rate': 0.11,
      'mat1.src': 2, 'mat1.dst': 6, 'mat1.amt': 0.3,
      'mat2.src': 4, 'mat2.dst': 3, 'mat2.amt': 0.25,
      'fx.delay.on': 1, 'fx.delay.time': 0.28, 'fx.delay.fb': 0.45, 'fx.delay.mix': 0.3,
      'fx.reverb.on': 1, 'fx.reverb.size': 0.3, 'fx.reverb.mix': 0.12,
      'fx.eq.on': 1, 'fx.eq.low': -4, 'fx.eq.mid': -1, 'fx.eq.mfreq': 500, 'fx.eq.high': 3,
    },
  },

  {
    // 58 — bowed solo-strings lead for the CINEMATIC songs. Unlike the
    // CINEMA STRINGS pad it speaks in ~120 ms rather than swelling for a bar,
    // so it can carry a melody, but it sustains flat: whole and half notes
    // hold their level instead of decaying like the plucked leads do. Vibrato
    // rises after the onset, and env2 opens the filter as the bow digs in.
    name: 'CINEMA LEAD',
    params: {
      'oscA.table': 1, 'oscA.pos': 0.42, 'oscA.unison': 4, 'oscA.detune': 0.16,
      'oscA.spread': 0.55, 'oscA.level': 0.8,
      'oscB.on': 1, 'oscB.table': 0, 'oscB.pos': 0.5, 'oscB.oct': -1, 'oscB.level': 0.3,
      'filter.type': 0, 'filter.cutoff': 2600, 'filter.res': 0.12, 'filter.env': 0.25, 'filter.key': 0.35,
      'env1.a': 0.12, 'env1.d': 1.2, 'env1.s': 0.82, 'env1.r': 1.1,
      'env2.a': 0.3, 'env2.d': 1.5, 'env2.s': 0.5, 'env2.r': 0.9,
      'master.glide': 0.04, 'master.mono': 1,
      'lfo1.shape': 0, 'lfo1.rate': 5, 'lfo1.rise': 1.2,
      'mat1.src': 1, 'mat1.dst': 4, 'mat1.amt': 0.007,
      'mat2.src': 3, 'mat2.dst': 1, 'mat2.amt': 0.3,
      'fx.chorus.on': 1, 'fx.chorus.mix': 0.28,
      'fx.reverb.on': 1, 'fx.reverb.size': 0.8, 'fx.reverb.mix': 0.34,
      'fx.eq.on': 1, 'fx.eq.low': -2, 'fx.eq.mid': 2, 'fx.eq.mfreq': 800, 'fx.eq.high': 1,
    },
  },

  // 59-61: MINIMAL leads. All three follow the same rules — one short
  // percussive hit with no sustain, a low-pass well under 1 kHz so nothing
  // reads as bright, and a tempo-matched delay plus reverb doing the actual
  // rhythmic work. The MINIMAL clips play a single repeated pitch, so the
  // groove has to come from the echoes rather than from the notes.
  // Delay times target the family's 124-133 BPM: 0.36 s = 3/16, 0.24 s = 1/8.

  {
    // Dry knock with a 3/16 echo trail — the classic techno delay figure.
    name: 'DEEP TICK',
    params: {
      'oscA.table': 0, 'oscA.pos': 0.08, 'oscA.level': 1,
      'oscB.on': 1, 'oscB.table': 0, 'oscB.pos': 0.05, 'oscB.oct': -1, 'oscB.level': 0.45,
      'filter.type': 1, 'filter.cutoff': 780, 'filter.res': 0.24, 'filter.env': 0.35, 'filter.key': 0.3,
      'env1.a': 0.001, 'env1.d': 0.16, 'env1.s': 0, 'env1.r': 0.12,
      'env2.a': 0.001, 'env2.d': 0.09, 'env2.s': 0, 'env2.r': 0.08,
      'master.mono': 1,
      'mat1.src': 2, 'mat1.dst': 3, 'mat1.amt': 0.2,
      'fx.delay.on': 1, 'fx.delay.time': 0.36, 'fx.delay.fb': 0.58, 'fx.delay.mix': 0.42,
      'fx.reverb.on': 1, 'fx.reverb.size': 0.55, 'fx.reverb.mix': 0.26,
      'fx.eq.on': 1, 'fx.eq.low': 1, 'fx.eq.mid': -1, 'fx.eq.mfreq': 420, 'fx.eq.high': -6,
    },
  },

  {
    // Woody and even darker — a closed-room knock, 1/8 delay, long tail.
    name: 'ROOM KNOCK',
    params: {
      'oscA.table': 1, 'oscA.pos': 0.2, 'oscA.level': 1,
      'oscB.on': 1, 'oscB.table': 0, 'oscB.pos': 0.1, 'oscB.oct': -1, 'oscB.level': 0.6,
      'filter.type': 1, 'filter.cutoff': 680, 'filter.res': 0.3, 'filter.env': 0.4, 'filter.key': 0.25,
      'env1.a': 0.002, 'env1.d': 0.22, 'env1.s': 0, 'env1.r': 0.16,
      'env2.a': 0.001, 'env2.d': 0.12, 'env2.s': 0, 'env2.r': 0.1,
      'master.mono': 1,
      'mat1.src': 2, 'mat1.dst': 3, 'mat1.amt': 0.25,
      'fx.delay.on': 1, 'fx.delay.time': 0.24, 'fx.delay.fb': 0.62, 'fx.delay.mix': 0.44,
      'fx.reverb.on': 1, 'fx.reverb.size': 0.72, 'fx.reverb.mix': 0.32,
      'fx.eq.on': 1, 'fx.eq.low': 2, 'fx.eq.mid': -2, 'fx.eq.mfreq': 380, 'fx.eq.high': -6,
    },
  },

  {
    // The shortest of the three: a muted blip whose 1/16 delay smears it into
    // a pulse, so one note per bar still fills the grid.
    name: 'CELLAR BLIP',
    params: {
      'oscA.table': 0, 'oscA.pos': 0.12, 'oscA.level': 1,
      'oscB.on': 1, 'oscB.table': 0, 'oscB.pos': 0.08, 'oscB.oct': -1, 'oscB.level': 0.5,
      'filter.type': 1, 'filter.cutoff': 820, 'filter.res': 0.28, 'filter.env': 0.3, 'filter.key': 0.35,
      'env1.a': 0.001, 'env1.d': 0.12, 'env1.s': 0, 'env1.r': 0.1,
      'env2.a': 0.001, 'env2.d': 0.05, 'env2.s': 0, 'env2.r': 0.05,
      'master.mono': 1,
      'mat1.src': 2, 'mat1.dst': 3, 'mat1.amt': 0.22,
      'mat2.src': 4, 'mat2.dst': 3, 'mat2.amt': 0.15,
      'fx.delay.on': 1, 'fx.delay.time': 0.12, 'fx.delay.fb': 0.7, 'fx.delay.mix': 0.46,
      'fx.reverb.on': 1, 'fx.reverb.size': 0.6, 'fx.reverb.mix': 0.3,
      'fx.eq.on': 1, 'fx.eq.low': 0, 'fx.eq.mid': -1.5, 'fx.eq.mfreq': 450, 'fx.eq.high': -6,
    },
  },

  // ---- More Serum-style staples ----------------------------------------

  {
    // Wavetable morph pad: a slow mod env scans both oscillators' positions.
    name: 'GLASS MORPH',
    params: {
      'oscA.table': 1, 'oscA.pos': 0.05, 'oscA.unison': 4, 'oscA.detune': 0.22, 'oscA.spread': 0.9, 'oscA.level': 0.72,
      'oscB.on': 1, 'oscB.table': 4, 'oscB.pos': 0.2, 'oscB.oct': 1, 'oscB.fine': -7, 'oscB.unison': 2, 'oscB.detune': 0.15, 'oscB.level': 0.28,
      'filter.type': 1, 'filter.cutoff': 3200, 'filter.res': 0.16, 'filter.key': 0.3,
      'env1.a': 0.6, 'env1.d': 2, 'env1.s': 0.8, 'env1.r': 2.2,
      'env2.a': 4, 'env2.d': 3, 'env2.s': 0.7, 'env2.r': 2.5,
      'lfo1.rate': 0.18,
      'mat1.src': 3, 'mat1.dst': 1, 'mat1.amt': 0.8,
      'mat2.src': 3, 'mat2.dst': 2, 'mat2.amt': 0.6,
      'mat3.src': 1, 'mat3.dst': 3, 'mat3.amt': 0.12,
      'fx.chorus.on': 1, 'fx.chorus.mix': 0.4,
      'fx.delay.on': 1, 'fx.delay.sync': 1, 'fx.delay.div': 3, 'fx.delay.fb': 0.38, 'fx.delay.mix': 0.22,
      'fx.reverb.on': 1, 'fx.reverb.size': 0.8, 'fx.reverb.mix': 0.42,
    },
  },

  {
    // Rave hoover: wide PWM stack over a saw octave, pitch scoop and glide.
    name: 'RAVE HOOVER',
    params: {
      'fx.ott.on': 1, 'fx.ott.depth': 0.24, 'fx.ott.time': 1.1, 'fx.ott.up': 0.6, 'fx.ott.down': 0.8,
      'fx.comp.on': 1, 'fx.comp.thr': -20, 'fx.comp.att': 0.02, 'fx.comp.rel': 0.14, 'fx.comp.ratio': 3,
      'oscA.table': 2, 'oscA.pos': 0.45, 'oscA.unison': 5, 'oscA.detune': 0.45, 'oscA.spread': 0.9, 'oscA.level': 0.7,
      'oscB.on': 1, 'oscB.table': 0, 'oscB.pos': 0.66, 'oscB.oct': -1, 'oscB.unison': 3, 'oscB.detune': 0.35, 'oscB.spread': 0.8, 'oscB.level': 0.5,
      'sub.on': 1, 'sub.level': 0.3,
      'filter.type': 0, 'filter.cutoff': 4200, 'filter.res': 0.15, 'filter.key': 0.3,
      'env1.a': 0.01, 'env1.d': 0.6, 'env1.s': 0.85, 'env1.r': 0.4,
      'env2.a': 0.001, 'env2.d': 0.28, 'env2.s': 0, 'env2.r': 0.2,
      'master.glide': 0.08, 'master.mono': 1,
      'lfo1.shape': 1, 'lfo1.rate': 0.35,
      'mat1.src': 3, 'mat1.dst': 4, 'mat1.amt': -0.2,
      'mat2.src': 1, 'mat2.dst': 1, 'mat2.amt': 0.3,
      'fx.drive.on': 1, 'fx.drive.amt': 0.3, 'fx.drive.mix': 0.2,
      'fx.chorus.on': 1, 'fx.chorus.rate': 0.8, 'fx.chorus.depth': 0.7, 'fx.chorus.mix': 0.55,
      'fx.reverb.on': 1, 'fx.reverb.size': 0.55, 'fx.reverb.mix': 0.25,
    },
  },

  {
    // Long 808 bass: pure sine, fast pitch punch, tape drive for harmonics.
    name: 'BOOM 808',
    params: {
      'fx.comp.on': 1, 'fx.comp.thr': -18, 'fx.comp.att': 0.01, 'fx.comp.rel': 0.12, 'fx.comp.ratio': 3,
      'oscA.table': 0, 'oscA.pos': 0, 'oscA.level': 0.95,
      'filter.type': 0, 'filter.cutoff': 1400, 'filter.res': 0.05,
      'env1.a': 0.001, 'env1.d': 1.6, 'env1.s': 0, 'env1.r': 0.35,
      'env2.a': 0.001, 'env2.d': 0.05, 'env2.s': 0, 'env2.r': 0.05,
      'master.glide': 0.09, 'master.mono': 1,
      'mat1.src': 3, 'mat1.dst': 4, 'mat1.amt': 0.5,
      'fx.drive.on': 1, 'fx.drive.amt': 0.5, 'fx.drive.mix': 0.2, 'fx.drive.type': 1,
    },
  },

  {
    // Trance-gate supersaw: a synced 1/16 square LFO chops the amp.
    name: 'GATE PAD',
    params: {
      'oscA.table': 0, 'oscA.pos': 0.66, 'oscA.unison': 7, 'oscA.detune': 0.3, 'oscA.spread': 1, 'oscA.level': 0.72,
      'oscB.on': 1, 'oscB.table': 1, 'oscB.pos': 0.5, 'oscB.oct': 1, 'oscB.unison': 3, 'oscB.detune': 0.2, 'oscB.level': 0.3,
      'filter.type': 1, 'filter.cutoff': 3800, 'filter.res': 0.18, 'filter.key': 0.3,
      'env1.a': 0.02, 'env1.d': 0.5, 'env1.s': 0.9, 'env1.r': 0.5,
      'lfo1.shape': 3, 'lfo1.sync': 1, 'lfo1.syncrate': 8,
      'lfo2.rate': 0.12,
      'mat1.src': 1, 'mat1.dst': 5, 'mat1.amt': 0.95,
      'mat2.src': 2, 'mat2.dst': 3, 'mat2.amt': 0.25,
      'fx.delay.on': 1, 'fx.delay.sync': 1, 'fx.delay.div': 3, 'fx.delay.fb': 0.35, 'fx.delay.mix': 0.25,
      'fx.reverb.on': 1, 'fx.reverb.size': 0.7, 'fx.reverb.mix': 0.35,
    },
  },

  {
    // Laser zap: an octave pitch dive and a resonant filter blip, then echoes.
    name: 'LASER ZAP',
    params: {
      'oscA.table': 2, 'oscA.pos': 0.5, 'oscA.oct': 1, 'oscA.level': 0.75,
      'oscB.on': 1, 'oscB.table': 0, 'oscB.pos': 0.66, 'oscB.oct': 1, 'oscB.fine': 12, 'oscB.level': 0.4,
      'filter.type': 0, 'filter.cutoff': 2500, 'filter.res': 0.45, 'filter.env': 0.6,
      'env1.a': 0.001, 'env1.d': 0.3, 'env1.s': 0, 'env1.r': 0.2,
      'env2.a': 0.001, 'env2.d': 0.2, 'env2.s': 0, 'env2.r': 0.15,
      'mat1.src': 3, 'mat1.dst': 4, 'mat1.amt': 1,
      'fx.delay.on': 1, 'fx.delay.sync': 1, 'fx.delay.div': 3, 'fx.delay.fb': 0.45, 'fx.delay.mix': 0.32,
      'fx.reverb.on': 1, 'fx.reverb.size': 0.5, 'fx.reverb.mix': 0.25,
    },
  },

  {
    // Glitch bass: a synced S&H LFO jumps the GLITCH table and the cutoff.
    name: 'GLITCH SHUFFLE',
    params: {
      'fx.ott.on': 1, 'fx.ott.depth': 0.32, 'fx.ott.time': 0.9, 'fx.ott.up': 0.85, 'fx.ott.down': 0.85,
      'fx.comp.on': 1, 'fx.comp.thr': -22, 'fx.comp.att': 0.015, 'fx.comp.rel': 0.12, 'fx.comp.ratio': 3.5,
      'oscA.table': 5, 'oscA.pos': 0.4, 'oscA.unison': 2, 'oscA.detune': 0.12, 'oscA.spread': 0.4, 'oscA.level': 0.8,
      'oscB.on': 1, 'oscB.table': 0, 'oscB.pos': 0.66, 'oscB.oct': -1, 'oscB.level': 0.4,
      'sub.on': 1, 'sub.level': 0.5, 'sub.oct': -1,
      'filter.type': 1, 'filter.cutoff': 1100, 'filter.res': 0.35, 'filter.drive': 0.4,
      'env1.a': 0.003, 'env1.d': 0.3, 'env1.s': 0.9, 'env1.r': 0.12,
      'lfo1.shape': 4, 'lfo1.sync': 1, 'lfo1.syncrate': 8,
      'mat1.src': 1, 'mat1.dst': 1, 'mat1.amt': 0.45,
      'mat2.src': 1, 'mat2.dst': 3, 'mat2.amt': 0.3,
      'fx.drive.on': 1, 'fx.drive.amt': 0.45, 'fx.drive.mix': 0.2, 'fx.drive.type': 2,
    },
  },

  {
    // Notch-sweep bass: a synced triangle LFO walks a notch through a saw stack.
    name: 'NOTCH SWEEP',
    params: {
      'fx.ott.on': 1, 'fx.ott.depth': 0.28, 'fx.ott.time': 1, 'fx.ott.up': 0.75, 'fx.ott.down': 0.8,
      'fx.comp.on': 1, 'fx.comp.thr': -20, 'fx.comp.att': 0.02, 'fx.comp.rel': 0.13, 'fx.comp.ratio': 3,
      'oscA.table': 0, 'oscA.pos': 0.66, 'oscA.unison': 3, 'oscA.detune': 0.18, 'oscA.spread': 0.5, 'oscA.level': 0.82,
      'sub.on': 1, 'sub.level': 0.45, 'sub.oct': -1,
      'filter.type': 4, 'filter.cutoff': 700, 'filter.res': 0.55, 'filter.key': 0.4,
      'filter2.on': 1, 'filter2.type': 1, 'filter2.cutoff': 2400, 'filter2.res': 0.1,
      'env1.a': 0.004, 'env1.d': 0.4, 'env1.s': 0.9, 'env1.r': 0.15,
      'lfo1.shape': 1, 'lfo1.sync': 1, 'lfo1.syncrate': 1,
      'mat1.src': 1, 'mat1.dst': 3, 'mat1.amt': 0.45,
      'fx.drive.on': 1, 'fx.drive.amt': 0.35, 'fx.drive.mix': 0.2,
    },
  },
];


// Resolve a preset into a clean, complete param map (params-as-truth). Modulation
// lives entirely in the 16 fixed `mat{n}.*` slots now. Routes ride in `params`:
// factory presets author them in `mat*` and current user saves persist all 16
// slots there, so the `{ ...defaultParams(), ...presetParams }` spread already
// yields the authored slots plus 0 for every unauthored one — no extra zeroing.
// User presets saved by OLDER builds carry an explicit `mods[]` array instead; we
// expand it into slots in order (truncating anything beyond 16) and zero the rest.
// The per-route scaling is unchanged, so the sound is identical.
export function resolvePresetMods(
  presetParams: Partial<ParamValues>,
  explicit?: ModConnection[],
): ParamValues {
  const merged = { ...defaultParams(), ...presetParams } as ParamValues;
  if (explicit) {
    for (let s = 1; s <= MOD_MATRIX_SIZE; s++) {
      const m = explicit[s - 1];
      merged[`mat${s}.src`] = m ? m.src | 0 : 0;
      merged[`mat${s}.dst`] = m ? m.dst | 0 : 0;
      merged[`mat${s}.amt`] = m ? m.amt || 0 : 0;
      merged[`mat${s}.pol`] = m ? m.pol || 0 : 0;
      merged[`mat${s}.aux`] = m ? m.aux || 0 : 0;
    }
  }
  return merged;
}

const LS_KEY = 'fablesynth.userPresets';

export function loadUserPresets(): Preset[] {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) as string) || [];
  } catch {
    return [];
  }
}

export function saveUserPreset(name: string, params: ParamValues, tables: SerializedUserTable[] = []): Preset[] {
  const list = loadUserPresets().filter((p) => p.name !== name);
  // Routes live in the `mat*` params now, so the full param map already carries
  // them — no separate `mods` array to embed.
  const preset: Preset = { name, params: { ...params } };
  if (tables.length) preset.tables = tables;
  list.push(preset);
  try { localStorage.setItem(LS_KEY, JSON.stringify(list)); } catch { /* storage unavailable or full */ }
  return list;
}
