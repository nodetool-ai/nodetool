// fable-fx: one stage of the WT-1 FX chain (engine/worklet.js, class Fx) as a
// standalone stereo insert. Load ott-worklet.js and lab-worklet.js first: EQ,
// OTT, COMP, drive colour and LAB come from the classes they put on the global
// scope. The DSP below is copied from engine/worklet.js (Smooth, Biquad,
// DelayLine, HalfBandFir, Freeverb, mixGate and the stage loops in Fx.process)
// so the module has no imports.
//
// processorOptions: { kind, params, enabled, bpm }. Messages:
//   { t: 'params', params?, enabled?, bpm? } merges values in place.
//   { t: 'dynamics' | 'echo' | 'reverb', on } turns telemetry on or off.
// Params use the FableSynth ids (fx.reverb.size, fx.delay.fb, ...). `enabled`
// drives the stage's own `.on` switch, so bypass ramps exactly as in WT-1.

class Smooth {
  constructor() { this.cur = 0; this.target = 0; this.coef = 0.01; }
  setTime(tau) { this.coef = 1 - Math.exp(-1 / (tau * sampleRate)); }
  next() { this.cur += (this.target - this.cur) * this.coef; return this.cur; }
  snap(v) { this.cur = this.target = v; }
}

class Biquad {
  constructor() { this.b0 = 1; this.b1 = 0; this.b2 = 0; this.a1 = 0; this.a2 = 0; this.z1 = 0; this.z2 = 0; }
  reset() { this.z1 = 0; this.z2 = 0; }
  process(x) {
    const y = this.b0 * x + this.z1;
    this.z1 = this.b1 * x - this.a1 * y + this.z2;
    this.z2 = this.b2 * x - this.a2 * y;
    return y;
  }
  lowpass(freq, q) {
    const w0 = 2 * Math.PI * Math.min(freq, sampleRate * 0.49) / sampleRate;
    const cw = Math.cos(w0), alpha = Math.sin(w0) / (2 * q), a0 = 1 + alpha;
    this.b0 = (1 - cw) / 2 / a0; this.b1 = (1 - cw) / a0; this.b2 = this.b0;
    this.a1 = (-2 * cw) / a0; this.a2 = (1 - alpha) / a0;
  }
  highpass(freq, q) {
    const w0 = 2 * Math.PI * Math.min(freq, sampleRate * 0.49) / sampleRate;
    const cw = Math.cos(w0), alpha = Math.sin(w0) / (2 * q), a0 = 1 + alpha;
    this.b0 = (1 + cw) / 2 / a0; this.b1 = -(1 + cw) / a0; this.b2 = this.b0;
    this.a1 = (-2 * cw) / a0; this.a2 = (1 - alpha) / a0;
  }
}

class DelayLine {
  constructor(n) { this.buf = new Float32Array(n); this.w = 0; }
  reset() { this.buf.fill(0); this.w = 0; }
  write(x) { this.buf[this.w] = x; if (++this.w >= this.buf.length) this.w = 0; }
  read(d) {
    const sz = this.buf.length;
    let rd = this.w - d;
    while (rd < 0) rd += sz;
    const i0 = rd | 0, frac = rd - i0;
    const i1 = i0 + 1 < sz ? i0 + 1 : 0;
    return this.buf[i0] + frac * (this.buf[i1] - this.buf[i0]);
  }
  blockRead(src, dst, n, d) {
    for (let i = 0; i < n; i++) { this.write(src[i]); dst[i] = this.read(d); }
  }
  readHermite(d) {
    const b = this.buf, sz = b.length;
    let rd = this.w - d;
    while (rd < 0) rd += sz;
    const i1 = rd | 0, t = rd - i1;
    const i0 = i1 > 0 ? i1 - 1 : sz - 1;
    const i2 = i1 + 1 < sz ? i1 + 1 : 0;
    const i3 = i2 + 1 < sz ? i2 + 1 : 0;
    const y0 = b[i0], y1 = b[i1], y2 = b[i2], y3 = b[i3];
    const c1 = 0.5 * (y2 - y0);
    const c2 = y0 - 2.5 * y1 + 2 * y2 - 0.5 * y3;
    const c3 = 0.5 * (y3 - y0) + 1.5 * (y1 - y2);
    return ((c3 * t + c2) * t + c1) * t + y1;
  }
}

