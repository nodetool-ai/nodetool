// LAB effect stages for the WT-1 worklet: CRUSH -> RESO -> SHIFT -> SPRAY ->
// GLITCH. A line-for-line port of juce/source/dsp/LabFx.h (the reference;
// read its header for what each stage does and why). Keep the two in step:
// buffers are Float32Array like the plugin's float buffers, arithmetic is
// double on both sides, and the RNG is the same xorshift32, so the web and
// native outputs agree to rounding (src/engine/lab.test.ts checks the
// native fixture). Load with audioWorklet.addModule before worklet.js.
// Allocation-free after construction.

const LAB_PI = 3.141592653589793;

// C++ std::round: halves away from zero (Math.round rounds them up).
const labRound = (x) => (x < 0 ? -Math.round(-x) : Math.round(x));
const labClamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

// RESO chord intervals (semitones above NOTE), in fx.reso.chord order.
const LAB_RESO_CHORDS = [
  [0, 12, 24, 36], [0, 7, 12, 19], [0, 3, 7, 10], [0, 4, 7, 14], [0, 5, 7, 12], [0, 6, 12, 18],
];
// GLITCH slice lengths in beats, in fx.glitch.div order (1/4 .. 1/64).
const LAB_GLITCH_BEATS = [1, 0.5, 0.25, 0.125, 0.0625];

class LabRng {
  constructor() { this.s = 0x9e3779b9; }
  uni() {
    let s = this.s;
    s ^= s << 13; s ^= s >>> 17; s ^= s << 5;
    this.s = s >>> 0;
    return (this.s >>> 8) * (1 / 16777216);
  }
  bi() { return this.uni() * 2 - 1; }
}

class LabGlide {
  constructor() { this.cur = 0; this.target = 0; this.coef = 0.001; }
  next() { this.cur += (this.target - this.cur) * this.coef; return this.cur; }
  snap() { this.cur = this.target; }
}

class LabBiquad {
  constructor() { this.b0 = 1; this.b1 = 0; this.b2 = 0; this.a1 = 0; this.a2 = 0; this.z1 = 0; this.z2 = 0; }
  set(high, hz, q, sr) {
    const w = 2 * LAB_PI * hz / sr, c = Math.cos(w), al = Math.sin(w) / (2 * q), a0 = 1 + al;
    const k = high ? (1 + c) / 2 : (1 - c) / 2;
    this.b0 = k / a0; this.b1 = (high ? -2 * k : 2 * k) / a0; this.b2 = k / a0;
    this.a1 = -2 * c / a0; this.a2 = (1 - al) / a0;
  }
  process(x) {
    const y = this.b0 * x + this.z1;
    this.z1 = this.b1 * x - this.a1 * y + this.z2;
    this.z2 = this.b2 * x - this.a2 * y;
    return y;
  }
  reset() { this.z1 = this.z2 = 0; }
}
const LAB_Q4 = [0.5411961001461970, 1.3065629648763766];
const LAB_Q8 = [0.5097955791041592, 0.6013448869350453, 0.8999762231364156, 2.5629154477415055];
class LabButter {
  constructor(order) { this.q = order === 8 ? LAB_Q8 : LAB_Q4; this.s = this.q.map(() => new LabBiquad()); }
  set(high, hz, sr) { for (let i = 0; i < this.s.length; i++) this.s[i].set(high, hz, this.q[i], sr); }
  process(x) { for (let i = 0; i < this.s.length; i++) x = this.s[i].process(x); return x; }
  reset() { for (const b of this.s) b.reset(); }
}

