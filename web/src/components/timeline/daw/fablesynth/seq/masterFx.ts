// SQ-4's session-level processing. These controls belong to the mixer, never
// to a device patch, so an inline DR-1/BL-1/WT-1 edit cannot accidentally
// overwrite the sound of the whole performance.

export type MasterFxParams = Record<string, number>;

export const MASTER_FX_DEFAULTS: MasterFxParams = {
  'master.fx.eq.on': 0,
  'master.fx.eq.low': 0, 'master.fx.eq.mid': 0, 'master.fx.eq.mid2': 0, 'master.fx.eq.high': 0,
  'master.fx.eq.lfreq': 120, 'master.fx.eq.mfreq': 900, 'master.fx.eq.m2freq': 2500, 'master.fx.eq.hfreq': 6000,
  'master.fx.eq.lq': Math.SQRT1_2, 'master.fx.eq.mq': 0.9, 'master.fx.eq.m2q': 0.9, 'master.fx.eq.hq': Math.SQRT1_2,
  'master.fx.eq.ltype': 0, 'master.fx.eq.mtype': 1, 'master.fx.eq.m2type': 1, 'master.fx.eq.htype': 2,
  'master.fx.eq.lon': 1, 'master.fx.eq.mon': 1, 'master.fx.eq.m2on': 1, 'master.fx.eq.hon': 1,
  // Match the DR-1 group strip: EQ is neutral, then moderate OTT and a
  // 4:1 glue compressor feed the final safety limiter.
  'master.fx.ott.on': 1, 'master.fx.ott.depth': 0.35, 'master.fx.ott.time': 1, 'master.fx.ott.up': 1, 'master.fx.ott.down': 1,
  'master.fx.comp.on': 1, 'master.fx.comp.thr': -16, 'master.fx.comp.att': 0.003, 'master.fx.comp.rel': 0.25, 'master.fx.comp.ratio': 4,
  'master.fx.limiter.on': 1, 'master.fx.limiter.ceiling': -1,
  // COMP side-chain (src/engine/sidechain.ts SC_SOURCES): off, KICK, TRACK 1..4.
  'master.fx.comp.sc': 0, 'master.fx.comp.schp': 20,
};

export function masterFxParams(value?: Partial<MasterFxParams>): MasterFxParams {
  return Object.assign({}, MASTER_FX_DEFAULTS, value ?? {}) as MasterFxParams;
}
