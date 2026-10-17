// Source: fablesynth src/bass/patches.ts. BL-1 factory and user patches. In
// the timeline a patch is the sound only: the clip holds the notes, so the
// upstream pitch sequences are dropped. Factory entries contain only authored
// overrides; patchToState fills the rest from the canonical defaults.

import type { ParamValues } from '../params';
import { defaultBassParams } from './params';

export interface BassPatch {
  name: string;
  params: Partial<ParamValues>;
}

const FACTORY_PATCHES_RAW: BassPatch[] = [
  {
    // The design defaults ARE the acid line — overrides only where the mock differs.
    name: 'ACID LINE',
    params: {
      'fx.ott.on': 1, 'fx.ott.depth': 0.24, 'fx.ott.time': 1.1, 'fx.ott.up': 0.65, 'fx.ott.down': 0.75,
      'fx.comp.on': 1, 'fx.comp.thr': -20, 'fx.comp.att': 0.02, 'fx.comp.rel': 0.1, 'fx.comp.ratio': 3,
    },
  },
  {
    name: 'RUBBER SUB',
    params: {
      'fx.ott.on': 1, 'fx.ott.depth': 0.14, 'fx.ott.time': 1.6, 'fx.ott.up': 0.35, 'fx.ott.down': 0.6,
      'fx.comp.on': 1, 'fx.comp.thr': -18, 'fx.comp.att': 0.03, 'fx.comp.rel': 0.14, 'fx.comp.ratio': 2.5,
      'fx.drive.type': 1, 'fx.drive.tone': -0.2,
      'osc.table': 2, // PULSE
      'osc.pos': 0.12,
      'osc.level': 0.6,
      'sub.shape': 1,
      'sub.oct': -1,
      'sub.level': 0.8,
      'flt.cut': 210,
      'flt.res': 0.35,
      'flt.drive': 0.25,
      'flt.env': 0.45,
      'fenv.dec': 0.32,
      'aenv.sus': 0.72,
      'acc.amt': 0.5,
      'lfo.depth': 0.05,
      'fx.drive.amt': 0.2,
      'fx.reverb.mix': 0.06,
      'seq.bpm': 122,
      'master.swing': 0.42,
    },
  },
  {
    name: 'NEON SQUELCH',
    params: {
      'fx.ott.on': 1, 'fx.ott.depth': 0.3, 'fx.ott.time': 1, 'fx.ott.up': 0.75, 'fx.ott.down': 0.85,
      'fx.comp.on': 1, 'fx.comp.thr': -21, 'fx.comp.att': 0.018, 'fx.comp.rel': 0.09, 'fx.comp.ratio': 3,
      'osc.pos': 0.55,
      'osc.unison': 3,
      'osc.detune': 0.3,
      'osc.spread': 0.4,
      'sub.level': 0.3,
      'flt.cut': 520,
      'flt.res': 0.78,
      'flt.env': 0.85,
      'fenv.dec': 0.12,
      'acc.amt': 0.85,
      'slide.time': 0.09,
      'lfo.depth': 0.3,
      'lfo.rate': 8, // 1/16
      'fx.chorus.on': 1,
      'fx.delay.on': 1,
      'fx.delay.mix': 0.24,
      'seq.bpm': 142,
    },
  },
  {
    name: 'DEEP DUB',
    params: {
      'osc.table': 0, 'osc.pos': 0.18, 'osc.level': 0.62,
      'sub.shape': 0, 'sub.oct': -2, 'sub.level': 0.88,
      'flt.type': 1, 'flt.cut': 145, 'flt.res': 0.28, 'flt.drive': 0.22,
      'flt.env': 0.32, 'fenv.dec': 0.55,
      'aenv.dec': 0.7, 'aenv.sus': 0.82, 'aenv.rel': 0.22,
      'acc.amt': 0.38, 'slide.time': 0.13, 'lfo.depth': 0.04,
      'fx.drive.amt': 0.16, 'fx.delay.on': 1, 'fx.delay.time': 0.5,
      'fx.delay.fb': 0.5, 'fx.delay.mix': 0.14,
      'fx.reverb.size': 0.58, 'fx.reverb.mix': 0.16,
      'seq.bpm': 112, 'master.swing': 0.4,
    },
  },
  {
    name: 'WAREHOUSE',
    params: {
      'fx.ott.on': 1, 'fx.ott.depth': 0.34, 'fx.ott.time': 1.1, 'fx.ott.up': 0.8, 'fx.ott.down': 0.9,
      'fx.comp.on': 1, 'fx.comp.thr': -22, 'fx.comp.att': 0.024, 'fx.comp.rel': 0.095, 'fx.comp.ratio': 3.5,
      'osc.table': 3, 'osc.pos': 0.72, 'osc.unison': 2, 'osc.detune': 0.18,
      'osc.spread': 0.18, 'sub.level': 0.38,
      'flt.type': 1, 'flt.cut': 430, 'flt.res': 0.68, 'flt.drive': 0.72,
      'flt.env': 0.76, 'fenv.dec': 0.14, 'aenv.dec': 0.22, 'aenv.sus': 0.42,
      'acc.amt': 0.9, 'slide.time': 0.055,
      'fx.drive.amt': 0.7, 'fx.drive.mix': 0.2,
      'fx.reverb.mix': 0.05, 'seq.bpm': 136, 'master.swing': 0.16,
    },
  },
  {
    name: 'ROUNDHOUSE',
    params: {
      'fx.ott.on': 1, 'fx.ott.depth': 0.2, 'fx.ott.time': 1.5, 'fx.ott.up': 0.5, 'fx.ott.down': 0.7,
      'fx.comp.on': 1, 'fx.comp.thr': -20, 'fx.comp.att': 0.028, 'fx.comp.rel': 0.12, 'fx.comp.ratio': 3,
      'fx.drive.type': 1, 'fx.drive.tone': -0.2,
      'osc.table': 1, 'osc.pos': 0.28, 'osc.unison': 1, 'osc.level': 0.68,
      'sub.shape': 0, 'sub.oct': -1, 'sub.level': 0.68,
      'flt.type': 0, 'flt.cut': 680, 'flt.res': 0.22, 'flt.drive': 0.34,
      'flt.env': 0.48, 'flt.track': 0.45, 'fenv.dec': 0.28,
      'aenv.dec': 0.36, 'aenv.sus': 0.62, 'aenv.rel': 0.12,
      'acc.amt': 0.52, 'lfo.depth': 0.08,
      'fx.drive.amt': 0.28, 'fx.chorus.on': 1, 'fx.chorus.rate': 0.42,
      'fx.chorus.depth': 0.22, 'fx.chorus.mix': 0.1,
      'seq.bpm': 124, 'master.swing': 0.32,
    },
  },
  {
    name: 'METAL PULSE',
    params: {
      'fx.ott.on': 1, 'fx.ott.depth': 0.28, 'fx.ott.time': 1.2, 'fx.ott.up': 0.65, 'fx.ott.down': 0.8,
      'fx.comp.on': 1, 'fx.comp.thr': -20, 'fx.comp.att': 0.024, 'fx.comp.rel': 0.11, 'fx.comp.ratio': 3,
      // A bandpass on a bass throws away most of its energy; the level here is
      // set so the patch can still reach the mix target at a sane track fader.
      'osc.table': 4, 'osc.pos': 0.86, 'osc.fine': 9,
      'osc.unison': 3, 'osc.detune': 0.12, 'osc.spread': 0.32, 'osc.level': 1,
      'sub.shape': 1, 'sub.level': 0.9,
      'flt.type': 2, 'flt.cut': 620, 'flt.res': 0.58, 'flt.drive': 0.38,
      'flt.env': 0.62, 'fenv.dec': 0.19,
      'aenv.dec': 0.4, 'aenv.sus': 0.75, 'acc.amt': 0.72,
      'lfo.rate': 8, 'lfo.shape': 2, 'lfo.depth': 0.24,
      'fx.chorus.on': 1, 'fx.chorus.rate': 1.4, 'fx.chorus.depth': 0.5,
      'fx.chorus.mix': 0.22, 'fx.delay.on': 1, 'fx.delay.time': 0.22,
      'fx.delay.mix': 0.12, 'seq.bpm': 130, 'master.swing': 0.2,
    },
  },
  {
    name: 'TAPE BASS',
    params: {
      'osc.table': 0, 'osc.pos': 0.38, 'osc.fine': -7, 'osc.unison': 2,
      'osc.detune': 0.08, 'osc.spread': 0.12, 'osc.level': 0.66,
      'sub.shape': 0, 'sub.level': 0.62,
      'flt.type': 0, 'flt.cut': 510, 'flt.res': 0.18, 'flt.drive': 0.3,
      'flt.env': 0.38, 'fenv.att': 0.006, 'fenv.dec': 0.4,
      'aenv.att': 0.008, 'aenv.dec': 0.5, 'aenv.sus': 0.7, 'aenv.rel': 0.2,
      'acc.amt': 0.44, 'slide.time': 0.1, 'lfo.rate': 3, 'lfo.depth': 0.08,
      'fx.drive.amt': 0.22, 'fx.drive.mix': 0.2,
      'fx.chorus.on': 1, 'fx.chorus.rate': 0.18, 'fx.chorus.depth': 0.2,
      'fx.chorus.mix': 0.12, 'fx.reverb.mix': 0.08,
      'seq.bpm': 104, 'master.swing': 0.5,
    },
  },
  {
    name: 'REESE MONO',
    params: {
      'fx.ott.on': 1, 'fx.ott.depth': 0.28, 'fx.ott.time': 1.3, 'fx.ott.up': 0.7, 'fx.ott.down': 0.8,
      'fx.comp.on': 1, 'fx.comp.thr': -21, 'fx.comp.att': 0.025, 'fx.comp.rel': 0.16, 'fx.comp.ratio': 3,
      'osc.table': 0, 'osc.pos': 0.64, 'osc.unison': 7, 'osc.detune': 0.46,
      'osc.spread': 0.18, 'osc.level': 0.72, 'sub.shape': 0, 'sub.level': 0.54,
      'flt.type': 1, 'flt.cut': 360, 'flt.res': 0.3, 'flt.drive': 0.54,
      'flt.env': 0.3, 'flt.track': 0.22, 'fenv.dec': 0.65,
      'aenv.dec': 0.4, 'aenv.sus': 0.88, 'aenv.rel': 0.16,
      'acc.amt': 0.5, 'slide.time': 0.085, 'lfo.rate': 2, 'lfo.depth': 0.1,
      'fx.drive.amt': 0.48, 'fx.drive.mix': 0.2,
      'fx.chorus.on': 1, 'fx.chorus.rate': 0.32, 'fx.chorus.depth': 0.26,
      'fx.chorus.mix': 0.16, 'fx.reverb.mix': 0.05,
      'seq.bpm': 128, 'master.swing': 0.24,
    },
  },
  {
    name: 'PLUCKED WIRE',
    params: {
      'fx.ott.on': 1, 'fx.ott.depth': 0.22, 'fx.ott.time': 1.5, 'fx.ott.up': 0.55, 'fx.ott.down': 0.7,
      'fx.comp.on': 1, 'fx.comp.thr': -20, 'fx.comp.att': 0.028, 'fx.comp.rel': 0.08, 'fx.comp.ratio': 3,
      'osc.table': 2, 'osc.pos': 0.62, 'osc.tune': 0, 'osc.unison': 2,
      'osc.detune': 0.1, 'osc.spread': 0.28, 'osc.level': 1,
      'sub.level': 0.18, 'flt.type': 1, 'flt.cut': 1500, 'flt.res': 0.42,
      'flt.drive': 0.26, 'flt.env': 0.88, 'flt.track': 0.62,
      'fenv.dec': 0.075, 'aenv.dec': 0.11, 'aenv.sus': 0.5, 'aenv.rel': 0.05,
      'acc.amt': 0.8, 'slide.time': 0.035, 'lfo.depth': 0,
      'fx.drive.amt': 0.24, 'fx.delay.on': 1, 'fx.delay.time': 0.31,
      'fx.delay.fb': 0.34, 'fx.delay.mix': 0.18,
      'fx.reverb.size': 0.42, 'fx.reverb.mix': 0.14,
      'seq.bpm': 132, 'master.swing': 0.18,
    },
  },
  {
    name: 'DARK CURRENT',
    params: {
      'osc.table': 5, 'osc.pos': 0.24, 'osc.unison': 4,
      'osc.detune': 0.32, 'osc.spread': 0.36, 'osc.level': 0.68,
      'sub.shape': 1, 'sub.oct': -2, 'sub.level': 0.62,
      'flt.type': 1, 'flt.cut': 260, 'flt.res': 0.46, 'flt.drive': 0.62,
      'flt.env': -0.38, 'flt.track': 0.18, 'fenv.att': 0.035, 'fenv.dec': 0.8,
      'aenv.att': 0.012, 'aenv.dec': 0.55, 'aenv.sus': 0.78, 'aenv.rel': 0.28,
      'acc.amt': 0.58, 'slide.time': 0.16, 'lfo.rate': 4, 'lfo.shape': 1,
      'lfo.depth': 0.34, 'fx.drive.amt': 0.56, 'fx.drive.mix': 0.2,
      'fx.delay.on': 1, 'fx.delay.time': 0.6, 'fx.delay.fb': 0.58,
      'fx.delay.mix': 0.16, 'fx.reverb.size': 0.68, 'fx.reverb.mix': 0.18,
      'seq.bpm': 118, 'master.swing': 0.36,
    },
  },
  {
    name: 'CLEAN SUB',
    params: {
      'osc.table': 1, 'osc.pos': 0, 'osc.unison': 1, 'osc.level': 0.36,
      'sub.shape': 0, 'sub.oct': -1, 'sub.level': 0.92,
      'flt.type': 0, 'flt.cut': 780, 'flt.res': 0.08, 'flt.drive': 0.08,
      'flt.env': 0.12, 'flt.track': 0.5, 'fenv.dec': 0.45,
      'aenv.att': 0.006, 'aenv.dec': 0.5, 'aenv.sus': 0.9, 'aenv.rel': 0.12,
      'acc.amt': 0.32, 'slide.time': 0.07, 'lfo.depth': 0,
      'fx.drive.on': 0, 'fx.chorus.on': 0, 'fx.delay.on': 0,
      'fx.reverb.on': 0, 'seq.bpm': 120, 'master.swing': 0.26,
    },
  },
  // ---- genre bank: one purpose-built voice per SQ-4 song family, so no
  // family has to borrow a bass that fights its groove. Levelled to land in
  // the same −7..−13 dB pre-fader window as the originals (measured by
  // juce/test/measure_track_levels.cpp in real song context).
  {
    // AMBIENT: no attack, no bite — a bass that behaves like a low pad.
    name: 'SOFT HORIZON',
    params: {
      'osc.table': 1, 'osc.pos': 0.34, 'osc.unison': 3, 'osc.detune': 0.14,
      'osc.spread': 0.3, 'osc.level': 0.62,
      'sub.shape': 0, 'sub.oct': -1, 'sub.level': 0.78,
      'flt.type': 1, 'flt.cut': 320, 'flt.res': 0.14, 'flt.drive': 0.12,
      'flt.env': 0.18, 'flt.track': 0.4,
      'fenv.att': 0.06, 'fenv.dec': 1.2,
      'aenv.att': 0.05, 'aenv.dec': 0.9, 'aenv.sus': 0.9, 'aenv.rel': 0.45,
      'acc.amt': 0.22, 'slide.time': 0.2, 'lfo.rate': 1, 'lfo.depth': 0.12,
      'fx.drive.amt': 0.1, 'fx.chorus.on': 1, 'fx.chorus.rate': 0.22,
      'fx.chorus.depth': 0.34, 'fx.chorus.mix': 0.18,
      'fx.reverb.size': 0.7, 'fx.reverb.mix': 0.2,
      'seq.bpm': 96, 'master.swing': 0.2,
    },
  },
  {
    // HOUSE: the classic organ-ish bump — short, round, sits under a 4/4 kick.
    name: 'HOUSE ORGAN',
    params: {
      'fx.ott.on': 1, 'fx.ott.depth': 0.22, 'fx.ott.time': 1.5, 'fx.ott.up': 0.5, 'fx.ott.down': 0.75,
      'fx.comp.on': 1, 'fx.comp.thr': -20, 'fx.comp.att': 0.03, 'fx.comp.rel': 0.11, 'fx.comp.ratio': 3,
      'fx.drive.type': 1, 'fx.drive.tone': -0.2,
      'osc.table': 2, 'osc.pos': 0.42, 'osc.unison': 2, 'osc.detune': 0.12,
      'osc.spread': 0.2, 'osc.level': 0.72,
      'sub.shape': 0, 'sub.oct': -1, 'sub.level': 0.7,
      'flt.type': 1, 'flt.cut': 420, 'flt.res': 0.3, 'flt.drive': 0.4,
      'flt.env': 0.5, 'flt.track': 0.35,
      'fenv.dec': 0.16, 'aenv.dec': 0.24, 'aenv.sus': 0.55, 'aenv.rel': 0.09,
      'acc.amt': 0.62, 'slide.time': 0.05, 'lfo.depth': 0.06,
      'fx.drive.amt': 0.34, 'fx.chorus.on': 1, 'fx.chorus.rate': 0.7,
      'fx.chorus.depth': 0.24, 'fx.chorus.mix': 0.14,
      'fx.reverb.mix': 0.06, 'seq.bpm': 124, 'master.swing': 0.1,
    },
  },
  {
    // LO-FI: dark, slightly flat, felt-muted — the tape hiss's companion.
    name: 'DUSTY FELT',
    params: {
      'osc.table': 0, 'osc.pos': 0.22, 'osc.fine': -5, 'osc.unison': 2,
      'osc.detune': 0.1, 'osc.spread': 0.14, 'osc.level': 0.6,
      'sub.shape': 0, 'sub.oct': -1, 'sub.level': 0.74,
      'flt.type': 1, 'flt.cut': 280, 'flt.res': 0.16, 'flt.drive': 0.26,
      'flt.env': 0.3, 'flt.track': 0.3,
      'fenv.att': 0.012, 'fenv.dec': 0.34,
      'aenv.att': 0.014, 'aenv.dec': 0.42, 'aenv.sus': 0.66, 'aenv.rel': 0.18,
      'acc.amt': 0.36, 'slide.time': 0.12, 'lfo.rate': 2, 'lfo.depth': 0.07,
      'fx.drive.amt': 0.24, 'fx.chorus.on': 1, 'fx.chorus.rate': 0.14,
      'fx.chorus.depth': 0.26, 'fx.chorus.mix': 0.14,
      'fx.reverb.mix': 0.08, 'seq.bpm': 88, 'master.swing': 0.52,
    },
  },
  {
    // CINEMATIC: almost all sub, two octaves down, swelling rather than played.
    name: 'CINEMA SUB',
    params: {
      'osc.table': 0, 'osc.pos': 0.1, 'osc.unison': 3, 'osc.detune': 0.2,
      'osc.spread': 0.24, 'osc.level': 0.44,
      'sub.shape': 0, 'sub.oct': -2, 'sub.level': 0.95,
      'flt.type': 1, 'flt.cut': 190, 'flt.res': 0.2, 'flt.drive': 0.3,
      'flt.env': 0.24, 'flt.track': 0.2,
      'fenv.att': 0.09, 'fenv.dec': 1.6,
      'aenv.att': 0.03, 'aenv.dec': 1.1, 'aenv.sus': 0.92, 'aenv.rel': 0.5,
      'acc.amt': 0.42, 'slide.time': 0.22, 'lfo.rate': 0, 'lfo.depth': 0.1,
      'fx.drive.amt': 0.4, 'fx.reverb.size': 0.8, 'fx.reverb.mix': 0.18,
      'seq.bpm': 96, 'master.swing': 0,
    },
  },
  {
    // MINIMAL: a sub stab. The oscillator is only there to give the note an
    // edge to speak with — the weight is all sub, and a 260 Hz low-pass keeps
    // any of it from reading as bright. Dry, and gone before the next step.
    name: 'SUB STAB',
    params: {
      'osc.table': 0, 'osc.pos': 0.1, 'osc.unison': 1, 'osc.level': 0.34,
      'sub.shape': 0, 'sub.oct': -1, 'sub.level': 1,
      'flt.type': 1, 'flt.cut': 260, 'flt.res': 0.16, 'flt.drive': 0.3,
      'flt.env': 0.3, 'flt.track': 0.25,
      'fenv.dec': 0.1, 'aenv.dec': 0.3, 'aenv.sus': 0.6, 'aenv.rel': 0.09,
      'acc.amt': 0.45, 'slide.time': 0.04, 'lfo.depth': 0,
      'fx.drive.on': 0, 'fx.chorus.on': 0, 'fx.delay.on': 0, 'fx.reverb.on': 0,
      'seq.bpm': 132, 'master.swing': 0,
    },
  },
  {
    // FUTURE BASS: the 808 — pure sub, long tail, glides between roots.
    name: '808 GLIDE',
    params: {
      'fx.ott.on': 1, 'fx.ott.depth': 0.12, 'fx.ott.time': 1.8, 'fx.ott.up': 0.3, 'fx.ott.down': 0.6,
      'fx.comp.on': 1, 'fx.comp.thr': -18, 'fx.comp.att': 0.03, 'fx.comp.rel': 0.18, 'fx.comp.ratio': 2.5,
      'fx.drive.type': 1, 'fx.drive.tone': -0.2,
      'osc.table': 0, 'osc.pos': 0.06, 'osc.unison': 1, 'osc.level': 0.3,
      'sub.shape': 0, 'sub.oct': -1, 'sub.level': 1,
      'flt.type': 1, 'flt.cut': 240, 'flt.res': 0.1, 'flt.drive': 0.35,
      'flt.env': 0.15, 'flt.track': 0.3,
      'fenv.dec': 0.8, 'aenv.att': 0.003, 'aenv.dec': 1.4, 'aenv.sus': 0.85,
      'aenv.rel': 0.35, 'acc.amt': 0.5, 'slide.time': 0.14, 'lfo.depth': 0,
      'fx.drive.amt': 0.45, 'fx.reverb.mix': 0.05,
      'seq.bpm': 150, 'master.swing': 0,
    },
  },
  {
    // FUTURE BASS: the other half — wide detuned growl with 1/8 filter motion.
    name: 'GROWL WIDE',
    params: {
      'fx.ott.on': 1, 'fx.ott.depth': 0.38, 'fx.ott.time': 1, 'fx.ott.up': 0.9, 'fx.ott.down': 0.85,
      'fx.comp.on': 1, 'fx.comp.thr': -22, 'fx.comp.att': 0.02, 'fx.comp.rel': 0.12, 'fx.comp.ratio': 3.5,
      'osc.table': 5, 'osc.pos': 0.48, 'osc.unison': 5, 'osc.detune': 0.38,
      'osc.spread': 0.42, 'osc.level': 0.66,
      'sub.shape': 0, 'sub.oct': -1, 'sub.level': 0.62,
      'flt.type': 1, 'flt.cut': 300, 'flt.res': 0.4, 'flt.drive': 0.6,
      'flt.env': 0.5, 'flt.track': 0.25,
      'fenv.dec': 0.3, 'aenv.dec': 0.5, 'aenv.sus': 0.8, 'aenv.rel': 0.18,
      'acc.amt': 0.6, 'slide.time': 0.08,
      'lfo.rate': 5, 'lfo.shape': 1, 'lfo.depth': 0.4,
      'fx.drive.amt': 0.55, 'fx.chorus.on': 1, 'fx.chorus.rate': 0.5,
      'fx.chorus.depth': 0.4, 'fx.chorus.mix': 0.2,
      'fx.reverb.mix': 0.06, 'seq.bpm': 150, 'master.swing': 0,
    },
  },
  {
    // TRIP HOP: woody and finger-soft, a hair behind the beat.
    name: 'UPRIGHT FELT',
    params: {
      'osc.table': 1, 'osc.pos': 0.16, 'osc.unison': 1, 'osc.level': 0.7,
      'sub.shape': 0, 'sub.oct': -1, 'sub.level': 0.8,
      'flt.type': 1, 'flt.cut': 250, 'flt.res': 0.22, 'flt.drive': 0.28,
      'flt.env': 0.42, 'flt.track': 0.42,
      'fenv.att': 0.008, 'fenv.dec': 0.22,
      'aenv.att': 0.01, 'aenv.dec': 0.55, 'aenv.sus': 0.6, 'aenv.rel': 0.22,
      'acc.amt': 0.48, 'slide.time': 0.14, 'lfo.depth': 0.04,
      'fx.drive.amt': 0.2, 'fx.reverb.size': 0.5, 'fx.reverb.mix': 0.12,
      'seq.bpm': 86, 'master.swing': 0.42,
    },
  },
  {
    // DUB: the steppers root — enormous, round, slow to speak, long to leave.
    name: 'STEPPER ROOT',
    params: {
      'osc.table': 0, 'osc.pos': 0.14, 'osc.unison': 1, 'osc.level': 0.4,
      'sub.shape': 0, 'sub.oct': -1, 'sub.level': 0.98,
      'flt.type': 1, 'flt.cut': 165, 'flt.res': 0.18, 'flt.drive': 0.3,
      'flt.env': 0.28, 'flt.track': 0.25,
      'fenv.att': 0.02, 'fenv.dec': 0.5,
      'aenv.att': 0.014, 'aenv.dec': 0.6, 'aenv.sus': 0.88, 'aenv.rel': 0.26,
      'acc.amt': 0.4, 'slide.time': 0.16, 'lfo.depth': 0.03,
      'fx.drive.amt': 0.22, 'fx.reverb.size': 0.6, 'fx.reverb.mix': 0.14,
      'seq.bpm': 74, 'master.swing': 0.14,
    },
  },
  {
    // MINIMAL: the held counterpart to SUB STAB — a pure sine sub that sits
    // under the whole bar. No oscillator content above the low-pass at all, so
    // it reads as weight rather than as a part.
    name: 'TECHNO SUB',
    params: {
      'osc.table': 0, 'osc.pos': 0.04, 'osc.unison': 1, 'osc.level': 0.22,
      'sub.shape': 0, 'sub.oct': -1, 'sub.level': 1,
      'flt.type': 1, 'flt.cut': 210, 'flt.res': 0.1, 'flt.drive': 0.24,
      'flt.env': 0.16, 'flt.track': 0.22,
      'fenv.dec': 0.4, 'aenv.att': 0.004, 'aenv.dec': 0.7, 'aenv.sus': 0.88,
      'aenv.rel': 0.16, 'acc.amt': 0.35, 'slide.time': 0.08, 'lfo.depth': 0,
      'fx.drive.amt': 0.2, 'fx.chorus.on': 0, 'fx.delay.on': 0, 'fx.reverb.on': 0,
      'seq.bpm': 130, 'master.swing': 0,
    },
  },
];