// Power-of-two circular float buffer addressed by absolute sample position.
class LabRing {
  constructor(minSize) {
    let n = 1; while (n < minSize) n <<= 1;
    this.b = new Float32Array(n); this.mask = n - 1; this.w = 0;
  }
  clear() { this.b.fill(0); this.w = 0; }
  write(x) { this.b[this.w & this.mask] = x; this.w++; }
  at(i) { return this.b[i & this.mask]; }
  hermite(p) {
    const fl = Math.floor(p), t = p - fl;
    const y0 = this.at(fl - 1), y1 = this.at(fl), y2 = this.at(fl + 1), y3 = this.at(fl + 2);
    const c1 = 0.5 * (y2 - y0), c2 = y0 - 2.5 * y1 + 2 * y2 - 0.5 * y3, c3 = 0.5 * (y3 - y0) + 1.5 * (y1 - y2);
    return ((c3 * t + c2) * t + c1) * t + y1;
  }
}

// Kaiser-windowed sinc (beta 7.5), 8 zero crossings each side, 512 points per crossing.
const LAB_SINC_HALF = 8, LAB_SINC_RES = 512;
function labBessel0(x) {
  let sum = 1, term = 1;
  for (let k = 1; k < 50; k++) { term *= (x / (2 * k)) * (x / (2 * k)); sum += term; if (term < 1e-15 * sum) break; }
  return sum;
}
const LAB_SINC = (() => {
  const beta = 7.5, norm = labBessel0(beta), h = new Float64Array(LAB_SINC_HALF * LAB_SINC_RES + 2);
  for (let i = 0; i <= LAB_SINC_HALF * LAB_SINC_RES; i++) {
    const x = i / LAB_SINC_RES, r = x / LAB_SINC_HALF;
    const sinc = i === 0 ? 1 : Math.sin(LAB_PI * x) / (LAB_PI * x);
    h[i] = sinc * labBessel0(beta * Math.sqrt(Math.max(0, 1 - r * r))) / norm;
  }
  return h;
})();
function labSincRead(ring, p, fc) {
  const half = Math.ceil(LAB_SINC_HALF / fc);
  const fl = Math.floor(p), frac = p - fl, end = LAB_SINC_HALF * LAB_SINC_RES;
  let sum = 0;
  for (let k = 1 - half; k <= half; k++) {
    const x = Math.abs((k - frac) * fc) * LAB_SINC_RES, i = Math.floor(x);
    if (i >= end) continue;
    sum += (LAB_SINC[i] + (x - i) * (LAB_SINC[i + 1] - LAB_SINC[i])) * ring.at(fl + k);
  }
  return sum * fc;
}

// Loop delay for a damped comb that resonates exactly at hz (see LabFx.h).
function labCombDelay(hz, sr, damp) {
  const w = 2 * LAB_PI * hz / sr, b = 1 - damp;
  const tauLp = Math.atan2(b * Math.sin(w), 1 - b * Math.cos(w)) / w;
  let d = sr / hz - tauLp;
  for (let it = 0; it < 4; it++) {
    const t = Math.ceil(d) - d; // Hermite fraction at the read position
    const c = [-0.5 * t + t * t - 0.5 * t * t * t, 1 - 2.5 * t * t + 1.5 * t * t * t,
      0.5 * t + 2 * t * t - 1.5 * t * t * t, -0.5 * t * t + 0.5 * t * t * t];
    let re = 0, im = 0;
    for (let k = -1; k <= 2; k++) { const ph = -w * (t - k); re += c[k + 1] * Math.cos(ph); im += c[k + 1] * Math.sin(ph); }
    d = sr / hz - tauLp + Math.atan2(im, re) / w;
  }
  return d;
}