const TWO_PI = 6.283185307179586;

function besselI0(x) {
  let sum = 1, term = 1;
  for (let k = 1; k < 64; k++) {
    term *= x * x / (4 * k * k);
    sum += term;
    if (term < 1e-16 * sum) break;
  }
  return sum;
}

// Polyphase Kaiser half-band FIR, one instance per mode (interpolate or decimate).
class HalfBandFir {
  constructor(taps, beta) {
    const h = new Float64Array(taps);
    const M = taps - 1, ib = besselI0(beta);
    for (let i = 0; i < taps; i++) {
      const m = i - M * 0.5;
      const sinc = m === 0 ? 0.5 : Math.sin(Math.PI * 0.5 * m) / (Math.PI * m);
      const t = 2 * m / M;
      h[i] = sinc * besselI0(beta * Math.sqrt(Math.max(0, 1 - t * t))) / ib;
    }
    const c = (taps - 1) >> 1;
    for (let i = 0; i < taps; i++) if (i !== c && ((i - c) % 2) === 0) h[i] = 0;
    const ne = (taps + 1) >> 1, no = taps >> 1;
    this.cEven = (c & 1) === 0;
    const branch = new Float64Array(this.cEven ? no : ne);
    for (let j = 0; j < branch.length; j++) branch[j] = h[this.cEven ? 2 * j + 1 : 2 * j];
    this.g = branch;
    this.dly = c >> 1;
    this.np = Math.max(ne, no + 1);
    this.hx = new Float64Array(2 * this.np);
    this.he = new Float64Array(2 * this.np);
    this.ho = new Float64Array(2 * this.np);
    this.px = 0; this.pd = 0;
  }
  reset() { this.hx.fill(0); this.he.fill(0); this.ho.fill(0); this.px = 0; this.pd = 0; }
  interpBlock(x, out, n) {
    const np = this.np, hx = this.hx, g = this.g, nb = g.length;
    const dly = this.dly, cEven = this.cEven;
    let p = this.px;
    for (let i = 0; i < n; i++) {
      if (--p < 0) p = np - 1;
      const v = x[i];
      hx[p] = v; hx[p + np] = v;
      let a = 0;
      for (let j = 0; j < nb; j++) a += g[j] * hx[p + j];
      a += a;
      const d = hx[p + dly];
      const o = i + i;
      if (cEven) { out[o] = d; out[o + 1] = a; } else { out[o] = a; out[o + 1] = d; }
    }
    this.px = p;
  }
  decimBlock(x, out, n) {
    const np = this.np, he = this.he, ho = this.ho, g = this.g, nb = g.length;
    const dly = this.dly, cEven = this.cEven;
    let p = this.pd;
    for (let i = 0; i < n; i++) {
      if (--p < 0) p = np - 1;
      const o = i + i;
      const x0 = x[o], x1 = x[o + 1];
      he[p] = x0; he[p + np] = x0;
      ho[p] = x1; ho[p + np] = x1;
      const b = cEven ? ho : he;
      const q = cEven ? p + 1 : p;
      let a = 0;
      for (let j = 0; j < nb; j++) a += g[j] * b[q + j];
      out[i] = a + 0.5 * (cEven ? he[p + dly] : ho[p + dly + 1]);
    }
    this.pd = p;
  }
}

const HB1_TAPS = 63, HB2_TAPS = 17;
const DRIVE_LATENCY = ((HB1_TAPS - 1) / 2 + (HB2_TAPS - 1) / 4) | 0;

class FvComb {
  constructor(n) { this.buf = new Float32Array(n); this.idx = 0; this.filt = 0; this.damp1 = 0.2; this.damp2 = 0.8; this.feedback = 0.84; }
  reset() { this.buf.fill(0); this.filt = 0; }
  process(x) {
    const out = this.buf[this.idx];
    this.filt = out * this.damp2 + this.filt * this.damp1;
    this.buf[this.idx] = x + this.filt * this.feedback;
    if (++this.idx >= this.buf.length) this.idx = 0;
    return out;
  }
}
class FvAllpass {
  constructor(n) { this.buf = new Float32Array(n); this.idx = 0; this.feedback = 0.5; }
  reset() { this.buf.fill(0); }
  process(x) {
    const bo = this.buf[this.idx];
    const out = -x + bo;
    this.buf[this.idx] = x + bo * this.feedback;
    if (++this.idx >= this.buf.length) this.idx = 0;
    return out;
  }
}
const FV_COMB_TUNE = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617];
const FV_AP_TUNE = [556, 441, 341, 225];
const FV_SPREAD = 23;