// Factory BL-1 sounds stay dry so their sequence and filter character read
// clearly in a mix. Users can still enable either effect after loading a patch.
// Drive, where a patch enables it, blends at a common 65% mix.
export const FACTORY_PATCHES: BassPatch[] = FACTORY_PATCHES_RAW.map((patch) => ({
  ...patch,
  params: {
    ...patch.params,
    'fx.delay.on': 0,
    'fx.reverb.on': 0,
    ...(patch.params['fx.drive.on'] === 0 ? {} : { 'fx.drive.mix': 0.65 }),
  },
}));


export function patchToState(patch: BassPatch): { params: ParamValues } {
  return { params: { ...defaultBassParams(), ...patch.params } as ParamValues };
}

export function stateToPatch(name: string, params: ParamValues): BassPatch {
  return { name, params: { ...params } };
}

export interface PatchOption {
  value: string;
  name: string;
  group: 'FACTORY' | 'USER';
}

export function patchOptions(userPatches: BassPatch[]): PatchOption[] {
  const options: PatchOption[] = FACTORY_PATCHES.map((p, i) => ({
    value: `f${i}`, name: p.name, group: 'FACTORY' as const,
  }));
  userPatches.forEach((p, i) => options.push({ value: `u${i}`, name: p.name, group: 'USER' }));
  return options;
}

const LS_KEY = 'fable-bl-patches';
const memoryStorage = new Map<string, string>();

function readStored(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return memoryStorage.get(key) ?? null;
  }
}

function writeStored(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    memoryStorage.set(key, value);
  }
}

export function loadUserPatches(): BassPatch[] {
  try {
    const parsed = JSON.parse(readStored(LS_KEY) as string);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveUserPatch(name: string, patch: BassPatch): BassPatch[] {
  const list = loadUserPatches().filter((entry) => entry.name !== name);
  list.push({ ...patch, name });
  writeStored(LS_KEY, JSON.stringify(list));
  return list;
}