// Niemitalo's 90-degree allpass pair: two four-stage chains.
const LAB_HA = [0.6923878, 0.9360654322959, 0.9882295226860, 0.9987488452737].map(v => v * v);
const LAB_HB = [0.4021921162426, 0.8561710882420, 0.9722909545651, 0.9952884791278].map(v => v * v);
class LabHilbert {
  constructor() { this.xa = new Float64Array(8); this.ya = new Float64Array(8); this.xb = new Float64Array(8); this.yb = new Float64Array(8); this.delayed = 0; this.re = 0; this.im = 0; }
  reset() { this.xa.fill(0); this.ya.fill(0); this.xb.fill(0); this.yb.fill(0); this.delayed = 0; }
  static chain(k, xs, ys, x) {
    for (let i = 0; i < 4; i++) {
      const j = 2 * i;
      const y = k[i] * (x + ys[j + 1]) - xs[j + 1];
      xs[j + 1] = xs[j]; xs[j] = x;
      ys[j + 1] = ys[j]; ys[j] = y;
      x = y;
    }
    return x;
  }
  process(x) {
    this.re = this.delayed; this.delayed = LabHilbert.chain(LAB_HA, this.xa, this.ya, x);
    this.im = LabHilbert.chain(LAB_HB, this.xb, this.yb, x);
  }
}

const LAB_DAMP = 0.65; // RESO loop damping (one-pole coefficient)
const LAB_COEF_CHUNK = 32;

class LabWet {
  constructor() { this.cur = 0; this.target = 0; this.coef = 0.001; this.cleared = true; }
  live() { return this.target > 0 || this.cur > 1e-5; }
}

class LabFx {
  constructor(sr) {
    this.sr = sr;
    this.bpm = 120; this.beat = 0; this.patchBpm = 120; this.tempoOverride = 0;
    this.rng = new LabRng();
    this.crushWet = new LabWet(); this.resoWet = new LabWet(); this.shiftWet = new LabWet();
    this.sprayWet = new LabWet(); this.glitchWet = new LabWet();
    this.wets = [this.crushWet, this.resoWet, this.shiftWet, this.sprayWet, this.glitchWet];
    this.crushBits = new LabGlide(); this.crushRate = new LabGlide(); this.resoFb = new LabGlide();
    this.shiftHz = new LabGlide(); this.shiftFb = new LabGlide(); this.shiftSpread = new LabGlide();
    this.glides = [this.crushBits, this.crushRate, this.resoFb, this.shiftHz, this.shiftFb, this.shiftSpread];
    const glide = 1 - Math.exp(-1 / (0.02 * sr));
    for (const w of this.wets) w.coef = glide;
    for (const g of this.glides) g.coef = glide;
    this.combs = [0, 1, 2, 3].map(() => ({ ring: new LabRing(Math.trunc(sr / 30) + 8), lp: 0, d: 100, target: 100 }));
    this.shiftCh = [0, 1].map(() => ({
      ring: new LabRing(Math.trunc(sr * 0.4) + 8), hilbert: new LabHilbert(),
      lp: new LabButter(8), hp: new LabButter(8), phase: 0, dcX: 0, dcY: 0, hz: 1e9,
    }));
    this.spray = new LabRing(Math.trunc(sr * 2.5)); this.sprayLp = new LabButter(8);
    this.grains = Array.from({ length: 24 }, () => ({ on: false, pos: 0, inc: 1, gl: 1, gr: 1, len: 1, age: 0 }));
    this.glitchBuf = [new LabRing(Math.trunc(sr * 4)), new LabRing(Math.trunc(sr * 4))];
    this.head = { live: true, pos: 0, rate: 1 }; this.tail = { live: true, pos: 0, rate: 1 };
    this.dcCoef = Math.exp(-2 * LAB_PI * 20 / sr);
    this.fade = Math.max(8, labRound(0.002 * sr));
    this.gateStep = 1 / (0.006 * sr);
    this.out = [0, 0];
    this.combOut = new Float64Array(4);
    this.sprayCut = -1;
    this.crushRatio = 0;
    this.shiftDelay = 6000;
    this.settings = {
      crushOn: false, crushBits: 6, crushRate: 6000, crushChaos: 0.2, crushMix: 1,
      resoOn: false, resoNote: 48, resoChord: 2, resoDecay: 0.7, resoMix: 0.5,
      shiftOn: false, shiftHz: 60, shiftFb: 0.5, shiftSpread: 0.5, shiftMix: 0.5,
      sprayOn: false, sprayPitch: 12, sprayDensity: 12, sprayScatter: 0.4, sprayMix: 0.45,
      glitchOn: false, glitchDiv: 2, glitchChance: 0.35, glitchDrift: 0, glitchMix: 1,
    };
    this.setParams(this.settings, this.patchBpm);
    this.reset();
  }

