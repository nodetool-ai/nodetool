// SQ-4 master bus. `ott-worklet.js` is loaded first and publishes the shared
// EQ, OTT and compressor implementations on globalThis. Keeping every stage in
// this worklet gives web and native the same ordering:
//
//   EQ -> OTT -> compressor -> user ceiling -> master gain
//      -> legacy output compressor -> final sample-peak safety limiter
//
// It also removes browser-dependent BiquadFilterNode and
// DynamicsCompressorNode behaviour from recalled sessions.

const MASTER_DEFAULTS = {
  'master.fx.eq.on': 0,
  'master.fx.eq.low': 0, 'master.fx.eq.mid': 0, 'master.fx.eq.mid2': 0, 'master.fx.eq.high': 0,
  'master.fx.eq.lfreq': 120, 'master.fx.eq.mfreq': 900, 'master.fx.eq.m2freq': 2500, 'master.fx.eq.hfreq': 6000,
  'master.fx.eq.lq': Math.SQRT1_2, 'master.fx.eq.mq': .9, 'master.fx.eq.m2q': .9, 'master.fx.eq.hq': Math.SQRT1_2,
  'master.fx.eq.ltype': 0, 'master.fx.eq.mtype': 1, 'master.fx.eq.m2type': 1, 'master.fx.eq.htype': 2,
  'master.fx.eq.lon': 1, 'master.fx.eq.mon': 1, 'master.fx.eq.m2on': 1, 'master.fx.eq.hon': 1,
  'master.fx.ott.on': 1, 'master.fx.ott.depth': .35, 'master.fx.ott.time': 1,
  'master.fx.ott.up': 1, 'master.fx.ott.down': 1,
  'master.fx.comp.on': 1, 'master.fx.comp.thr': -16, 'master.fx.comp.att': .003,
  'master.fx.comp.rel': .25, 'master.fx.comp.ratio': 4,
  'master.fx.limiter.on': 1, 'master.fx.limiter.ceiling': -1,
  'master.fx.comp.sc': 0, 'master.fx.comp.schp': 20,
};

const SAFETY_CEILING = 0.8912509381337456; // -1 dBFS, sample peak

class Smooth {
  constructor(sr, seconds, value) {
    this.coef = 1 - Math.exp(-1 / (seconds * sr));
    this.cur = this.target = value;
  }
  next() { this.cur += (this.target - this.cur) * this.coef; return this.cur; }
}

// The legacy SQ-4 output compressor is retained after master gain for patch
// loudness. This is the same static curve and makeup calculation as the native
// SeqProcessor::Limiter; the final lookahead stage below supplies the ceiling.
class LegacyOutputCompressor {
  constructor(sr) {
    this.atk = 1 - Math.exp(-1 / (.002 * sr));
    this.rel = 1 - Math.exp(-1 / (.25 * sr));
    const g0 = Math.pow(10, this.curveDb(0) / 20);
    this.makeup = Math.pow(1 / g0, .6);
    this.env = 0;
  }
  curveDb(xDb) {
    const over = xDb + 6;
    if (over <= 0) return 0;
    const slope = 1 / 12 - 1;
    return over < 4 ? slope * over * over / 8 : slope * (over - 2);
  }
  process(l, r) {
    const peak = Math.max(Math.abs(l), Math.abs(r));
    this.env += (peak - this.env) * (peak > this.env ? this.atk : this.rel);
    const gain = Math.pow(10, this.curveDb(20 * Math.log10(Math.max(this.env, 1e-9))) / 20) * this.makeup;
    this.l = l * gain; this.r = r * gain;
  }
}

// Linked-stereo lookahead limiter. The delay is after every gain-changing
// stage, so the advertised ceiling is the actual worklet output ceiling.
class LookaheadLimiter {
  constructor(sr) {
    this.la = Math.max(8, Math.round(.0015 * sr));
    this.cap = this.la + 2;
    this.dlL = new Float32Array(this.la); this.dlR = new Float32Array(this.la);
    this.qv = new Float64Array(this.cap).fill(1); this.qi = new Float64Array(this.cap);
    this.atk = 1 - Math.exp(-4 / this.la);
    this.rel = 1 - Math.exp(-1 / (.2 * sr));
    this.w = 0; this.qh = 0; this.qt = 0; this.t = 0; this.env = 1;
  }
  process(l, r, ceiling = SAFETY_CEILING) {
    const cap = Number.isFinite(ceiling) && ceiling > 0 ? ceiling : SAFETY_CEILING;
    const peak = Math.max(Math.abs(l), Math.abs(r));
    const required = peak > cap ? cap / peak : 1;
    while (this.qh !== this.qt) {
      const previous = this.qt > 0 ? this.qt - 1 : this.cap - 1;
      if (this.qv[previous] < required) break;
      this.qt = previous;
    }
    this.qv[this.qt] = required; this.qi[this.qt] = this.t;
    this.qt = this.qt + 1 < this.cap ? this.qt + 1 : 0;
    if (this.qi[this.qh] < this.t - this.la) this.qh = this.qh + 1 < this.cap ? this.qh + 1 : 0;
    const wanted = this.qv[this.qh];
    this.env += (wanted - this.env) * (wanted < this.env ? this.atk : this.rel);
    const dl = this.dlL[this.w], dr = this.dlR[this.w];
    this.dlL[this.w] = l; this.dlR[this.w] = r;
    if (++this.w >= this.la) this.w = 0;
    this.t++;
    const delayedPeak = Math.max(Math.abs(dl), Math.abs(dr));
    let gain = this.env;
    if (gain * delayedPeak > cap) gain = cap / delayedPeak;
    this.l = dl * gain; this.r = dr * gain;
  }
}

class MasterProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.p = { ...MASTER_DEFAULTS };
    this.eq = new globalThis.FableParametricEq(sampleRate);
    this.ott = new globalThis.FableOttCompressor(sampleRate);
    this.comp = new globalThis.FableCompressor(sampleRate);
    this.legacy = new LegacyOutputCompressor(sampleRate);
    this.safety = new LookaheadLimiter(sampleRate);
    this.master = new Smooth(sampleRate, .015, 1);
    this.ceiling = new Smooth(sampleRate, .015, SAFETY_CEILING);
    this.ceilingMix = new Smooth(sampleRate, .015, 1);
    this.updateParams();
    this.port.onmessage = (event) => {
      const data = event.data;
      if (data?.t === 'params') { Object.assign(this.p, data.params); this.updateParams(); }
      else if (data?.t === 'gain' && Number.isFinite(data.value)) this.master.target = Math.max(0, data.value);
    };
    this.port.postMessage({ t: 'latency', n: this.safety.la });
  }

  updateParams() {
    const p = this.p;
    this.eq.setParams((key) => p[`master.${key}`]);
    this.ott.setParams(p['master.fx.ott.on'] > .5, p['master.fx.ott.depth'],
      p['master.fx.ott.time'], p['master.fx.ott.up'], p['master.fx.ott.down']);
    this.comp.setParams(p['master.fx.comp.on'] > .5, p['master.fx.comp.thr'],
      p['master.fx.comp.att'], p['master.fx.comp.rel'], p['master.fx.comp.ratio']);
    // Side-chain: 1 KICK → key channel 4, TRACK n → n-1 (src/engine/sidechain.ts).
    const sc = Math.round(p['master.fx.comp.sc'] || 0);
    this.keyChannel = sc === 1 ? 4 : sc >= 2 ? sc - 2 : -1;
    this.comp.setKey(this.keyChannel >= 0, p['master.fx.comp.schp']);
    this.ceiling.target = Math.pow(10, Math.max(-24, Math.min(0, p['master.fx.limiter.ceiling'])) / 20);
    this.ceilingMix.target = p['master.fx.limiter.on'] > .5 ? 1 : 0;
  }

  process(inputs, outputs) {
    const input = inputs[0], output = outputs[0];
    // Input 1 is the key bus (five mono channels), aligned with the mix.
    const key = this.keyChannel >= 0 ? inputs[1]?.[this.keyChannel] : null;
    const sourceL = input[0] ?? [], sourceR = input[1] ?? sourceL;
    const left = output[0], right = output[1] ?? left;
    const n = left.length;
    for (let i = 0; i < n; i++) { left[i] = sourceL[i] || 0; right[i] = sourceR[i] || 0; }

    this.eq.process(left, right, n);
    for (let i = 0; i < n; i++) {
      this.ott.processSample(left[i], right[i]);
      this.comp.processSample(this.ott.l, this.ott.r, key ? key[i] : 0);
      let l = this.comp.l, r = this.comp.r;

      const ceiling = this.ceiling.next();
      const peak = Math.max(Math.abs(l), Math.abs(r));
      const limitedGain = peak > ceiling ? ceiling / peak : 1;
      const mix = this.ceilingMix.next();
      const gain = 1 + mix * (limitedGain - 1);
      l *= gain; r *= gain;

      const master = this.master.next();
      this.legacy.process(l * master, r * master);
      // The upstream gain follows a smoothed ceiling to avoid zippering, but
      // the final safety stage must enforce the selected ceiling immediately.
      // Otherwise a newly recalled lower ceiling can still overshoot while the
      // control smoother catches up.
      const finalCeiling = this.ceilingMix.target > 0.5
        ? this.ceiling.target : SAFETY_CEILING;
      this.safety.process(this.legacy.l, this.legacy.r, finalCeiling);
      left[i] = Number.isFinite(this.safety.l) ? this.safety.l : 0;
      right[i] = Number.isFinite(this.safety.r) ? this.safety.r : 0;
    }
    return true;
  }
}

registerProcessor('fable-sq-master', MasterProcessor);