function mixGate(on, amount, wet) {
  if (wet) return on ? Math.sin(amount * Math.PI / 2) : 0;
  return on ? Math.cos(amount * Math.PI / 2) : 1;
}

const ECHO_DIVISIONS = [1, 1.5, 0.5, 0.75, 1 / 3, 0.25];
const LAB_FIELDS = {
  crush: ['on', 'bits', 'rate', 'chaos', 'mix'], reso: ['on', 'note', 'chord', 'decay', 'mix'],
  shift: ['on', 'hz', 'fb', 'spread', 'mix'], spray: ['on', 'pitch', 'density', 'scatter', 'mix'],
  glitch: ['on', 'div', 'chance', 'drift', 'mix'],
};
const LAB_KEYS = Object.entries(LAB_FIELDS).flatMap(([stage, fields]) =>
  fields.map(f => [`fx.${stage}.${f}`, stage + f[0].toUpperCase() + f.slice(1), f === 'on']));
// The WT-1 param id prefix of each kind's `.on` switch.
const ON_PARAM = { eq: 'fx.eq.on', ott: 'fx.ott.on', comp: 'fx.comp.on', drive: 'fx.drive.on', chorus: 'fx.chorus.on', echo: 'fx.delay.on', reverb: 'fx.reverb.on' };
const KINDS = ['eq', 'ott', 'comp', 'drive', 'lab', 'chorus', 'echo', 'reverb'];

function stereoEnergy(L, R, n) {
  let energy = 0;
  for (let i = 0; i < n; i++) energy += 0.5 * (L[i] * L[i] + R[i] * R[i]);
  return energy;
}
const dbOf = value => Math.max(-90, Math.min(60, 20 * Math.log10(Math.max(1e-9, value))));

class FableFxProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const o = (options && options.processorOptions) || {};
    this.kind = KINDS.includes(o.kind) ? o.kind : 'eq';
    this.p = Object.create(null);
    this.enabled = o.enabled !== false;
    this.bpm = Number.isFinite(o.bpm) && o.bpm > 0 ? o.bpm : 120;
    this.guard = new globalThis.FablePeakGuard(sampleRate);
    this.feedbackGuard = new globalThis.FablePeakGuard(sampleRate);
    this.L = new Float64Array(128); this.R = new Float64Array(128);
    this.init();
    this.merge(o.params || {});
    this.apply();
    this.port.onmessage = (e) => this.onMsg(e.data);
  }

  init() {
    const scale = sampleRate / 44100;
    switch (this.kind) {
      case 'eq': this.eq = new globalThis.FableParametricEq(sampleRate); break;
      case 'ott': this.ott = new globalThis.FableOttCompressor(sampleRate); break;
      case 'comp': this.comp = new globalThis.FableCompressor(sampleRate); break;
      case 'drive':
        this.driveK = 1; this.drivePre = 1; this.driveNorm = 1;
        this.driveWet = new Smooth(); this.driveDry = new Smooth();
        this.driveWet.setTime(0.02); this.driveDry.setTime(0.02); this.driveDry.snap(1);
        this.up1 = [new HalfBandFir(HB1_TAPS, 6), new HalfBandFir(HB1_TAPS, 6)];
        this.up2 = [new HalfBandFir(HB2_TAPS, 6), new HalfBandFir(HB2_TAPS, 6)];
        this.dn2 = [new HalfBandFir(HB2_TAPS, 6), new HalfBandFir(HB2_TAPS, 6)];
        this.dn1 = [new HalfBandFir(HB1_TAPS, 6), new HalfBandFir(HB1_TAPS, 6)];
        this.dry = [new DelayLine(DRIVE_LATENCY + 4), new DelayLine(DRIVE_LATENCY + 4)];
        this.color = [new globalThis.FableDriveColor(sampleRate), new globalThis.FableDriveColor(sampleRate)];
        this.osIn = new Float64Array(128); this.osX2 = new Float64Array(256);
        this.osX4 = new Float64Array(512); this.osY2 = new Float64Array(256);
        this.dryBuf = [new Float64Array(128), new Float64Array(128)];
        this.wetBuf = [new Float64Array(128), new Float64Array(128)];
        this.driveSilenced = false;
        break;
      case 'lab':
        this.lab = new globalThis.FableLabFx(sampleRate);
        this.labSettings = { ...this.lab.settings };
        break;
      case 'chorus':
        this.chPhase = 0; this.chRate = 0.6; this.chDepth = 0.5;
        this.chWet = new Smooth(); this.chDry = new Smooth();
        this.chWet.setTime(0.02); this.chDry.setTime(0.02); this.chDry.snap(1);
        this.chDl1 = new DelayLine((0.05 * sampleRate) | 0);
        this.chDl2 = new DelayLine((0.05 * sampleRate) | 0);
        this.chorusOff = false; this.chorusGated = false;
        break;
      case 'echo':
        this.dlTime = new Smooth(); this.dlFb = new Smooth();
        this.dlWet = new Smooth(); this.dlDry = new Smooth();
        for (const s of [this.dlFb, this.dlWet, this.dlDry]) s.setTime(0.02);
        this.dlTime.setTime(0.08); this.dlDry.snap(1);
        this.dlL = new DelayLine(((2 * sampleRate) | 0) + 4);
        this.dlR = new DelayLine(((2 * sampleRate) | 0) + 4);
        this.dlDamp = new Biquad(); this.dlDampR = new Biquad();
        this.dlHpL = new Biquad(); this.dlHpR = new Biquad();
        this.dlHpL.highpass(45, 0.707); this.dlHpR.highpass(45, 0.707);
        this.dlDamp.lowpass(4500, 0.707); this.dlDampR.lowpass(4500, 0.707);
        this.dlTone = 4500; this.dlToneTarget = 4500;
        this.dlSat = new Smooth(); this.dlWow = new Smooth(); this.dlFlutter = new Smooth();
        this.dlWidth = new Smooth(); this.dlMode = new Smooth();
        for (const s of [this.dlSat, this.dlWow, this.dlFlutter, this.dlWidth, this.dlMode]) s.setTime(0.03);
        this.dlWidth.snap(1);
        this.tapeClock = 0; this.dlDriftL = 0; this.dlDriftR = 0; this.delayInitialized = false;
        this.delayOff = false; this.delayGated = false;
        break;
      case 'reverb':
        this.combL = []; this.combR = []; this.apL = []; this.apR = [];
        for (let i = 0; i < 8; i++) {
          this.combL.push(new FvComb((FV_COMB_TUNE[i] * scale) | 0));
          this.combR.push(new FvComb(((FV_COMB_TUNE[i] + FV_SPREAD) * scale) | 0));
        }
        for (let i = 0; i < 4; i++) {
          this.apL.push(new FvAllpass((FV_AP_TUNE[i] * scale) | 0));
          this.apR.push(new FvAllpass(((FV_AP_TUNE[i] + FV_SPREAD) * scale) | 0));
        }
        this.verbWet = new Smooth(); this.verbDry = new Smooth();
        this.verbWet.setTime(0.02); this.verbDry.setTime(0.02); this.verbDry.snap(1);
        this.verbOff = false; this.verbGated = false;
        break;
    }
    this.meterOn = false; this.meterSamples = 0; this.meterEnergy = new Float64Array(3); this.meterReduction = 0;
  }

  merge(params) {
    for (const key of Object.keys(params)) {
      const v = params[key];
      if (typeof v === 'number' && Number.isFinite(v)) this.p[key] = v;
    }
  }

  get(key, fallback = 0) { const v = this.p[key]; return v === undefined ? fallback : v; }

  apply() {
    const p = this.p, on = this.enabled;
    const onKey = ON_PARAM[this.kind];
    if (onKey) p[onKey] = on ? 1 : 0;
    switch (this.kind) {
      case 'eq': this.eq.setParams((key) => p[key]); break;
      case 'ott':
        this.ott.setParams(on, this.get('fx.ott.depth', 0.35), this.get('fx.ott.time', 1), this.get('fx.ott.up', 1), this.get('fx.ott.down', 1));
        break;
      case 'comp':
        this.comp.setParams(on, this.get('fx.comp.thr', -18), this.get('fx.comp.att', 0.003), this.get('fx.comp.rel', 0.25), this.get('fx.comp.ratio', 4));
        // A standalone insert has no key bus.
        this.comp.setKey(false, this.get('fx.comp.schp', 20));
        break;
      case 'drive': {
        const amt = this.get('fx.drive.amt', 0.3);
        this.drivePre = 1 + amt * 2;
        this.driveK = 1 + amt * 12;
        this.driveNorm = 1 / (this.drivePre * Math.tanh(this.driveK));
        this.driveWet.target = mixGate(on, this.get('fx.drive.mix', 1), true);
        this.driveDry.target = mixGate(on, this.get('fx.drive.mix', 1), false);
        for (const c of this.color) c.setParams(this.get('fx.drive.type', 0), this.get('fx.drive.tone', 0));
        break;
      }
      case 'lab': {
        const lab = this.labSettings;
        for (const [id, key, flag] of LAB_KEYS) {
          const v = this.get(id, lab[key] === true ? 1 : lab[key] === false ? 0 : lab[key]);
          lab[key] = flag ? on && v > 0.5 : (key === 'resoChord' || key === 'glitchDiv' ? Math.round(v) : v);
        }
        this.lab.setParams(lab, this.bpm);
        break;
      }
      case 'chorus':
        this.chRate = this.get('fx.chorus.rate', 0.6);
        this.chDepth = this.get('fx.chorus.depth', 0.5);
        this.chorusOff = !on;
        this.chWet.target = mixGate(on, this.get('fx.chorus.mix', 0.5) * 0.8, true);
        this.chDry.target = mixGate(on, this.get('fx.chorus.mix', 0.5) * 0.8, false);
        break;
      case 'echo': {
        const division = ECHO_DIVISIONS[Math.max(0, Math.min(5, this.get('fx.delay.div', 3) | 0))];
        const synced = this.get('fx.delay.sync', 0) > 0.5;
        this.dlTime.target = Math.max(0.02, Math.min(1.5, synced ? 60 / Math.max(1, this.bpm) * division : this.get('fx.delay.time', 0.36)));
        if (!this.delayInitialized) { this.dlTime.snap(this.dlTime.target); this.delayInitialized = true; }
        this.dlFb.target = Math.max(0, Math.min(0.92, this.get('fx.delay.fb', 0.35)));
        this.dlToneTarget = Math.max(400, Math.min(12000, this.get('fx.delay.tone', 4500) || 4500));
        this.dlSat.target = Math.max(0, Math.min(1, this.get('fx.delay.sat', 0.2)));
        this.dlWow.target = Math.max(0, Math.min(1, this.get('fx.delay.wow', 0.18)));
        this.dlFlutter.target = Math.max(0, Math.min(1, this.get('fx.delay.flutter', 0.12)));
        this.dlWidth.target = Math.max(0, Math.min(1, this.get('fx.delay.width', 1)));
        this.dlMode.target = this.get('fx.delay.mode', 0) > 0.5 ? 1 : 0;
        this.delayOff = !on;
        this.dlWet.target = mixGate(on, this.get('fx.delay.mix', 0.3) * 0.85, true);
        this.dlDry.target = mixGate(on, this.get('fx.delay.mix', 0.3) * 0.85, false);
        break;
      }
      case 'reverb': {
        const size = this.get('fx.reverb.size', 0.5);
        const room = 0.7 + size * 0.28, damp = 0.4 - size * 0.2;
        for (let i = 0; i < 8; i++) {
          this.combL[i].feedback = this.combR[i].feedback = room;
          this.combL[i].damp1 = this.combR[i].damp1 = damp;
          this.combL[i].damp2 = this.combR[i].damp2 = 1 - damp;
        }
        this.verbOff = !on;
        this.verbWet.target = mixGate(on, this.get('fx.reverb.mix', 0.3) * 0.9, true);
        this.verbDry.target = mixGate(on, this.get('fx.reverb.mix', 0.3) * 0.9, false);
        break;
      }
    }
  }

  onMsg(d) {
    if (!d || typeof d !== 'object') return;
    if (d.t === 'params') {
      if (d.params) this.merge(d.params);
      if (typeof d.enabled === 'boolean') this.enabled = d.enabled;
      if (Number.isFinite(d.bpm) && d.bpm > 0) this.bpm = d.bpm;
      this.apply();
    } else if (d.t === 'dynamics' || d.t === 'echo' || d.t === 'reverb') {
      this.meterOn = !!d.on;
      this.meterEnergy.fill(0); this.meterSamples = 0; this.meterReduction = 0;
    }
  }

  grow(n) {
    if (this.L.length >= n) return;
    this.L = new Float64Array(n); this.R = new Float64Array(n);
    if (this.kind === 'drive') {
      this.osIn = new Float64Array(n); this.osX2 = new Float64Array(2 * n);
      this.osX4 = new Float64Array(4 * n); this.osY2 = new Float64Array(2 * n);
      this.dryBuf = [new Float64Array(n), new Float64Array(n)];
      this.wetBuf = [new Float64Array(n), new Float64Array(n)];
    }
  }

  driveBlock(ch, n) {
    this.up1[ch].interpBlock(this.osIn, this.osX2, n);
    this.up2[ch].interpBlock(this.osX2, this.osX4, 2 * n);
    const color = this.color[ch], K = this.driveK, norm = this.driveNorm, m = 4 * n, x4 = this.osX4;
    for (let i = 0; i < m; i++) x4[i] = color.shape(x4[i], K, norm);
    this.dn2[ch].decimBlock(x4, this.osY2, 2 * n);
    this.dn1[ch].decimBlock(this.osY2, this.wetBuf[ch], n);
  }

  processDrive(L, R, n) {
    const silent = this.driveWet.target === 0 && Math.abs(this.driveWet.cur) < 1e-6;
    if (silent && !this.driveSilenced) {
      this.driveWet.snap(0); this.driveDry.snap(1);
      for (const f of [...this.up1, ...this.up2, ...this.dn2, ...this.dn1]) f.reset();
      for (const c of this.color) c.reset();
    }
    this.driveSilenced = silent;
    const io = [L, R];
    for (let ch = 0; ch < 2; ch++) this.dry[ch].blockRead(io[ch], this.dryBuf[ch], n, DRIVE_LATENCY + 1);
    if (silent) {
      for (let i = 0; i < n; i++) { L[i] = this.dryBuf[0][i]; R[i] = this.dryBuf[1][i]; }
      return;
    }
    const pre = this.drivePre;
    for (let ch = 0; ch < 2; ch++) {
      for (let i = 0; i < n; i++) this.osIn[i] = pre * io[ch][i];
      this.driveBlock(ch, n);
    }
    for (let i = 0; i < n; i++) {
      const wet = this.driveWet.next(), dry = this.driveDry.next();
      L[i] = dry * this.dryBuf[0][i] + wet * this.color[0].processTone(this.wetBuf[0][i]);
      R[i] = dry * this.dryBuf[1][i] + wet * this.color[1].processTone(this.wetBuf[1][i]);
    }
  }

  processChorus(L, R, n) {
    const gate = this.chorusOff && this.chWet.target === 0 && Math.abs(this.chWet.cur) < 1e-6;
    if (gate && !this.chorusGated) { this.chWet.snap(0); this.chDry.snap(1); this.chDl1.reset(); this.chDl2.reset(); }
    this.chorusGated = gate;
    if (gate) return;
    for (let i = 0; i < n; i++) {
      let l = L[i], r = R[i];
      this.chPhase += this.chRate / sampleRate;
      if (this.chPhase >= 1) this.chPhase -= 1;
      const lfo = Math.sin(TWO_PI * this.chPhase);
      const depth = 0.0008 + this.chDepth * 0.0045;
      const mono = 0.5 * (l + r);
      this.chDl1.write(mono); this.chDl2.write(mono);
      const c1 = this.chDl1.readHermite((0.012 + depth * lfo) * sampleRate);
      const c2 = this.chDl2.readHermite((0.017 - depth * 0.8 * lfo) * sampleRate);
      const wet = this.chWet.next(), dry = this.chDry.next();
      l = dry * l + wet * c1; r = dry * r + wet * c2;
      L[i] = l; R[i] = r;
    }
  }

  processEcho(L, R, n) {
    const gate = this.delayOff && this.dlWet.target === 0 && Math.abs(this.dlWet.cur) < 1e-6;
    if (gate && !this.delayGated) {
      this.dlWet.snap(0); this.dlDry.snap(1); this.dlL.reset(); this.dlR.reset();
      this.dlDamp.reset(); this.dlDampR.reset(); this.dlHpL.reset(); this.dlHpR.reset();
      this.dlDriftL = this.dlDriftR = 0;
    }
    this.delayGated = gate;
    const meter = this.meterOn, energy = this.meterEnergy;
    if (gate) {
      if (meter) { energy[0] += stereoEnergy(L, R, n); this.meterSamples += n; }
      return;
    }
    this.dlTone += (this.dlToneTarget - this.dlTone) * (1 - Math.exp(-n / (0.03 * sampleRate)));
    this.dlDamp.lowpass(this.dlTone, 0.707); this.dlDampR.lowpass(this.dlTone, 0.707);
    for (let i = 0; i < n; i++) {
      let l = L[i], r = R[i];
      if (meter) energy[0] += 0.5 * (l * l + r * r);
      const dt = this.dlTime.next();
      const fb = this.dlFb.next();
      const wow = this.dlWow.next() * 0.0025, flutter = this.dlFlutter.next() * 0.00022;
      const t = this.tapeClock / sampleRate;
      this.dlDriftL = wow * (0.72 * Math.sin(TWO_PI * 0.23 * t) + 0.28 * Math.sin(TWO_PI * 0.37 * t))
        + flutter * Math.sin(TWO_PI * 6.7 * t);
      this.dlDriftR = wow * (0.72 * Math.sin(TWO_PI * 0.23 * t + 1.8) + 0.28 * Math.sin(TWO_PI * 0.41 * t + 0.7))
        + flutter * Math.sin(TWO_PI * 8.3 * t + 1.1);
      this.tapeClock++;
      const dL = this.dlL.readHermite(Math.max(0.005, dt + this.dlDriftL) * sampleRate);
      const dR = this.dlR.readHermite(Math.max(0.005, dt + this.dlDriftR) * sampleRate);
      const mono = 0.5 * (l + r);
      const mode = this.dlMode.next(), saturation = this.dlSat.next(), k = 1 + saturation * 4;
      const recordL = mono + mode * (l - mono) + fb * (dR + mode * (dL - dR));
      const recordR = mode * r + fb * (dL + mode * (dR - dL));
      const feedbackL = this.dlDamp.process(this.dlHpL.process(recordL + saturation * (Math.tanh(k * recordL) / k - recordL)));
      const feedbackR = this.dlDampR.process(this.dlHpR.process(recordR + saturation * (Math.tanh(k * recordR) / k - recordR)));
      const feedbackGain = this.feedbackGuard.gainFor(feedbackL, feedbackR);
      this.dlL.write(feedbackL * feedbackGain);
      this.dlR.write(feedbackR * feedbackGain);
      const wet = this.dlWet.next(), dry = this.dlDry.next();
      const mid = 0.5 * (dL + dR), side = 0.5 * (dL - dR) * this.dlWidth.next();
      const echoL = wet * (mid + side), echoR = wet * (mid - side);
      if (meter) { energy[1] += echoL * echoL; energy[2] += echoR * echoR; }
      l = dry * l + echoL; r = dry * r + echoR;
      L[i] = l; R[i] = r;
    }
    if (meter) this.meterSamples += n;
  }

  processReverb(L, R, n) {
    const gate = this.verbOff && this.verbWet.target === 0 && Math.abs(this.verbWet.cur) < 1e-6;
    if (gate && !this.verbGated) {
      this.verbWet.snap(0); this.verbDry.snap(1);
      for (const c of [...this.combL, ...this.combR, ...this.apL, ...this.apR]) c.reset();
    }
    this.verbGated = gate;
    const meter = this.meterOn, energy = this.meterEnergy;
    if (gate) { if (meter) this.meterSamples += n; return; }
    const combL = this.combL, combR = this.combR, apL = this.apL, apR = this.apR;
    for (let i = 0; i < n; i++) {
      const l = L[i], r = R[i];
      const input = (l + r) * 0.015;
      let outL = 0, outR = 0;
      for (let c = 0; c < 8; c++) { outL += combL[c].process(input); outR += combR[c].process(input); }
      for (let a = 0; a < 4; a++) { outL = apL[a].process(outL); outR = apR[a].process(outR); }
      const wet = this.verbWet.next(), dry = this.verbDry.next();
      if (meter) {
        const wetL = wet * outL, wetR = wet * outR;
        energy[0] += wetL * wetL; energy[1] += wetR * wetR; energy[2] += wetL * wetR;
      }
      L[i] = dry * l + wet * outL; R[i] = dry * r + wet * outR;
    }
    if (meter) this.meterSamples += n;
  }

  processDynamics(L, R, n) {
    const meter = this.meterOn, energy = this.meterEnergy;
    if (meter) energy[0] += stereoEnergy(L, R, n);
    if (this.kind === 'ott') this.ott.process(L, R, n);
    else {
      this.comp.process(L, R, n, null);
      if (meter && this.comp.wetTarget && this.comp.env > 1e-7)
        this.meterReduction = Math.max(this.meterReduction, -20 * Math.log10(Math.max(1e-9, this.comp.gain)));
    }
    if (meter) { energy[1] += stereoEnergy(L, R, n); this.meterSamples += n; }
  }

  report() {
    if (!this.meterOn || this.meterSamples < sampleRate / 30) return;
    const energy = this.meterEnergy, count = this.meterSamples;
    const power = index => Math.max(-90, 10 * Math.log10(Math.max(1e-9, energy[index] / count)));
    if (this.kind === 'reverb') {
      const product = Math.sqrt(energy[0] * energy[1]);
      this.port.postMessage({ t: 'reverb', left: power(0), right: power(1),
        correlation: product > count * 1e-9 ? Math.max(-1, Math.min(1, energy[2] / product)) : 0 });
    } else if (this.kind === 'echo') {
      this.port.postMessage({ t: 'echo', input: power(0), left: power(1), right: power(2),
        time: this.dlTime.cur, driftL: this.dlDriftL, driftR: this.dlDriftR });
    } else if (this.kind === 'ott' || this.kind === 'comp') {
      const idleOtt = { input: -90, output: -90, levels: [-90, -90, -90], gains: [0, 0, 0], makeup: 0 };
      const idleComp = { input: -90, output: -90, reduction: 0, makeup: 0 };
      let ott = idleOtt, comp = idleComp;
      if (this.kind === 'ott') {
        const o = this.ott, active = o.depthTarget > 0;
        ott = {
          input: power(0), output: power(1),
          levels: Array.from(o.env, value => active ? dbOf(value) : -90),
          gains: Array.from(o.gain, (value, i) => active && o.env[i] > 1e-7 ? dbOf(value) : 0),
          makeup: active ? dbOf(o.autoGain.gain) : 0,
        };
      } else {
        const c = this.comp;
        comp = { input: power(0), output: power(1), reduction: this.meterReduction, trace: c.takeTrace(),
          makeup: c.wetTarget ? dbOf(c.autoGain.gain) : 0 };
      }
      this.port.postMessage({ t: 'dynamics', ott, comp });
    }
    energy.fill(0); this.meterSamples = 0; this.meterReduction = 0;
  }

  process(inputs, outputs) {
    const input = inputs[0], output = outputs[0];
    if (!output || output.length === 0) return true;
    const n = output[0].length;
    this.grow(n);
    const L = this.L, R = this.R;
    const inL = input && input[0], inR = input && (input[1] || input[0]);
    for (let i = 0; i < n; i++) { L[i] = inL ? inL[i] : 0; R[i] = inR ? inR[i] : 0; }
    switch (this.kind) {
      case 'eq': this.eq.process(L, R, n); break;
      case 'ott': case 'comp': this.processDynamics(L, R, n); break;
      case 'drive': this.processDrive(L, R, n); break;
      case 'lab':
        if (this.lab.active()) {
          for (let i = 0; i < n; i++) {
            this.lab.processSample(Math.fround(L[i]), Math.fround(R[i]));
            L[i] = this.lab.out[0]; R[i] = this.lab.out[1];
          }
        }
        break;
      case 'chorus': this.processChorus(L, R, n); break;
      case 'echo': this.processEcho(L, R, n); break;
      case 'reverb': this.processReverb(L, R, n); break;
    }
    this.guard.process(L, R, n);
    const outL = output[0], outR = output[1] || output[0];
    for (let i = 0; i < n; i++) { outL[i] = L[i]; outR[i] = R[i]; }
    this.report();
    return true;
  }
}

registerProcessor('fable-fx', FableFxProcessor);