  reset() {
    for (const w of this.wets) { w.cur = 0; w.cleared = true; }
    this.clearCrush(); this.clearReso(); this.clearShift(); this.clearSpray(); this.clearGlitch();
    this.beat = 0;
    for (const g of this.glides) g.snap();
    for (const c of this.combs) c.d = c.target;
  }

  setParams(s, bpm) {
    const sr = this.sr;
    this.settings = s; this.patchBpm = bpm;
    if (this.tempoOverride > 0) bpm = this.tempoOverride;
    this.bpm = labClamp(Number.isFinite(bpm) && bpm > 1 ? bpm : 120, 40, 300);
    this.crushWet.target = s.crushOn ? labClamp(s.crushMix, 0, 1) : 0;
    this.resoWet.target = s.resoOn ? labClamp(s.resoMix, 0, 1) : 0;
    this.shiftWet.target = s.shiftOn ? labClamp(s.shiftMix, 0, 1) : 0;
    this.sprayWet.target = s.sprayOn ? labClamp(s.sprayMix, 0, 1) : 0;
    this.glitchWet.target = s.glitchOn ? labClamp(s.glitchMix, 0, 1) : 0;

    this.crushBits.target = labClamp(s.crushBits, 1, 16);
    this.crushRate.target = labClamp(s.crushRate, 50, sr);

    const chord = LAB_RESO_CHORDS[labClamp(s.resoChord, 0, 5)];
    const maxDelay = this.combs[0].ring.b.length - 8;
    for (let i = 0; i < 4; i++) {
      const hz = 440 * Math.pow(2, (labClamp(s.resoNote, 24, 84) + chord[i] - 69) / 12);
      this.combs[i].target = labClamp(labCombDelay(hz, sr, LAB_DAMP), 4, Math.max(4, maxDelay));
    }
    this.resoFb.target = 0.6 + 0.395 * labClamp(s.resoDecay, 0, 1);

    this.shiftHz.target = labClamp(s.shiftHz, -1000, 1000);
    this.shiftFb.target = labClamp(s.shiftFb, 0, 0.9);
    this.shiftSpread.target = labClamp(s.shiftSpread, 0, 1);
    this.shiftDelay = Math.min(15 / this.bpm * sr, Math.max(8, this.shiftCh[0].ring.b.length - 8)); // a 1/16 note

    this.sprayRatio = Math.pow(2, labClamp(s.sprayPitch, -24, 24) / 12);
    const density = labClamp(s.sprayDensity, 1, 40);
    this.sprayInterval = sr / density;
    this.sprayLen = labClamp(3 / density, 0.04, 0.3) * sr;
    this.sprayNorm = 1 / Math.sqrt(Math.max(1, density * this.sprayLen / sr));
    const maxRatio = this.sprayRatio * Math.pow(2, labClamp(s.sprayScatter, 0, 1) * 0.3 / 12);
    const cut = Math.min(0.45, 0.45 / maxRatio) * sr;
    if (Math.abs(cut - this.sprayCut) > 1e-6) { this.sprayCut = cut; this.sprayLp.set(false, cut, sr); }
  }

  setTransport(ppq, playing) { if (playing && Number.isFinite(ppq)) this.beat = ppq; }
  setTempoOverride(bpm) {
    const next = Number.isFinite(bpm) && bpm > 1 ? bpm : 0;
    if (Math.abs(next - this.tempoOverride) > 1e-9) { this.tempoOverride = next; this.setParams(this.settings, this.patchBpm); }
  }

  active() {
    for (const w of this.wets) if (w.live() || !w.cleared) return true;
    return false;
  }

  // Processes one stereo sample; the result is in this.out.
  processSample(l, r) {
    const out = this.out;
    out[0] = l; out[1] = r;
    this.stage(this.crushWet, 0); this.stage(this.resoWet, 1); this.stage(this.shiftWet, 2);
    this.stage(this.sprayWet, 3); this.stage(this.glitchWet, 4);
    this.beat += this.bpm / 60 / this.sr;
  }

  stage(w, which) {
    const out = this.out;
    if (w.live()) {
      w.cleared = false;
      w.cur += (w.target - w.cur) * w.coef;
      const l = out[0], r = out[1];
      switch (which) {
        case 0: this.crush(l, r); break;
        case 1: this.reso(l, r); break;
        case 2: this.shift(l, r); break;
        case 3: this.sprayStage(l, r); break;
        default: this.glitch(l, r); break;
      }
      // the stage left its wet sample in out; blend back toward the dry input
      out[0] = l + w.cur * (out[0] - l); out[1] = r + w.cur * (out[1] - r);
    } else if (!w.cleared) {
      w.cur = 0; w.cleared = true;
      switch (which) {
        case 0: this.clearCrush(); break;
        case 1: this.clearReso(); break;
        case 2: this.clearShift(); break;
        case 3: this.clearSpray(); break;
        default: this.clearGlitch(); break;
      }
    }
  }

  // ---- CRUSH ----
  quantize(x, steps) {
    let y = labRound(x * steps) / steps;
    const chaos = this.settings.crushChaos;
    if (chaos > 0 && this.rng.uni() < chaos * 0.15) y += (this.rng.uni() < 0.5 ? -1 : 1) / steps;
    return labClamp(y, -1, 1);
  }
  crush(l, r) {
    const bits = this.crushBits.next(), inc = this.crushRate.next() / this.sr;
    let outL = this.crushL, outR = this.crushR;
    this.crushPhase += inc;
    if (this.crushPhase >= 1) {
      this.crushPhase -= 1;
      const ago = Math.min(1, this.crushPhase / inc); // the edge, in samples before now
      const steps = Math.pow(2, bits - 1);
      const newL = this.quantize(l + ago * (this.crushPrevL - l), steps);
      const newR = this.quantize(r + ago * (this.crushPrevR - r), steps);
      outL = this.crushL + ago * (newL - this.crushL); // box-filter the step across this sample
      outR = this.crushR + ago * (newR - this.crushR);
      this.crushL = newL; this.crushR = newR;
      const chaos = this.settings.crushChaos;
      if (chaos > 0) this.crushPhase -= chaos * 0.9 * this.rng.uni();
    }
    this.crushPrevL = l; this.crushPrevR = r;
    this.out[0] = outL; this.out[1] = outR;
  }
  clearCrush() { this.crushPhase = 1; this.crushL = this.crushR = this.crushPrevL = this.crushPrevR = 0; }

  // ---- RESO ----
  reso(l, r) {
    const x = 0.5 * (l + r), g = this.resoFb.next();
    // Energy-normalized excitation keeps long resonances audible.
    const excitation = Math.sqrt(1 - g * g);
    const o = this.combOut;
    for (let i = 0; i < 4; i++) {
      const c = this.combs[i];
      c.d += (c.target - c.d) * 0.0015;
      const y = c.ring.hermite(c.ring.w - c.d);
      c.lp += LAB_DAMP * (y - c.lp);
      c.ring.write(Math.tanh(x * excitation + g * c.lp));
      o[i] = y;
    }
    this.out[0] = 0.5 * (o[0] + o[2] + 0.5 * (o[1] + o[3]));
    this.out[1] = 0.5 * (o[1] + o[3] + 0.5 * (o[0] + o[2]));
  }
  clearReso() { for (const c of this.combs) { c.ring.clear(); c.lp = 0; c.d = c.target; } }

  // ---- SHIFT ----
  tuneShift(c, hz) {
    const sr = this.sr;
    const lpHz = labClamp(0.47 * sr - Math.max(0, hz), 500, 0.45 * sr);
    const hpHz = labClamp(hz < 0 ? -hz * 1.05 : 20, 20, 0.4 * sr);
    c.lp.set(false, lpHz, sr); c.hp.set(true, hpHz, sr);
    c.hz = hz;
  }
  shiftChannel(c, x, hz, fb) {
    const fed = x + fb * c.ring.hermite(c.ring.w - this.shiftDelay);
    c.hilbert.process(c.hp.process(c.lp.process(fed)));
    c.phase += hz / this.sr; c.phase -= Math.floor(c.phase);
    const a = 2 * LAB_PI * c.phase;
    const y = c.hilbert.re * Math.cos(a) + c.hilbert.im * Math.sin(a); // upper sideband: +hz shifts up
    c.dcY = y - c.dcX + this.dcCoef * c.dcY; c.dcX = y; // DC-blocked, soft-clipped feedback
    c.ring.write(Math.tanh(c.dcY));
    return y;
  }
  shift(l, r) {
    const hz = this.shiftHz.next(), fb = this.shiftFb.next(), spread = this.shiftSpread.next();
    const hzR = hz * (1 - 2 * spread);
    if (--this.shiftTick <= 0) {
      this.shiftTick = LAB_COEF_CHUNK;
      if (Math.abs(hz - this.shiftCh[0].hz) > 0.01) this.tuneShift(this.shiftCh[0], hz);
      if (Math.abs(hzR - this.shiftCh[1].hz) > 0.01) this.tuneShift(this.shiftCh[1], hzR);
    }
    this.out[0] = this.shiftChannel(this.shiftCh[0], l, hz, fb);
    this.out[1] = this.shiftChannel(this.shiftCh[1], r, hzR, fb);
  }
  clearShift() {
    for (const c of this.shiftCh) {
      c.ring.clear(); c.hilbert.reset(); c.lp.reset(); c.hp.reset();
      c.phase = c.dcX = c.dcY = 0; c.hz = 1e9;
    }
    this.shiftTick = 0;
  }

  // ---- SPRAY ----
  spawnGrain() {
    for (const g of this.grains) {
      if (g.on) continue;
      const scatter = this.settings.sprayScatter;
      const ratio = this.sprayRatio * Math.pow(2, scatter * 0.3 * this.rng.bi() / 12);
      const reverse = this.rng.uni() < scatter * 0.35;
      g.len = Math.max(16, Math.trunc(this.sprayLen));
      g.inc = reverse ? -ratio : ratio;
      const behind = 64 + (reverse ? 0 : Math.max(0, g.len * (ratio - 1)))
        + scatter * this.rng.uni() * 0.8 * this.sr;
      g.pos = this.spray.w - behind;
      const pan = this.rng.bi() * Math.min(1, 0.3 + scatter);
      const a = (pan + 1) * 0.25 * LAB_PI;
      g.gl = Math.cos(a) * Math.SQRT2; g.gr = Math.sin(a) * Math.SQRT2;
      g.age = 0; g.on = true;
      return;
    }
  }
  sprayStage(l, r) {
    this.spray.write(this.sprayLp.process(0.5 * (l + r)));
    if (--this.sprayCountdown <= 0) {
      this.spawnGrain();
      this.sprayCountdown += this.sprayInterval * (0.5 + this.rng.uni());
    }
    let ol = 0, orr = 0;
    for (const g of this.grains) {
      if (!g.on) continue;
      const s = Math.sin(LAB_PI * g.age / g.len);
      const v = this.spray.hermite(g.pos) * s * s;
      ol += v * g.gl; orr += v * g.gr;
      g.pos += g.inc;
      if (++g.age >= g.len) g.on = false;
    }
    this.out[0] = ol * this.sprayNorm; this.out[1] = orr * this.sprayNorm;
  }
  clearSpray() {
    this.spray.clear(); this.sprayLp.reset();
    for (const g of this.grains) g.on = false;
    this.sprayCountdown = 0;
  }

  // ---- GLITCH ----
  readHead(h, ch, dry) {
    if (h.live) return dry;
    return labSincRead(this.glitchBuf[ch], h.pos, 0.94 * Math.min(1, 1 / h.rate));
  }
  setHead(h, live, pos, rate) { h.live = live; h.pos = pos; h.rate = rate; }
  spliceTo(live, pos, rate) {
    const t = this.tail, h = this.head;
    t.live = h.live; t.pos = h.pos; t.rate = h.rate;
    this.setHead(h, live, pos, rate);
    this.xfade = Math.trunc(this.fade);
  }
  glitch(l, r) {
    const now = this.glitchBuf[0].w;
    this.glitchBuf[0].write(l); this.glitchBuf[1].write(r);
    const period = Math.floor(this.beat / 2); // decide every half bar
    if (period !== this.glitchPeriod) {
      const first = this.glitchPeriod === -1;
      this.glitchPeriod = period;
      this.glitchActive = !first && this.rng.uni() < this.settings.glitchChance;
      if (this.glitchActive) {
        // The window opened (beat - 2 * period) beats ago; the slice starts there.
        const late = (this.beat - 2 * period) * 60 / this.bpm * this.sr;
        this.glitchSlice = Math.max(64, LAB_GLITCH_BEATS[labClamp(this.settings.glitchDiv, 0, 4)] * 60 / this.bpm * this.sr);
        this.glitchStart = now - Math.min(late, 0.5 * this.glitchSlice);
        if (this.glitchGate > 0) this.spliceTo(true, now, 1); else { this.setHead(this.head, true, now, 1); this.xfade = 0; }
        this.glitchPos = now - this.glitchStart; this.glitchRepeat = 0;
        this.glitchGate = 1;
      }
    }
    if (!this.glitchActive) this.glitchGate = Math.max(0, this.glitchGate - this.gateStep);
    if (this.glitchGate <= 0) { this.out[0] = l; this.out[1] = r; return; }

    const head = this.head, tail = this.tail;
    let hl = this.readHead(head, 0, l), hr = this.readHead(head, 1, r);
    if (this.xfade > 0) {
      const t = 1 - this.xfade / this.fade;
      const a = Math.sin(t * 0.5 * LAB_PI), b = Math.cos(t * 0.5 * LAB_PI);
      hl = a * hl + b * this.readHead(tail, 0, l);
      hr = a * hr + b * this.readHead(tail, 1, r);
      tail.pos += tail.rate; this.xfade--;
    }
    head.pos += head.rate;
    if (this.glitchActive) {
      this.glitchPos += head.rate;
      if (this.glitchPos >= this.glitchSlice) {
        this.glitchPos -= this.glitchSlice;
        this.glitchRepeat++;
        const rate = labClamp(Math.pow(2, this.settings.glitchDrift * 0.25 * this.glitchRepeat), 0.25, 4);
        this.spliceTo(false, this.glitchStart + this.glitchPos, rate);
      }
    }
    // Equal-power return to the dry signal when the window closes.
    const a = Math.sin(this.glitchGate * 0.5 * LAB_PI), b = Math.cos(this.glitchGate * 0.5 * LAB_PI);
    this.out[0] = a * hl + b * l; this.out[1] = a * hr + b * r;
  }
  clearGlitch() {
    for (const g of this.glitchBuf) g.clear();
    this.setHead(this.head, true, 0, 1); this.setHead(this.tail, true, 0, 1); this.xfade = 0;
    this.glitchActive = false; this.glitchGate = 0; this.glitchPeriod = -1; this.glitchPos = 0; this.glitchRepeat = 0;
    this.glitchSlice = 1000; this.glitchStart = 0;
  }
}

globalThis.FableLabFx = LabFx;
