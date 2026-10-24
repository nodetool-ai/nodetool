// FableSynth DR-1 DSP core — AudioWorklet thread. Self-contained (no imports).
// 16 one-shot pad voices, a per-pad FX rack, five output buses and a
// sample-accurate step sequencer. See worklet.js for the reference
// implementations of the shared primitives (mip playback, SVF, ADAA drive) —
// copied here because worklets can't import.
//
// Fidelity contract (docs/audio-engine-review.md §4): Hermite table reads,
// intra-block ramps for every increment, sample-rate-derived smoothing and
// filter poles, and a seedable RNG — the same choices the JUCE port makes, so
// the two engines stay comparable. The FX rack (review W6) is a port of
// juce/source/drum/dsp/DrumFx.cpp for the same reason: one algorithm, and one
// that an offline test can render.
//
// In:  {t:'init',params} {t:'tables',list} {t:'samples',list} {t:'p',k,v} {t:'trig',pad,v}
//      {t:'pats',data} {t:'chain',list} {t:'play'} {t:'stop'} {t:'sel',pad} {t:'panic'}
//      {t:'seed',v}
//      Timeline host: {t:'evs',ev} {t:'evclear'} {t:'base',note}; processorOptions
//      {params, tables, samples, events, baseNote, mixdown}
// Out: {t:'step',s,pat,hits} per step while playing
//      {t:'viz',a,b,env} every 2048 samples for the selected pad
//      {t:'latency',n} once, at construction
// Outputs: one stereo bus per OUT_NAMES entry (MAIN, AUX 1..4).

const NPADS = 16;
const CAPTURE_LEN = 4096;
const MAXUNI = 7;
const STEPS = 16;
const NPATTERNS = 4;
const ACCENT_VEL = 1.0;
const PLAIN_VEL = 0.72;
const SWING_MAX = 0.667;
const MOD_LOG_D = 5;
const BASE_NOTE = 60;
const positiveModulo = (v, n) => ((v % n) + n) % n;
function normalizeRhythm(value) {
  if (!value || !Array.isArray(value.lanes) || value.lanes.length !== NPADS) return null;
  return { v: 1, lanes: value.lanes.map((lane) => {
    if (!lane || (!lane.enabled && lane.delayMs === undefined && lane.stepDelayMs === undefined)) return null;
    const steps = Math.max(1, Math.min(16, lane.steps | 0));
    const mode = lane.timing && String(lane.timing.mode).toLowerCase() === 'fit' ? 'fit' : 'grid';
    return { enabled: !!lane.enabled, delayMs: Math.max(-50, Math.min(50, lane.delayMs | 0)),
      stepDelayMs: Array.isArray(lane.stepDelayMs) ? lane.stepDelayMs.slice(0, 256).map(v => Math.max(-50, Math.min(50, v | 0))) : [],
      micro: lane.delayMs !== undefined || lane.stepDelayMs !== undefined, sourceBar: Math.max(0, lane.sourceBar | 0), steps,
      rotation: positiveModulo(lane.rotation | 0, steps),
      timing: mode === 'fit' ? { mode, cycleBeats: lane.timing.cycleBeats === 8 ? 8 : 4 } : { mode } };
  }) };
}
const rhythmHasEnabledLane = r => !!r && r.lanes.some(lane => lane && (lane.enabled || lane.micro));
const rhythmHasMicro = r => !!r && r.lanes.some(lane => lane?.micro);
function rhythmEqual(a, b) {
  if (a === b) return true;
  if (!a || !b || a.v !== b.v || a.lanes.length !== b.lanes.length) return false;
  for (let i = 0; i < a.lanes.length; i++) {
    const x = a.lanes[i], y = b.lanes[i];
    if (x === y) continue;
    if (!x || !y || x.enabled !== y.enabled || x.sourceBar !== y.sourceBar
      || x.steps !== y.steps || x.rotation !== y.rotation || x.micro !== y.micro || x.delayMs !== y.delayMs
      || x.stepDelayMs.length !== y.stepDelayMs.length || x.stepDelayMs.some((v, i) => v !== y.stepDelayMs[i])
      || x.timing.mode !== y.timing.mode
      || (x.timing.mode === 'fit' && x.timing.cycleBeats !== y.timing.cycleBeats)) return false;
  }
  return true;
}

// Time constants, not per-sample coefficients: every smoother below used to
// hold a literal tuned at 48 kHz, so a 96 kHz context halved its time. Each
// value here reproduces the old coefficient exactly at 48 kHz.
const POS_TAU = 0.000774; // was posSm += (pos - posSm) * 0.35 per 16 samples
const CUT_TAU = 0.003847; // was cutSm += (fc - cutSm) * 0.5 per 128 samples
const CHOKE_TAU = 0.0003; // ≈2.8 ms to -80 dB; also the retrigger fade (D2)
// Declick slew on the choke / retrigger fade (s). Rounds the corner where the
// fade starts; the hit's own attack transient stays untouched.
const CHOKE_SLEW = 0.0003;
const DC_R_48 = 0.9998; // DC-blocker pole, quoted at 48 kHz
const NOISE_SR = 48000; // reference rate for the noise one-pole colour
const EDGE_FADE = 0.0015; // seconds of fade at a sample's start/end/stop
// Band-limited one-shot decimation (DrumEngine.cpp Finding K1): above 1 source
// sample per output sample the read is a Kaiser-windowed sinc low-pass whose
// width and cutoff scale with the read rate. The prototype is unit scale
// (-6 dB at 0.47 cycles per output sample, ~70 dB stopband), read from a table.
const SINC_RES = 256; // table points per output sample
const SINC_HALF = 11; // prototype half width, output samples
const SINC_CUT = 0.47;
const SINC_BETA = 7;
const SINC_MAX_AST = 5.8; // wider kernels stop narrowing
const SINC_BLEND = 1.05; // read rate where the Hermite read is fully replaced
const SINC_TABLE = (() => {
  const i0 = (x) => {
    let sum = 1, term = 1;
    for (let k = 1; k < 60; k++) {
      term *= (x / (2 * k)) * (x / (2 * k));
      sum += term;
      if (term < 1e-18 * sum) break;
    }
    return sum;
  };
  const norm = i0(SINC_BETA);
  const t = new Float64Array(SINC_HALF * SINC_RES + 2);
  for (let i = 0; i < t.length; i++) {
    const x = i / SINC_RES;
    const a2 = 2 * SINC_CUT * x;
    const sinc = a2 === 0 ? 1 : Math.sin(Math.PI * a2) / (Math.PI * a2);
    const r = x / SINC_HALF;
    const w = r >= 1 ? 0 : i0(SINC_BETA * Math.sqrt(1 - r * r)) / norm;
    t[i] = 2 * SINC_CUT * sinc * w;
  }
  return t;
})();
const TYPE_XFADE = 0.003; // seconds of crossfade on a filter-type switch
const ADAA_FADE_WIDTH = 0.1;
const ADAA_INPUT_LIMIT = 16;
const E45 = Math.exp(-4.5);
const INV_E45 = 1 / (1 - E45);

// Coefficient of a one-pole smoother advanced by `n` samples toward its target.
const smoothCoef = (n, tauSamples) => 1 - Math.exp(-n / Math.max(1e-9, tauSamples));

// Re-map a one-pole coefficient authored at 48 kHz onto the running rate.
const mapPole = (a48, sr) => 1 - Math.pow(1 - a48, NOISE_SR / sr);

function lcosh(z) {
  const a = Math.abs(z);
  return a + Math.log1p(Math.exp(-2 * a)) - Math.LN2;
}
function adaaInput(x) {
  return Number.isFinite(x) ? Math.max(-ADAA_INPUT_LIMIT, Math.min(ADAA_INPUT_LIMIT, x)) : 0;
}

// 2x oversampler for the in-voice drive saturator. Only the nonlinearity runs
// at 2x (interpolate -> ADAA tanh at the high rate -> decimate); the SVF stays
// at the base rate. Both converters are the polyphase IIR half-band that
// juce/source/dsp/DriveOs.h documents: allpass branches A0 = {c0, c2, c4} and
// A1 = {c1, c3}. While the saturator is idle and the stage has faded out, the
// input is returned unchanged (bit-identical to a voice without the stage); the
// stage fades in and out over DRIVE_OS_RAMP_SEC with a linear crossfade.
const DRIVE_OS_COEF = new Float64Array([
  0.058131122888383423, 0.21191463147606193, 0.4170395803350932,
  0.63844438482644794, 0.87095859811277021]);
const DRIVE_OS_RAMP_SEC = 0.004;
// Allpass state, (x1, y1) pairs: u0 at 0,2,4; u1 at 6,8; d0 at 10,12,14; d1 at 16,18.
function makeDriveOs() {
  return {
    s: new Float64Array(20), dprev: 0,
    xp: 0,   // previous high-rate ADAA input
    F: 0,    // kF * lcosh(dg * xp), valid while the saturator is active
    w: 0,    // stage weight: 0 = bypass, 1 = stage
  };
}
function resetDriveOs(o) { o.s.fill(0); o.dprev = 0; o.xp = 0; o.F = 0; o.w = 0; }
function copyDriveOs(d, s) { d.s.set(s.s); d.dprev = s.dprev; d.xp = s.xp; d.F = s.F; d.w = s.w; }
function driveOsAp(s, i, a, x) {
  const y = a * (x - s[i + 1]) + s[i];
  s[i] = x; s[i + 1] = y;
  return y;
}
function driveOsSat(o, a, xpv, dg, dcomp, kF) {
  const dx = a - xpv;
  const F = kF * lcosh(dg * a);
  // |dx| tiny -> ADAA is numerically unstable; fall back to midpoint tanh.
  const r = dx > 1e-5 || dx < -1e-5 ? (F - o.F) / dx : dcomp * Math.tanh(dg * 0.5 * (a + xpv));
  o.F = F;
  return r;
}
// One base-rate sample. engage: the stage belongs in the path; satOn: the
// saturator runs with dry/wet mix m.
function driveOsStep(o, x, engage, satOn, m, wStep, dg, dcomp, kF) {
  const target = engage ? 1 : 0;
  if (o.w < target) o.w = Math.min(target, o.w + wStep);
  else if (o.w > target) o.w = Math.max(target, o.w - wStep);
  if (o.w <= 0 && !engage) { o.xp = adaaInput(x); return x; }
  const s = o.s, C = DRIVE_OS_COEF;
  const u0 = driveOsAp(s, 4, C[4], driveOsAp(s, 2, C[2], driveOsAp(s, 0, C[0], x)));
  const u1 = driveOsAp(s, 8, C[3], driveOsAp(s, 6, C[1], x));
  const a0 = adaaInput(u0), a1 = adaaInput(u1);
  let o0 = a0, o1 = a1;
  if (satOn) {
    o0 = a0 + m * (driveOsSat(o, a0, o.xp, dg, dcomp, kF) - a0);
    o1 = a1 + m * (driveOsSat(o, a1, a0, dg, dcomp, kF) - a1);
  }
  o.xp = a1;
  const da = driveOsAp(s, 14, C[4], driveOsAp(s, 12, C[2], driveOsAp(s, 10, C[0], o0)));
  const db = driveOsAp(s, 18, C[3], driveOsAp(s, 16, C[1], o1));
  const y = 0.5 * (da + o.dprev);
  o.dprev = db;
  return o.w >= 1 ? y : x + o.w * (y - x);
}

// 4-point cubic Hermite, the read JUCE uses. Linear reads left 10–20 dB more
// interpolation image below C6 (review §1).
function hermite4(ym1, y0, y1, y2, f) {
  const c1 = 0.5 * (y1 - ym1);
  const c2 = ym1 - 2.5 * y0 + 2 * y1 - 0.5 * y2;
  const c3 = 0.5 * (y2 - ym1) + 1.5 * (y0 - y1);
  return ((c3 * f + c2) * f + c1) * f + y0;
}

function hermiteTable(d, base, idx, mask, f) {
  return hermite4(
    d[base + ((idx - 1) & mask)],
    d[base + idx],
    d[base + ((idx + 1) & mask)],
    d[base + ((idx + 2) & mask)],
    f,
  );
}

// xorshift32, mirroring JUCE's Rng: seedable, so a noise-bearing render is
// reproducible and comparable between the two engines.
class Rng {
  constructor(seed) { this.s = (seed >>> 0) || 0x9e3779b9; }
  next() {
    let x = this.s;
    x ^= x << 13; x >>>= 0;
    x ^= x >>> 17;
    x ^= x << 5; x >>>= 0;
    this.s = x;
    return x;
  }
  // uniform in [-1, 1)
  uni() { return this.next() * (2 / 4294967296) - 1; }
}

// ---------- FX rack ----------
// Port of juce/source/dsp/Fx.h and juce/source/drum/dsp/DrumFx.cpp. The pad FX
// used to be a graph of native WebAudio nodes on the main thread; both products
// now run this one algorithm, and every stage is testable offline (review W6).
// The native graph keeps only the analysers.
//
// Per pad: OTT -> compressor -> drive -> chorus -> ping-pong delay, then an equal-power
// reverb send. Per bus (DrumBusOut, review D1): master gain -> DC block ->
// lookahead limiter with a hard -1 dBFS ceiling.

const BUSES = 5; // OUT_NAMES.length in ../params.ts
const FX_TAU = 0.02; // wet/dry and gain smoothing, matching setTargetAtTime(.., 0.02)
const HB1_TAPS = 63, HB2_TAPS = 17, HB_BETA = 6;
// 4x drive oversampler group delay in base samples: (63-1)/2 + (17-1)/4.
const DRIVE_LATENCY = (HB1_TAPS - 1) / 2 + (HB2_TAPS - 1) / 4; // 35
const LIM_THR = 0.398, LIM_RATIO = 14;
const LIM_CEILING = 0.8912509381337456; // -1 dBFS


const COMB_TUNE = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617];
const AP_TUNE = [556, 441, 341, 225];
const STEREO_SPREAD = 23;
// FX gate (review D8): a chain bypasses itself once its input AND its own
// output have been below GATE_EPS for this long. Level-driven, so a reverb or
// delay tail is never truncated; the hold-off also covers one full delay round
// trip, after which the line provably holds silence.
const GATE_HOLD = 0.25;
const GATE_EPS = 1e-5;

// Zero-latency overload guard for module boundaries. Floating-point signals
// can exceed unity internally; only excess boundary levels are attenuated.
// Common stereo gain preserves pan, instant attack catches the first peak,
// and an 80 ms release avoids independently flattening successive samples.
// This is sample-peak protection, not an oversampled true-peak limiter.
const StereoPeakGuard = globalThis.FablePeakGuard;

// Compressor dynamics are shared with WT-1 and BL-1 in ott-worklet.js.

const mixGate = (on, amount, wet) => (wet
  ? (on ? Math.sin((amount * Math.PI) / 2) : 0)
  : (on ? Math.cos((amount * Math.PI) / 2) : 1));

// One-pole smoother toward a target (setTargetAtTime equivalent).
class Smooth {
  constructor(sr, tau) {
    this.cur = 0; this.target = 0;
    this.coef = 1 - Math.exp(-1 / (tau * sr));
  }
  next() { this.cur += (this.target - this.cur) * this.coef; return this.cur; }
  // Advance n samples at once (block-rate users: reverb size, bus gain).
  nextN(n) { this.cur += (this.target - this.cur) * (1 - Math.pow(1 - this.coef, n)); return this.cur; }
  snap(v) { this.cur = v; this.target = v; }
  settled() { return this.cur === this.target; }
}

class Biquad {
  constructor() { this.b0 = 1; this.b1 = 0; this.b2 = 0; this.a1 = 0; this.a2 = 0; this.z1 = 0; this.z2 = 0; }
  lowpass(freq, q, sr) {
    const w0 = (2 * Math.PI * Math.min(freq, sr * 0.49)) / sr;
    const cw = Math.cos(w0), alpha = Math.sin(w0) / (2 * q), a0 = 1 + alpha;
    this.b0 = (1 - cw) / 2 / a0; this.b1 = (1 - cw) / a0; this.b2 = this.b0;
    this.a1 = (-2 * cw) / a0; this.a2 = (1 - alpha) / a0;
  }
  highpass(freq, q, sr) {
    const w0 = (2 * Math.PI * Math.min(freq, sr * 0.49)) / sr;
    const cw = Math.cos(w0), alpha = Math.sin(w0) / (2 * q), a0 = 1 + alpha;
    this.b0 = (1 + cw) / 2 / a0; this.b1 = -(1 + cw) / a0; this.b2 = this.b0;
    this.a1 = (-2 * cw) / a0; this.a2 = (1 - alpha) / a0;
  }
  process(x) {
    const y = this.b0 * x + this.z1;
    this.z1 = this.b1 * x - this.a1 * y + this.z2;
    this.z2 = this.b2 * x - this.a2 * y;
    return y;
  }
  reset() { this.z1 = 0; this.z2 = 0; }
}

class DelayLine {
  constructor(n) { this.buf = new Float32Array(Math.max(4, n | 0)); this.w = 0; }
  reset() { this.buf.fill(0); this.w = 0; }
  write(x) { this.buf[this.w] = x; if (++this.w >= this.buf.length) this.w = 0; }
  // 4-point Catmull-Rom, for the modulated reads (chorus, echo).
  readHermite(d) {
    const sz = this.buf.length, b = this.buf;
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

// Fixed integer delay, block at a time: the drive's dry path needs exactly
// DRIVE_LATENCY samples of alignment and nothing else, so it costs two copies
// per block instead of a fractional read per sample.
class IntDelay {
  constructor(d) { this.d = d; this.h = new Float32Array(d); }
  reset() { this.h.fill(0); }
  block(x, out, n) {
    const d = this.d, h = this.h;
    if (n >= d) {
      for (let i = 0; i < d; i++) out[i] = h[i];
      for (let i = d; i < n; i++) out[i] = x[i - d];
      for (let i = 0; i < d; i++) h[i] = x[n - d + i];
    } else {
      for (let i = 0; i < n; i++) out[i] = h[i];
      h.copyWithin(0, n);
      for (let i = 0; i < n; i++) h[d - n + i] = x[i];
    }
  }
  copyFrom(o) { this.h.set(o.h); }
}

function besselI0(x) {
  let sum = 1, term = 1;
  for (let k = 1; k < 64; k++) {
    term *= (x * x) / (4 * k * k);
    sum += term;
    if (term < 1e-16 * sum) break;
  }
  return sum;
}

// Kaiser-windowed half-band FIR, split into its two polyphase phases. Every tap
// at an even offset from the centre is structurally zero and the centre tap is
// 0.5, so the interpolator never multiplies the zero-stuffed inputs and the
// decimator never computes the phase it throws away (review J4). With the
// symmetric taps folded as well that is 46 MACs per base sample through the 4x
// path where the direct form the C++ started from does 324. Coefficients are
// shared by every instance; only the histories are per-instance.
//
// Verified against the direct form it replaces (scratchpad probe, 47+17 tap
// cascade, 48 kHz): max abs error 2.8e-16 on a 20 Hz->20 kHz swept sine and
// 1.1e-16 on an impulse, whose peak stays on sample 27 — so the group delay,
// and with it the reported chain latency, is unchanged.
function designHalfBand(taps, beta) {
  const h = new Float64Array(taps);
  const M = taps - 1, ib = besselI0(beta), c = (taps - 1) / 2;
  for (let i = 0; i < taps; i++) {
    const m = i - M * 0.5;
    const sinc = m === 0 ? 0.5 : Math.sin((Math.PI * 0.5 * m)) / (Math.PI * m);
    const t = (2 * m) / M;
    h[i] = (sinc * besselI0(beta * Math.sqrt(Math.max(0, 1 - t * t)))) / ib;
  }
  // sin(PI*m/2) at an even integer m is ~1e-16, not 0; force the exact zero so
  // the polyphase split is exact and the skipped multiplies cost nothing.
  for (let i = 0; i < taps; i++) if (i !== c && (i - c) % 2 === 0) h[i] = 0;
  const pe = new Float64Array((taps + 1) >> 1);
  const po = new Float64Array(taps >> 1);
  for (let j = 0; j < pe.length; j++) pe[j] = h[2 * j];
  for (let j = 0; j < po.length; j++) po[j] = h[2 * j + 1];
  // Each phase is itself symmetric, so pair the equal taps and multiply once:
  // 46 MACs per base sample through the 4x path instead of 86 unfolded.
  const fold = (v) => {
    const co = [], j1 = [], j2 = [];
    for (let j = 0; j < v.length - 1 - j; j++) {
      if (v[j] === 0) continue;
      co.push(v[j]); j1.push(j); j2.push(v.length - 1 - j);
    }
    const mid = v.length & 1 ? (v.length - 1) >> 1 : -1;
    return {
      co: new Float64Array(co), j1: new Int32Array(j1), j2: new Int32Array(j2),
      mid: mid >= 0 && v[mid] !== 0 ? mid : -1,
      midCo: mid >= 0 ? v[mid] : 0,
    };
  };
  return { h, fe: fold(pe), fo: fold(po), np: Math.max(pe.length, po.length + 1) };
}

class HalfBandFir {
  constructor(d) {
    this.d = d;
    this.hx = new Float64Array(2 * d.np);
    this.he = new Float64Array(2 * d.np);
    this.ho = new Float64Array(2 * d.np);
    this.px = 0; this.pd = 0;
  }
  reset() { this.hx.fill(0); this.he.fill(0); this.ho.fill(0); this.px = 0; this.pd = 0; }
  // Adopt another instance's history. Used by the mono fast path, where the
  // right channel was skipped because its input was identical to the left's:
  // had it run, its state would be exactly this.
  copyFrom(o) {
    this.hx.set(o.hx); this.he.set(o.he); this.ho.set(o.ho);
    this.px = o.px; this.pd = o.pd;
  }
  // Block forms of the two entry points. A block at a time rather than a
  // sample at a time so each filter's taps are loaded into locals once per
  // block: measured 23 % of the whole drive stage, which is more than the
  // arithmetic the folding above saves.
  interpBlock(x, out, n) {
    const d = this.d, np = d.np, hx = this.hx;
    const fe = d.fe, fo = d.fo;
    const eco = fe.co, ej1 = fe.j1, ej2 = fe.j2, emid = fe.mid, emc = fe.midCo, en = eco.length;
    const oco = fo.co, oj1 = fo.j1, oj2 = fo.j2, omid = fo.mid, omc = fo.midCo, on = oco.length;
    let p = this.px;
    for (let i = 0; i < n; i++) {
      if (--p < 0) p = np - 1;
      const v = x[i];
      hx[p] = v; hx[p + np] = v;
      let a0 = emid >= 0 ? emc * hx[p + emid] : 0;
      for (let k = 0; k < en; k++) a0 += eco[k] * (hx[p + ej1[k]] + hx[p + ej2[k]]);
      let a1 = omid >= 0 ? omc * hx[p + omid] : 0;
      for (let k = 0; k < on; k++) a1 += oco[k] * (hx[p + oj1[k]] + hx[p + oj2[k]]);
      out[2 * i] = 2 * a0; out[2 * i + 1] = 2 * a1;
    }
    this.px = p;
  }
  decimBlock(x, out, n) {
    const d = this.d, np = d.np, he = this.he, ho = this.ho;
    const fe = d.fe, fo = d.fo;
    const eco = fe.co, ej1 = fe.j1, ej2 = fe.j2, emid = fe.mid, emc = fe.midCo, en = eco.length;
    const oco = fo.co, oj1 = fo.j1, oj2 = fo.j2, omid = fo.mid, omc = fo.midCo, on = oco.length;
    let p = this.pd;
    for (let i = 0; i < n; i++) {
      if (--p < 0) p = np - 1;
      const x0 = x[2 * i], x1 = x[2 * i + 1];
      he[p] = x0; he[p + np] = x0;
      ho[p] = x1; ho[p + np] = x1;
      // The two phases are summed separately and added once, so the result is
      // bit-identical to the sample-at-a-time form rather than merely equal to
      // within a rounding step.
      let ae = emid >= 0 ? emc * he[p + emid] : 0;
      for (let k = 0; k < en; k++) ae += eco[k] * (he[p + ej1[k]] + he[p + ej2[k]]);
      const q = p + 1;
      let ao = omid >= 0 ? omc * ho[q + omid] : 0;
      for (let k = 0; k < on; k++) ao += oco[k] * (ho[q + oj1[k]] + ho[q + oj2[k]]);
      out[i] = ae + ao;
    }
    this.pd = p;
  }
}

const HB1 = designHalfBand(HB1_TAPS, HB_BETA);
const HB2 = designHalfBand(HB2_TAPS, HB_BETA);

// Oversampler scratch, shared by every pad: the chains run one after another
// on a single thread, so one set of buffers is enough.
let OS_N = 0, OS_IN = null, OS_X2 = null, OS_X4 = null, OS_Y2 = null;
function osScratch(n) {
  if (n <= OS_N) return;
  OS_N = n;
  OS_IN = new Float64Array(n);
  OS_X2 = new Float64Array(2 * n);
  OS_X4 = new Float64Array(4 * n);
  OS_Y2 = new Float64Array(2 * n);
}

// Lookahead brickwall limiter: fixed makeup gain feeding a delayed signal path,
// linked-stereo sliding-window-minimum gain that fully develops inside the
// ~1.5 ms lookahead, ~200 ms release, hard -1 dBFS sample-peak ceiling.
class LookaheadLimiter {
  constructor(sr, makeup) {
    this.la = Math.max(8, Math.round(0.0015 * sr));
    this.qcap = this.la + 2;
    this.dlL = new Float32Array(this.la);
    this.dlR = new Float32Array(this.la);
    this.qv = new Float64Array(this.qcap);
    this.qi = new Float64Array(this.qcap);
    this.atk = 1 - Math.exp(-4 / this.la);
    this.rel = 1 - Math.exp(-1 / (0.2 * sr));
    this.makeup = makeup;
    this.w = 0; this.qh = 0; this.qt = 0; this.t = 0; this.env = 1;
  }
  reset() {
    this.dlL.fill(0); this.dlR.fill(0); this.qv.fill(1); this.qi.fill(0);
    this.w = 0; this.qh = 0; this.qt = 0; this.t = 0; this.env = 1;
  }
  process(L, R, n) {
    const la = this.la, qcap = this.qcap, qv = this.qv, qi = this.qi;
    const dlL = this.dlL, dlR = this.dlR, mk = this.makeup;
    let w = this.w, qh = this.qh, qt = this.qt, t = this.t, env = this.env;
    for (let i = 0; i < n; i++) {
      const xl = L[i] * mk, xr = R[i] * mk;
      const pk = Math.max(Math.abs(xl), Math.abs(xr));
      const g = pk > LIM_CEILING ? LIM_CEILING / pk : 1;
      // monotonic ring queue: minimum required gain over the last la+1 samples
      for (;;) {
        if (qh === qt) break;
        const prev = qt > 0 ? qt - 1 : qcap - 1;
        if (qv[prev] < g) break;
        qt = prev;
      }
      qv[qt] = g; qi[qt] = t; qt = qt + 1 < qcap ? qt + 1 : 0;
      if (qi[qh] < t - la) qh = qh + 1 < qcap ? qh + 1 : 0;
      const wmin = qv[qh];
      env += (wmin - env) * (wmin < env ? this.atk : this.rel);
      const dl = dlL[w], dr = dlR[w];
      dlL[w] = xl; dlR[w] = xr;
      if (++w >= la) w = 0;
      t++;
      let gg = env;
      const pd = Math.max(Math.abs(dl), Math.abs(dr));
      if (gg * pd > LIM_CEILING) gg = LIM_CEILING / pd; // catch smoothing residue
      L[i] = dl * gg; R[i] = dr * gg;
    }
    this.w = w; this.qh = qh; this.qt = qt; this.t = t; this.env = env;
  }
}

// Freeverb, sample-rate scaled, tuned by SIZE. One instance per output bus,
// shared by every pad on that bus: sixteen independent reverbs cost more than
// the rest of the drum machine put together, exactly as the sixteen convolvers
// this replaces did (review D7/D8). SIZE is continuous — the network's
// feedback and damping move under the running tail instead of a buffer swap.
class Freeverb {
  constructor(sr) {
    const scale = sr / 44100;
    this.cL = []; this.cR = []; this.aL = []; this.aR = [];
    for (let i = 0; i < 8; i++) {
      this.cL.push({ buf: new Float32Array(Math.floor(COMB_TUNE[i] * scale)), idx: 0, filt: 0 });
      this.cR.push({ buf: new Float32Array(Math.floor((COMB_TUNE[i] + STEREO_SPREAD) * scale)), idx: 0, filt: 0 });
    }
    for (let i = 0; i < 4; i++) {
      this.aL.push({ buf: new Float32Array(Math.floor(AP_TUNE[i] * scale)), idx: 0 });
      this.aR.push({ buf: new Float32Array(Math.floor((AP_TUNE[i] + STEREO_SPREAD) * scale)), idx: 0 });
    }
    this.sr = sr;
    this.size = new Smooth(sr, FX_TAU);
    this.size.snap(0.4);
    this.fb = 0.812; this.damp1 = 0.32; this.damp2 = 0.68;
    this.silentFor = 1e9; this.gated = true;
    this.meterEnabled = false; this.meterL = 0; this.meterR = 0; this.meterLR = 0;
  }
  reset() {
    for (const c of this.cL) { c.buf.fill(0); c.idx = 0; c.filt = 0; }
    for (const c of this.cR) { c.buf.fill(0); c.idx = 0; c.filt = 0; }
    for (const a of this.aL) { a.buf.fill(0); a.idx = 0; }
    for (const a of this.aR) { a.buf.fill(0); a.idx = 0; }
    this.meterL = 0; this.meterR = 0; this.meterLR = 0;
  }
  // Coefficients follow the smoothed SIZE once per block: a knob move retunes
  // the running network, it never restarts it.
  update(n) {
    const s = this.size.nextN(n);
    this.fb = 0.7 + s * 0.28;
    this.damp1 = 0.4 - s * 0.2;
    this.damp2 = 1 - this.damp1;
  }
  process(inL, inR, outL, outR, n) {
    let inPk = 0;
    for (let i = 0; i < n; i++) {
      const a = inL[i] < 0 ? -inL[i] : inL[i], b = inR[i] < 0 ? -inR[i] : inR[i];
      if (a > inPk) inPk = a;
      if (b > inPk) inPk = b;
    }
    if (this.gated) {
      // Nothing is being sent and the tail has already decayed below
      // GATE_EPS — the network holds silence, so running it changes nothing.
      if (inPk <= GATE_EPS) return;
      this.gated = false;
      this.silentFor = 0;
    }
    let outPk = 0;
    const fb = this.fb, d1 = this.damp1, d2 = this.damp2;
    for (let i = 0; i < n; i++) {
      const input = (inL[i] + inR[i]) * 0.015;
      let l = 0, r = 0;
      for (let c = 0; c < 8; c++) {
        const cl = this.cL[c], bl = cl.buf;
        const ol = bl[cl.idx];
        cl.filt = ol * d2 + cl.filt * d1;
        bl[cl.idx] = input + cl.filt * fb;
        if (++cl.idx >= bl.length) cl.idx = 0;
        l += ol;
        const cr = this.cR[c], br = cr.buf;
        const or_ = br[cr.idx];
        cr.filt = or_ * d2 + cr.filt * d1;
        br[cr.idx] = input + cr.filt * fb;
        if (++cr.idx >= br.length) cr.idx = 0;
        r += or_;
      }
      for (let a = 0; a < 4; a++) {
        const al = this.aL[a], bl = al.buf;
        const bo = bl[al.idx];
        bl[al.idx] = l + bo * 0.5;
        l = bo - l;
        if (++al.idx >= bl.length) al.idx = 0;
        const ar = this.aR[a], br = ar.buf;
        const bo2 = br[ar.idx];
        br[ar.idx] = r + bo2 * 0.5;
        r = bo2 - r;
        if (++ar.idx >= br.length) ar.idx = 0;
      }
      if (this.meterEnabled) { this.meterL += l * l; this.meterR += r * r; this.meterLR += l * r; }
      outL[i] += l; outR[i] += r;
      const a = l < 0 ? -l : l, b = r < 0 ? -r : r;
      if (a > outPk) outPk = a;
      if (b > outPk) outPk = b;
    }
    if (inPk <= GATE_EPS && outPk <= GATE_EPS) {
      this.silentFor += n;
      if (this.silentFor >= GATE_HOLD * this.sr) this.gated = true;
    } else {
      this.silentFor = 0;
    }
  }
}

// One pad's insert chain: OTT -> compressor -> drive -> chorus -> ping-pong delay.
// The reverb is a send (see DrumProcessor.process) so pads can share one.
class PadFx {
  constructor(sr) {
    this.sr = sr;
    this.keySource = 0; this.keyL = null; this.keyR = null; // COMP side-chain
    this.lab = new globalThis.FableLabFx(sr);
    this.headroom = {};
    for (const stage of ['input', 'ott', 'comp', 'drive', 'chorus', 'delay']) {
      this.headroom[stage] = new StereoPeakGuard(sr);
    }
    this.delayFeedbackGuard = new StereoPeakGuard(sr);
    // drive
    this.driveK = 1; this.drivePre = 1; this.driveNorm = 1;
    this.driveWet = new Smooth(sr, FX_TAU); this.driveDry = new Smooth(sr, FX_TAU);
    this.driveDry.snap(1);
    this.u1L = new HalfBandFir(HB1); this.u2L = new HalfBandFir(HB2);
    this.d2L = new HalfBandFir(HB2); this.d1L = new HalfBandFir(HB1);
    this.u1R = new HalfBandFir(HB1); this.u2R = new HalfBandFir(HB2);
    this.d2R = new HalfBandFir(HB2); this.d1R = new HalfBandFir(HB1);
    this.dryL = new IntDelay(DRIVE_LATENCY); this.dryR = new IntDelay(DRIVE_LATENCY);
    this.dbL = new Float32Array(128); this.dbR = new Float32Array(128);
    this.wetL = new Float64Array(128); this.wetR = new Float64Array(128);
    this.driveOff = true; this.driveGated = false;
    // A drum voice is mono until PAN spreads it, so L and R usually hold the
    // same samples. While they do, the drive runs once and the right-hand
    // filters are left alone; they are resynced from the left the moment the
    // two channels differ. Halves the cost of the chain's dominant stage.
    this.monoRun = false;
    this.driveColorL = new globalThis.FableDriveColor(sr);
    this.driveColorR = new globalThis.FableDriveColor(sr);
    this.comp = new globalThis.FableCompressor(sr);
    this.eq = new globalThis.FableParametricEq(sr);
    this.ott = new globalThis.FableOttCompressor(sr);
    // chorus
    this.chPhase = 0; this.chRate = 0.6; this.chDepth = 0.5;
    this.chWet = new Smooth(sr, FX_TAU); this.chDry = new Smooth(sr, FX_TAU);
    this.chDry.snap(1);
    this.chDl1 = new DelayLine(0.05 * sr); this.chDl2 = new DelayLine(0.05 * sr);
    this.chorusOff = true; this.chorusGated = false;
    // delay
    this.dlTime = new Smooth(sr, 0.08); this.dlFb = new Smooth(sr, FX_TAU);
    this.dlWet = new Smooth(sr, FX_TAU); this.dlDry = new Smooth(sr, FX_TAU);
    this.dlDry.snap(1);
    this.dlL = new DelayLine(2 * sr + 4); this.dlR = new DelayLine(2 * sr + 4);
    this.dlDamp = new Biquad(); this.dlDamp.lowpass(4500, 0.707, sr);
    this.delayOff = true; this.delayGated = false;
    // reverb send (equal power, same law as the insert stages)
    this.verbWet = new Smooth(sr, FX_TAU); this.verbDry = new Smooth(sr, FX_TAU);
    this.verbDry.snap(1);
    this.verbSize = 0.4; this.verbOn = true;
    // chain gate (review D8)
    this.silentFor = 1e9; this.gated = true; this.outPk = 0;
    this.bus = 0;
    this.meterSelected = false;
    this.meterInput = 0; this.meterOtt = 0; this.meterCompIn = 0; this.meterCompOut = 0;
    this.meterEchoIn = 0; this.meterEchoL = 0; this.meterEchoR = 0;
  }

  syncRight() {
    this.driveColorR.copyShapeFrom(this.driveColorL);
    this.u1R.copyFrom(this.u1L); this.u2R.copyFrom(this.u2L);
    this.d2R.copyFrom(this.d2L); this.d1R.copyFrom(this.d1L);
    this.dryR.copyFrom(this.dryL);
    this.monoRun = false;
  }

  reset() {
    this.u1L.reset(); this.u2L.reset(); this.d2L.reset(); this.d1L.reset();
    for (const guard of Object.values(this.headroom)) guard.reset();
    this.delayFeedbackGuard.reset();
    this.u1R.reset(); this.u2R.reset(); this.d2R.reset(); this.d1R.reset();
    this.dryL.reset(); this.dryR.reset(); this.monoRun = false;
    this.chDl1.reset(); this.chDl2.reset();
    this.dlL.reset(); this.dlR.reset(); this.dlDamp.reset();
    this.chPhase = 0;
    this.driveColorL.reset(); this.driveColorR.reset(); this.comp.reset();
    this.ott.reset(); this.eq.reset(); this.lab.reset();
    this.meterInput = 0; this.meterOtt = 0; this.meterCompIn = 0; this.meterCompOut = 0;
    this.meterEchoIn = 0; this.meterEchoL = 0; this.meterEchoR = 0;
  }

  setParams(pv, f) {
    this.eq.setParams(k => pv[f[fid(k)]]);
    const lab = {};
    lab.crushOn = pv[f[fid('fx.crush.on')]] > 0.5;
    lab.crushBits = pv[f[fid('fx.crush.bits')]];
    lab.crushRate = pv[f[fid('fx.crush.rate')]];
    lab.crushChaos = pv[f[fid('fx.crush.chaos')]];
    lab.crushMix = pv[f[fid('fx.crush.mix')]];
    lab.resoOn = pv[f[fid('fx.reso.on')]] > 0.5;
    lab.resoNote = pv[f[fid('fx.reso.note')]];
    lab.resoChord = pv[f[fid('fx.reso.chord')]];
    lab.resoDecay = pv[f[fid('fx.reso.decay')]];
    lab.resoMix = pv[f[fid('fx.reso.mix')]];
    lab.shiftOn = pv[f[fid('fx.shift.on')]] > 0.5;
    lab.shiftHz = pv[f[fid('fx.shift.hz')]];
    lab.shiftFb = pv[f[fid('fx.shift.fb')]];
    lab.shiftSpread = pv[f[fid('fx.shift.spread')]];
    lab.shiftMix = pv[f[fid('fx.shift.mix')]];
    lab.sprayOn = pv[f[fid('fx.spray.on')]] > 0.5;
    lab.sprayPitch = pv[f[fid('fx.spray.pitch')]];
    lab.sprayDensity = pv[f[fid('fx.spray.density')]];
    lab.sprayScatter = pv[f[fid('fx.spray.scatter')]];
    lab.sprayMix = pv[f[fid('fx.spray.mix')]];
    lab.glitchOn = pv[f[fid('fx.glitch.on')]] > 0.5;
    lab.glitchDiv = pv[f[fid('fx.glitch.div')]];
    lab.glitchChance = pv[f[fid('fx.glitch.chance')]];
    lab.glitchDrift = pv[f[fid('fx.glitch.drift')]];
    lab.glitchMix = pv[f[fid('fx.glitch.mix')]];
    this.lab.setParams(lab, pv[G_BPM] || 126);
    this.driveColorL.setParams(pv[f[fid('fx.drive.type')]], pv[f[fid('fx.drive.tone')]]);
    this.driveColorR.setParams(pv[f[fid('fx.drive.type')]], pv[f[fid('fx.drive.tone')]]);
    const amt = pv[f[P_FXDRIVE_AMT]];
    if (amt !== this.driveAmt) {
      this.driveAmt = amt;
      this.drivePre = 1 + amt * 2;
      this.driveK = 1 + amt * 12;
      this.driveNorm = 1 / (this.drivePre * Math.tanh(this.driveK));
    }
    const dOn = pv[f[P_FXDRIVE_ON]] > 0.5;
    this.driveOff = !dOn;
    this.driveWet.target = mixGate(dOn, pv[f[P_FXDRIVE_MIX]], true);
    this.driveDry.target = mixGate(dOn, pv[f[P_FXDRIVE_MIX]], false);

    // Legacy makeup is retained in saved/native patches, not applied on web.
    this.comp.setParams(pv[f[P_FXCOMP_ON]] > 0.5, pv[f[P_FXCOMP_THR]], pv[f[fid('fx.comp.att')]], pv[f[fid('fx.comp.rel')]], pv[f[fid('fx.comp.ratio')]]);
    // Side-chain (src/engine/sidechain.ts DRUM_SC_SOURCES): 1..16 a pad of this
    // kit, 17..19 SQ-4 tracks 2..4. The processor hands in keyL/keyR per block.
    this.keySource = Math.round(pv[f[fid('fx.comp.sc')]] || 0);
    this.comp.setKey(this.keySource > 0, pv[f[fid('fx.comp.schp')]]);
    this.ott.setParams(pv[f[P_FXOTT_ON]] > 0.5, pv[f[P_FXOTT_DEPTH]],
      pv[f[P_FXOTT_TIME]], pv[f[P_FXOTT_UP]], pv[f[P_FXOTT_DOWN]]);

    this.chRate = pv[f[P_FXCHORUS_RATE]];
    this.chDepth = pv[f[P_FXCHORUS_DEPTH]];
    const cOn = pv[f[P_FXCHORUS_ON]] > 0.5;
    this.chorusOff = !cOn;
    this.chWet.target = mixGate(cOn, pv[f[P_FXCHORUS_MIX]] * 0.8, true);
    this.chDry.target = mixGate(cOn, pv[f[P_FXCHORUS_MIX]] * 0.8, false);

    this.dlTime.target = pv[f[P_FXDELAY_TIME]];
    this.dlFb.target = pv[f[P_FXDELAY_FB]];
    const delOn = pv[f[P_FXDELAY_ON]] > 0.5;
    this.delayOff = !delOn;
    this.dlWet.target = mixGate(delOn, pv[f[P_FXDELAY_MIX]] * 0.85, true);
    this.dlDry.target = mixGate(delOn, pv[f[P_FXDELAY_MIX]] * 0.85, false);

    const rOn = pv[f[P_FXREVERB_ON]] > 0.5;
    this.verbOn = rOn;
    this.verbSize = Math.min(1, Math.max(0, pv[f[P_FXREVERB_SIZE]]));
    const rAmt = pv[f[P_FXREVERB_MIX]] * 0.9;
    this.verbWet.target = mixGate(rOn, rAmt, true);
    this.verbDry.target = mixGate(rOn, rAmt, false);

    this.bus = Math.max(0, Math.min(BUSES - 1, pv[f[P_OUT]] | 0));
  }

  // Hold-off before the gate may close: one full delay round trip plus
  // GATE_HOLD, so an echo still in flight can never be cut.
  holdSamples() {
    const extra = Math.max(this.delayOff ? 0 : this.dlTime.target,
      Object.entries(this.lab.settings).some(([key, value]) => key.endsWith('On') && value) ? 4 : 0);
    return (GATE_HOLD + extra) * this.sr;
  }

  shape(x) { return Math.tanh(x * this.driveK) * this.driveNorm; }

  // One channel of a block through the 4x oversampled shaper: interpolate to
  // 2x then 4x, shape, decimate back. Stage at a time, so each FIR's taps are
  // loaded once per block rather than once per sample.
  //
  // INVARIANT: driveK/driveNorm/drivePre are block-rate. setParams runs once
  // per block, before any pad renders, so shaping a whole block under one set
  // of gains is exactly what the sample-at-a-time form did (verified: 0.0
  // difference over 76800 samples with AMT stepping every block). Only the
  // wet/dry mix moves per sample, and that is applied after this returns.
  // If a drive coefficient is ever ramped INSIDE a block — a J1-style smoother
  // on the FX amounts would do it — this must be called once per coefficient
  // chunk instead. Ignoring that diverges by ~0.3 full scale, not by an epsilon.
  driveBlock(u1, u2, d2, d1, out, n) {
    u1.interpBlock(OS_IN, OS_X2, n);
    u2.interpBlock(OS_X2, OS_X4, 2 * n);
    const color = u1 === this.u1L ? this.driveColorL : this.driveColorR;
    const K = this.driveK, norm = this.driveNorm, m = 4 * n;
    for (let i = 0; i < m; i++) OS_X4[i] = color.shape(OS_X4[i], K, norm);
    d2.decimBlock(OS_X4, OS_Y2, 2 * n);
    d1.decimBlock(OS_Y2, out, n);
  }

  // Returns false when the chain is gated and contributed nothing. `live` is
  // false when no voice wrote into the buffer this block, so the input is
  // known to be silent without scanning it.
  process(L, R, n, live) {
    let inPk = 0;
    if (live) {
      for (let i = 0; i < n; i++) {
        const a = L[i] < 0 ? -L[i] : L[i], b = R[i] < 0 ? -R[i] : R[i];
        if (a > inPk) inPk = a;
        if (b > inPk) inPk = b;
      }
    }
    if (this.gated) {
      if (inPk <= GATE_EPS) return false;
      this.gated = false;
      this.silentFor = 0;
    }

    // Gate a stage only when it is OFF; mix == 0 while ON must keep its state
    // accumulating, exactly as the C++ chain does.
    const driveGate = this.driveOff && this.driveWet.target === 0 && Math.abs(this.driveWet.cur) < 1e-6;

    const chorusGate = this.chorusOff && this.chWet.target === 0 && Math.abs(this.chWet.cur) < 1e-6;
    const delayGate = this.delayOff && this.dlWet.target === 0 && Math.abs(this.dlWet.cur) < 1e-6;
    if (driveGate && !this.driveGated) {
      this.driveWet.snap(0); this.driveDry.snap(1);
      this.driveColorL.reset(); this.driveColorR.reset();
      this.u1L.reset(); this.u2L.reset(); this.d2L.reset(); this.d1L.reset();
      this.u1R.reset(); this.u2R.reset(); this.d2R.reset(); this.d1R.reset();
    }

    if (chorusGate && !this.chorusGated) { this.chWet.snap(0); this.chDry.snap(1); this.chDl1.reset(); this.chDl2.reset(); }
    if (delayGate && !this.delayGated) { this.dlWet.snap(0); this.dlDry.snap(1); this.dlL.reset(); this.dlR.reset(); this.dlDamp.reset(); this.delayFeedbackGuard.reset(); }
    this.driveGated = driveGate;
    this.chorusGated = chorusGate; this.delayGated = delayGate;
    if (this.meterSelected) for (let i = 0; i < n; i++) this.meterInput += 0.5 * (L[i] * L[i] + R[i] * R[i]);
    this.headroom.input.process(L, R, n);
    this.eq.process(L, R, n);

    // ---- OTT -> compressor (automatic level matching) ----
    this.ott.process(L, R, n);
    if (this.meterSelected) for (let i = 0; i < n; i++) this.meterOtt += 0.5 * (L[i] * L[i] + R[i] * R[i]);
    this.headroom.ott.process(L, R, n);
    if (this.meterSelected) for (let i = 0; i < n; i++) this.meterCompIn += 0.5 * (L[i] * L[i] + R[i] * R[i]);
    this.comp.process(L, R, n, this.keyL, this.keyR);
    if (this.meterSelected) for (let i = 0; i < n; i++) this.meterCompOut += 0.5 * (L[i] * L[i] + R[i] * R[i]);
    this.headroom.comp.process(L, R, n);

    // ---- drive (4x oversampled tanh waveshaper) ----
    // The dry path always runs through the DRIVE_LATENCY delay, so the mix
    // stays time-aligned with the FIR group delay and the reported chain
    // latency is constant whether the drive is active or gated.
    let mono = true;
    for (let i = 0; i < n; i++) if (L[i] !== R[i]) { mono = false; break; }
    if (!mono && this.monoRun) this.syncRight();
    this.monoRun = mono;
    if (this.dbL.length < n) { this.dbL = new Float32Array(n); this.dbR = new Float32Array(n); }
    const dbL = this.dbL, dbR = this.dbR;
    this.dryL.block(L, dbL, n);
    if (!mono) this.dryR.block(R, dbR, n);
    if (this.driveGated) {
      for (let i = 0; i < n; i++) L[i] = dbL[i];
      if (mono) { for (let i = 0; i < n; i++) R[i] = dbL[i]; } else { for (let i = 0; i < n; i++) R[i] = dbR[i]; }
    } else {
      const pre = this.drivePre;
      osScratch(n);
      if (this.wetL.length < n) { this.wetL = new Float64Array(n); this.wetR = new Float64Array(n); }
      for (let i = 0; i < n; i++) OS_IN[i] = pre * L[i];
      this.driveBlock(this.u1L, this.u2L, this.d2L, this.d1L, this.wetL, n);
      if (!mono) {
        for (let i = 0; i < n; i++) OS_IN[i] = pre * R[i];
        this.driveBlock(this.u1R, this.u2R, this.d2R, this.d1R, this.wetR, n);
      }
      for (let i = 0; i < n; i++) {
        const wet = this.driveWet.next(), dry = this.driveDry.next();
        const dl = dry * dbL[i] + wet * this.driveColorL.processTone(this.wetL[i]);
        L[i] = dl;
        R[i] = dry * (mono ? dbL[i] : dbR[i]) + wet * this.driveColorR.processTone(mono ? this.wetL[i] : this.wetR[i]);
      }
    }

    this.headroom.drive.process(L, R, n);
    for (let i = 0; i < n; i++) {
      this.lab.processSample(L[i], R[i]);
      L[i] = this.lab.out[0]; R[i] = this.lab.out[1];
    }

    // ---- chorus (two modulated taps, stereo) ----
    if (!this.chorusGated) {
      const sr = this.sr, inc = this.chRate / sr;
      const depth = 0.0008 + this.chDepth * 0.0045;
      let ph = this.chPhase;
      for (let i = 0; i < n; i++) {
        ph += inc;
        if (ph >= 1) ph -= 1;
        const lfo = Math.sin(2 * Math.PI * ph);
        const mono = 0.5 * (L[i] + R[i]);
        this.chDl1.write(mono); this.chDl2.write(mono);
        const c1 = this.chDl1.readHermite((0.012 + depth * lfo) * sr);
        const c2 = this.chDl2.readHermite((0.017 - depth * 0.8 * lfo) * sr);
        const wet = this.chWet.next(), dry = this.chDry.next();
        L[i] = dry * L[i] + wet * c1;
        R[i] = dry * R[i] + wet * c2;
      }
      this.chPhase = ph;
    }

    this.headroom.chorus.process(L, R, n);

    // ---- ping-pong delay ----
    if (!this.delayGated) {
      const sr = this.sr;
      for (let i = 0; i < n; i++) {
        const dt = this.dlTime.next() * sr;
        const fb = this.dlFb.next();
        const dL = this.dlL.readHermite(dt);
        const dR = this.dlR.readHermite(dt);
        if (this.meterSelected) {
          this.meterEchoIn += 0.5 * (L[i] * L[i] + R[i] * R[i]);
        }
        const mono = 0.5 * (L[i] + R[i]);
        const feedbackL = mono + fb * dR;
        const feedbackR = this.dlDamp.process(fb * dL);
        const feedbackGain = this.delayFeedbackGuard.gainFor(feedbackL, feedbackR);
        this.dlL.write(feedbackL * feedbackGain);
        this.dlR.write(feedbackR * feedbackGain);
        const wet = this.dlWet.next(), dry = this.dlDry.next();
        if (this.meterSelected) {
          this.meterEchoL += (wet * dL) * (wet * dL); this.meterEchoR += (wet * dR) * (wet * dR);
        }
        L[i] = dry * L[i] + wet * dL;
        R[i] = dry * R[i] + wet * dR;
      }
    }

    this.headroom.delay.process(L, R, n);
    let outPk = 0;
    for (let i = 0; i < n; i++) {
      const a = L[i] < 0 ? -L[i] : L[i], b = R[i] < 0 ? -R[i] : R[i];
      if (a > outPk) outPk = a;
      if (b > outPk) outPk = b;
    }
    this.outPk = outPk;
    if (inPk <= GATE_EPS && outPk <= GATE_EPS) {
      this.silentFor += n;
      if (this.silentFor >= this.holdSamples()) this.gated = true;
    } else {
      this.silentFor = 0;
    }
    return true;
  }
}

// Per-bus output stage (review D1): master gain -> DC block -> lookahead
// limiter, once on the summed bus. MAIN therefore has a real -1 dBFS ceiling.
class BusOut {
  constructor(sr) {
    this.sr = sr;
    this.inputGuard = new StereoPeakGuard(sr);
    this.gain = new Smooth(sr, FX_TAU);
    this.dcL = new Biquad(); this.dcL.highpass(8, 0.707, sr);
    this.dcR = new Biquad(); this.dcR.highpass(8, 0.707, sr);
    // WebAudio's DynamicsCompressor applies a spec-defined makeup gain
    // ((1/c(1))^0.6). The web limiter WAS that node, so keep its ~4.5 dB ahead
    // of the lookahead limiter or the port sits under the old loudness.
    const c1 = Math.pow(1 / LIM_THR, 1 / LIM_RATIO - 1);
    this.lim = new LookaheadLimiter(sr, Math.pow(1 / c1, 0.6));
    this.silentFor = 1e9; this.gated = true;
  }
  latencySamples() { return this.lim.la; }
  process(L, R, n, inPk) {
    if (this.gated) {
      if (inPk <= GATE_EPS) return false;
      this.gated = false;
      this.silentFor = 0;
    }
    this.inputGuard.process(L, R, n);
    const g0 = this.gain.cur, g1 = this.gain.nextN(n);
    const dg = n > 0 ? (g1 - g0) / n : 0;
    for (let i = 0; i < n; i++) {
      const g = g0 + dg * i;
      L[i] = this.dcL.process(L[i] * g);
      R[i] = this.dcR.process(R[i] * g);
    }
    this.lim.process(L, R, n);
    let outPk = 0;
    for (let i = 0; i < n; i++) {
      const a = L[i] < 0 ? -L[i] : L[i], b = R[i] < 0 ? -R[i] : R[i];
      if (a > outPk) outPk = a;
      if (b > outPk) outPk = b;
    }
    if (inPk <= GATE_EPS && outPk <= GATE_EPS) {
      this.silentFor += n;
      if (this.silentFor >= GATE_HOLD * this.sr) this.gated = true;
    } else {
      this.silentFor = 0;
    }
    return true;
  }
}

// ---------- flat parameter store ----------
// `pad<i>.<field>` resolves to `i * NF + field` once, in the message handler.
// The render loop never builds a key string and never hashes one (review D7).
const OSC_FIELDS = ['table', 'pos', 'tune', 'fine', 'phase', 'unison', 'detune', 'level'];
const FIELDS = [
  ...OSC_FIELDS.map((f) => 'oscA.' + f),
  ...OSC_FIELDS.map((f) => 'oscB.' + f),
  'noise.color', 'noise.level', 'ring.freq', 'ring.mix',
  'penv.amt', 'penv.dec', 'aenv.att', 'aenv.hold', 'aenv.dec', 'aenv.curve',
  'flt.on', 'flt.type', 'flt.cut', 'flt.res', 'flt.drive',
  'mod1.src', 'mod1.dst', 'mod1.amt', 'mod2.src', 'mod2.dst', 'mod2.amt',
  'mod3.src', 'mod3.dst', 'mod3.amt', 'mod4.src', 'mod4.dst', 'mod4.amt',
  'modenv.dec', 'lvl', 'pan', 'v2l', 'v2m', 'choke', 'out',
  // FX rack — these used to live in native WebAudio nodes on the main thread
  // and never reached the worklet at all (review W6).
  'fx.drive.on', 'fx.drive.amt', 'fx.drive.mix',
  'fx.comp.on', 'fx.comp.thr', 'fx.comp.gain',
  'fx.chorus.on', 'fx.chorus.rate', 'fx.chorus.depth', 'fx.chorus.mix',
  'fx.delay.on', 'fx.delay.time', 'fx.delay.fb', 'fx.delay.mix',
  'fx.reverb.on', 'fx.reverb.size', 'fx.reverb.mix',
  'fx.ott.on', 'fx.ott.depth', 'fx.ott.time', 'fx.ott.up', 'fx.ott.down', 'fx.ott.gain',
  ...globalThis.FableEqFields,
  'fx.comp.att', 'fx.comp.rel', 'fx.comp.ratio', 'fx.drive.tone', 'fx.drive.type',
  'fx.crush.on', 'fx.crush.bits', 'fx.crush.rate', 'fx.crush.chaos', 'fx.crush.mix', 'fx.reso.on', 'fx.reso.note', 'fx.reso.chord', 'fx.reso.decay', 'fx.reso.mix', 'fx.shift.on', 'fx.shift.hz', 'fx.shift.fb', 'fx.shift.spread', 'fx.shift.mix', 'fx.spray.on', 'fx.spray.pitch', 'fx.spray.density', 'fx.spray.scatter', 'fx.spray.mix', 'fx.glitch.on', 'fx.glitch.div', 'fx.glitch.chance', 'fx.glitch.drift', 'fx.glitch.mix',
  'fx.comp.sc', 'fx.comp.schp',
];
const NF = FIELDS.length;
const fid = (name) => FIELDS.indexOf(name);

// Offsets inside an oscillator group (oscA and the sample layer share it).
const A_TABLE = 0, A_POS = 1, A_TUNE = 2, A_FINE = 3;
const A_PHASE = 4, A_UNISON = 5, A_DETUNE = 6, A_LEVEL = 7;
const OSC_A = 0, OSC_B = 8;

const P_NOISE_COLOR = fid('noise.color'), P_NOISE_LEVEL = fid('noise.level');
const P_RING_FREQ = fid('ring.freq'), P_RING_MIX = fid('ring.mix');
const P_PENV_AMT = fid('penv.amt'), P_PENV_DEC = fid('penv.dec');
const P_AENV_ATT = fid('aenv.att'), P_AENV_HOLD = fid('aenv.hold');
const P_AENV_DEC = fid('aenv.dec'), P_AENV_CURVE = fid('aenv.curve');
const P_FLT_ON = fid('flt.on'), P_FLT_TYPE = fid('flt.type');
const P_FLT_CUT = fid('flt.cut'), P_FLT_RES = fid('flt.res'), P_FLT_DRIVE = fid('flt.drive');
const P_MOD1 = fid('mod1.src'); // src, dst, amt triplets, 3 apart
const P_MODENV_DEC = fid('modenv.dec');
const P_LVL = fid('lvl'), P_PAN = fid('pan');
const P_V2L = fid('v2l'), P_V2M = fid('v2m'), P_CHOKE = fid('choke'), P_OUT = fid('out');
const P_FXDRIVE_ON = fid('fx.drive.on'), P_FXDRIVE_AMT = fid('fx.drive.amt'), P_FXDRIVE_MIX = fid('fx.drive.mix');
const P_FXCOMP_ON = fid('fx.comp.on'), P_FXCOMP_THR = fid('fx.comp.thr');
const P_FXOTT_ON = fid('fx.ott.on'), P_FXOTT_DEPTH = fid('fx.ott.depth'), P_FXOTT_TIME = fid('fx.ott.time');
const P_FXOTT_UP = fid('fx.ott.up'), P_FXOTT_DOWN = fid('fx.ott.down');
const P_FXCHORUS_ON = fid('fx.chorus.on'), P_FXCHORUS_RATE = fid('fx.chorus.rate');
const P_FXCHORUS_DEPTH = fid('fx.chorus.depth'), P_FXCHORUS_MIX = fid('fx.chorus.mix');
const P_FXDELAY_ON = fid('fx.delay.on'), P_FXDELAY_TIME = fid('fx.delay.time');
const P_FXDELAY_FB = fid('fx.delay.fb'), P_FXDELAY_MIX = fid('fx.delay.mix');
const P_FXREVERB_ON = fid('fx.reverb.on'), P_FXREVERB_SIZE = fid('fx.reverb.size'), P_FXREVERB_MIX = fid('fx.reverb.mix');

// Global FX controls are a second, post-mix chain. Their field order matches
// the pad insert suffixes, letting PadFx be reused without sharing state.
const GROUP_FX_FIELDS = FIELDS.slice(P_FXDRIVE_ON);
const GLOBALS = ['seq.bpm', 'master.swing', 'master.volume', ...GROUP_FX_FIELDS];
const G_BPM = NPADS * NF, G_SWING = G_BPM + 1, G_VOL = G_BPM + 2;
const G_FX = G_VOL + 1;
const PSIZE = NPADS * NF + GLOBALS.length;

const PARAM_INDEX = new Map();
for (let i = 0; i < NPADS; i++) {
  for (let f = 0; f < NF; f++) PARAM_INDEX.set('pad' + i + '.' + FIELDS[f], i * NF + f);
}
GLOBALS.forEach((g, i) => PARAM_INDEX.set(g, NPADS * NF + i));

// Modulation destinations, in `dst` order (1..9).
const M_POSA = 0, M_POSB = 1, M_LEVEL = 2, M_CUT = 3, M_PITCH = 4;
const M_FINEA = 5, M_FINEB = 6, M_NOISE = 7, M_RES = 8;
const M_SCALE = [1, 1, 1, 1, 24, 200, 200, 1, 1];
const NMOD = 9;

function makeOscState() {
  return {
    phases: new Float64Array(MAXUNI),
    incs: new Float64Array(MAXUNI),
    incsEnd: new Float64Array(MAXUNI),
    pIncs: new Float64Array(MAXUNI),
    gl: new Float32Array(MAXUNI),
    gr: new Float32Array(MAXUNI),
    uni: 1, pUni: 1, pData: null, havePrev: false,
    frame0: 0, frame1: 0, maxInc0: 0, maxInc1: 0, mips: 0,
    off0: 0, off1: 0, off0b: 0, off1b: 0,
    blend: 0, blendEnd: 0,
    ft: 0, ftEnd: 0,
    gain: 0, mask: 0, size: 0, data: null, posSm: -1,
  };
}

function makeSampleState() {
  return {
    pos: -1, index: -1, done: false,
    havePrev: false, pStep: 0,
  };
}

function makeFilterState() {
  return {
    svf: new Float64Array(8),
    // The outgoing filter type keeps running on a copy of the state for the
    // length of the crossfade, so a type switch is not a step (JUCE parity).
    svfOld: new Float64Array(8),
    ftypeOld: 0, twoPoleOld: false,
    xfLeft: 0, xfLen: 1,
    cutSm: 0,
    osL: makeDriveOs(), osR: makeDriveOs(), adaaMix: 0,
    ftype: 0, twoPole: false,
    a1: 0, a2: 0, a3: 0, k1: 0,
  };
}

class PadVoice {
  constructor() {
    this.active = false;
    this.vel = 1; this.rand = 0;
    this.t = 0;
    this.ampLevel = 0; this.choking = false; this.chokeSm = 0;
    this.oA = makeOscState(); this.sample = makeSampleState();
    this.f = makeFilterState();
    this.noiseY = 0;
    this.ringPhase = 0.25;
    this.dcxL = 0; this.dcxR = 0; this.dcyL = 0; this.dcyR = 0;
  }

  trigger(v, rand) {
    this.active = true; this.choking = false;
    this.vel = v; this.rand = rand;
    this.t = 0; this.ampLevel = 0;
    this.oA.posSm = -1;
    this.oA.havePrev = false;
    this.oA.pData = null;
    this.sample.pos = -1; this.sample.index = -1; this.sample.done = false;
    this.sample.havePrev = false;
    this.f.svf.fill(0); this.f.cutSm = 0; resetDriveOs(this.f.osL); resetDriveOs(this.f.osR); this.f.adaaMix = 0;
    this.f.xfLeft = 0;
    this.noiseY = 0;
    this.ringPhase = 0.25;
    this.dcxL = this.dcxR = this.dcyL = this.dcyR = 0;
  }

  choke() { if (this.active && !this.choking) { this.choking = true; this.chokeSm = this.ampLevel; } }
  kill() {
    this.active = false; this.choking = false; this.ampLevel = 0;
    this.oA.havePrev = false; this.oA.pData = null;
  }
}

class DrumProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.pv = new Float64Array(PSIZE);
    this.tables = [];
    this.samples = [];
    // padIds[i][field] — the flat store index of every field of pad i.
    this.padIds = [];
    for (let i = 0; i < NPADS; i++) {
      const ids = new Int32Array(NF);
      for (let f = 0; f < NF; f++) ids[f] = i * NF + f;
      this.padIds.push(ids);
    }
    this.voices = [];
    // One fading tail slot per pad: a retrigger moves the sounding hit here
    // and fades it, instead of cutting it to zero in one sample (review D2).
    this.tails = [];
    this.fades = []; // second fade slot, used only by a retrigger collision
    for (let i = 0; i < NPADS; i++) {
      this.voices.push(new PadVoice()); this.tails.push(new PadVoice()); this.fades.push(new PadVoice());
    }
    this.pats = new Uint8Array(NPATTERNS * NPADS * STEPS);
    this.chain = [0]; this.chainPos = 0;
    this.playing = false;
    this.step = -1;
    this.samplesToNext = 0;
    this.rhythm = null;
    this.lanePositions = new Int16Array(NPADS).fill(-1);
    this.polyOrdinal = 0;
    this.microState = [false, true].map(() => ({ ready: false, ordinal: new Float64Array(NPADS), consumed: new Uint32Array(NPADS), topology: Array(NPADS).fill('') }));
    this.polyFitOrdinal = new Int32Array(NPADS);
    this.polyFitAt = new Float64Array(NPADS);
    this.polyDue = new Int32Array(NPADS);
    this.polyDueCount = 0;
    this.sel = 0;
    this.rng = new Rng(0x1d3c5b7f);
    this.dcR = Math.pow(DC_R_48, NOISE_SR / sampleRate);
    this.m0 = new Float64Array(NMOD);
    this.m1 = new Float64Array(NMOD);
    // ---- hosted clip transport (SQ-4, docs/sq4-clips.md §6) ----
    this.hosted = false;
    this.hostBpm = 120;
    this.hostSwing = 0;
    this.hostAnchor = 0; // songStartFrame — the shared timebase's beat zero
    this.clip = null; // { data, bars, rhythm }
    this.clipPend = null; // { data, bars, rhythm, at }
    this.hostPolyOrdinal = 0;
    this.hostPolyFitOrdinal = new Int32Array(NPADS);
    this.clipStopAt = -1;
    this.clipStep = -1; // absolute step within the clip
    this.clipToNext = 0;
    this.autoHeld = new Map(); // param index -> stored value while automated
    this.autoLanes = null;
    this.seqAuto = null; // standalone sequence automation
    this.vizCount = 0;
    // Pad inserts feed their routed buses; a second, same-control group chain
    // follows each physical output sum. Those instances form one logical DR-1
    // group strip while preserving separate MAIN/AUX output streams.
    this.padFx = [];
    for (let i = 0; i < NPADS; i++) this.padFx.push(new PadFx(sampleRate));
    this.groupFx = []; this.groupFxIds = new Int32Array(NF);
    for (let f = P_FXDRIVE_ON; f < NF; f++) this.groupFxIds[f] = G_FX + f - P_FXDRIVE_ON;
    this.busOut = []; this.verbs = []; this.verbInputGuards = [];
    this.groupVerbs = []; this.groupVerbInputGuards = [];
    for (let b = 0; b < BUSES; b++) {
      this.busOut.push(new BusOut(sampleRate)); this.verbs.push(new Freeverb(sampleRate));
      this.verbInputGuards.push(new StereoPeakGuard(sampleRate));
      this.groupFx.push(new PadFx(sampleRate)); this.groupVerbs.push(new Freeverb(sampleRate));
      this.groupVerbInputGuards.push(new StereoPeakGuard(sampleRate));
    }
    this.sizeAcc = new Float64Array(BUSES);
    this.sizeW = new Float64Array(BUSES);
    this.metering = false; this.meterSamples = 0; this.meterEnergy = new Float64Array(4); this.meterReduction = 0;
    this.echoMetering = false; this.echoSamples = 0; this.echoEnergy = new Float64Array(3);
    this.reverbMetering = false; this.reverbSamples = 0; this.reverbEnergy = new Float64Array(3);
    this.meterPad = 0; this.meterBus = 0;
    // Kit auto-mix capture: each live pad's post-FX mono signal, posted in
    // CAPTURE_LEN blocks with the frame count since capture started.
    this.keyIn = null;
    this.keyDryL = []; this.keyDryR = []; // sized in ensureCap
    this.padCapture = false; this.capFrames = 0;
    this.capBuf = Array.from({ length: NPADS }, () => new Float32Array(CAPTURE_LEN));
    this.capLen = new Int32Array(NPADS);
    this.fxDirty = true;
    // Reported the way the plugin does: drive FIR group delay + limiter
    // lookahead. Constant whether a stage is active, bypassed or gated.
    this.latency = DRIVE_LATENCY * 2 + this.busOut[0].latencySamples();
    this.cap = 0;
    this.padL = []; this.padR = [];
    this.busL = []; this.busR = []; this.verbInL = []; this.verbInR = [];
    this.ensureCap(128);
    // Timeline automation lanes (devices/param-automation-worklet.js).
    this.pauto = globalThis.FableParamAutomation ? new globalThis.FableParamAutomation() : null;
    this.pautoSet = (k, v) => this.onMsg({ t: 'p', k, v });
    this.port.onmessage = (e) => this.onMsg(e.data);
    this.port.postMessage({ t: 'latency', n: this.latency });
    // Timeline host (NodeTool): frame-stamped note events, every bus summed
    // into output 0, and an offline render's whole state up front.
    const po = (options && options.processorOptions) || {};
    this.mixdown = !!po.mixdown;
    this.baseNote = Number.isFinite(po.baseNote) ? po.baseNote : 36;
    this.evq = [];
    this.evHead = 0;
    this.hitPads = 0;
    if (po.tables) this.setTables(po.tables);
    if (po.samples) this.setSamples(po.samples);
    if (po.params) this.onMsg({ t: 'init', params: po.params });
    if (po.events) this.queueEvents(po.events);
  }

  setTables(list) {
    this.tables = list.map((x) => ({
      frames: x.frames, mips: x.mips, size: x.size, mask: x.size - 1,
      data: new Float32Array(x.buf),
    }));
  }

  setSamples(list) {
    this.samples = list.map((x) => ({
      sampleRate: x.sampleRate,
      data: new Float32Array(x.buf),
    }));
  }

  // `ev` is flat [frame, on, pitch, velocity] quadruples. The queue stays
  // sorted by frame; equal frames keep their arrival order.
  queueEvents(ev) {
    const pending = this.evq.slice(this.evHead);
    for (let i = 0; i + 3 < ev.length; i += 4) pending.push([ev[i], ev[i + 1], ev[i + 2], ev[i + 3]]);
    pending.sort((a, b) => a[0] - b[0]);
    this.evq = pending;
    this.evHead = 0;
  }

  applyEvent(e) {
    // Pads are one-shots: a note-off has nothing to release.
    if (!e[1] || e[3] <= 0) return;
    const padI = Math.round(e[2]) - this.baseNote;
    if (padI < 0 || padI >= NPADS) return;
    this.trigger(padI, e[3]);
    this.hitPads |= 1 << padI;
  }

  // Scratch buffers for one render quantum. 128 in every browser today; grown
  // once if a host ever asks for more, never inside the render loop.
  ensureCap(n) {
    if (n <= this.cap) return;
    this.cap = n;
    for (let i = 0; i < NPADS; i++) { this.padL[i] = new Float32Array(n); this.padR[i] = new Float32Array(n); }
    for (let i = 0; i < NPADS; i++) { this.keyDryL[i] = new Float32Array(n); this.keyDryR[i] = new Float32Array(n); }
    for (let b = 0; b < BUSES; b++) {
      this.busL[b] = new Float32Array(n); this.busR[b] = new Float32Array(n);
      this.verbInL[b] = new Float32Array(n); this.verbInR[b] = new Float32Array(n);
    }
    this.tmpL = new Float32Array(n); this.tmpR = new Float32Array(n);
    this.fL = new Float32Array(n); this.fR = new Float32Array(n);
    this.xL = new Float32Array(n); this.xR = new Float32Array(n);
  }

  setParam(k, v) {
    const i = PARAM_INDEX.get(k);
    if (i === undefined) return;
    const tempoChange = this.playing && (i === G_BPM || i === G_SWING);
    const oldBpm = this.pv[G_BPM] || 126;
    const oldSwing = this.pv[G_SWING] || 0;
    this.pv[i] = v;
    this.fxDirty = true;
    if (tempoChange && (
      (this.pv[G_BPM] || 126) !== oldBpm ||
      (this.pv[G_SWING] || 0) !== oldSwing
    ))
      this.retimeStandalone(oldBpm, oldSwing, this.pv[G_BPM] || 126, this.pv[G_SWING] || 0, currentFrame);
  }

  onMsg(d) {
    if (this.pauto && this.pauto.onMsg(d, this.port)) return;
    switch (d.t) {
      case 'dynamics':
        this.metering = !!d.on; this.meterEnergy.fill(0); this.meterSamples = 0; this.meterReduction = 0;
        break;
      case 'echo':
        this.echoMetering = !!d.on; this.echoEnergy.fill(0); this.echoSamples = 0;
        break;
      case 'reverb':
        this.reverbMetering = !!d.on; this.reverbEnergy.fill(0); this.reverbSamples = 0;
        break;
      case 'padCapture':
        this.padCapture = !!d.on; this.capFrames = 0; this.capLen.fill(0);
        break;
      case 'meterPad':
        this.meterPad = Math.max(0, Math.min(NPADS - 1, d.pad | 0));
        this.meterEnergy.fill(0); this.echoEnergy.fill(0); this.reverbEnergy.fill(0);
        this.meterSamples = this.echoSamples = this.reverbSamples = 0;
        this.meterReduction = 0;
        for (const fx of this.padFx) {
          fx.meterInput = fx.meterOtt = fx.meterCompIn = fx.meterCompOut = 0;
          fx.meterEchoIn = fx.meterEchoL = fx.meterEchoR = 0;
        }
        break;
      case 'init':
        for (const k in d.params) {
          const v = d.params[k];
          if (Number.isFinite(v)) this.setParam(k, v);
        }
        break;
      case 'p': {
        if (!Number.isFinite(d.v)) break;
        // An automated param keeps the knob edit as its stored value.
        const i = PARAM_INDEX.get(d.k);
        if (i !== undefined && this.autoHeld.has(i)) this.autoHeld.set(i, d.v);
        else this.setParam(d.k, d.v);
        break;
      }
      case 'seed': this.rng = new Rng(d.v | 0); break;
      case 'tables': this.setTables(d.list); break;
      case 'samples': this.setSamples(d.list); break;
      case 'evs': this.queueEvents(d.ev); break;
      case 'evclear': this.evq = []; this.evHead = 0; break;
      case 'base': if (Number.isFinite(d.note)) this.baseNote = d.note; break;
      case 'trig': this.trigger(d.pad | 0, d.v); break;
      case 'pats': this.pats = new Uint8Array(d.data.slice(0)); break;
      case 'seq':
        if (d.data) this.pats = new Uint8Array(d.data.slice(0));
        if (Array.isArray(d.chain) && d.chain.length) this.chain = d.chain.map(x => Math.max(0, Math.min(NPATTERNS - 1, x | 0)));
        this.setRhythm(d.rhythm ?? d.drumRhythm);
        break;
      case 'rhythm': this.setRhythm(d.rhythm ?? d.drumRhythm); break;
      case 'chain':
        if (Array.isArray(d.list) && d.list.length) {
          // Clamp like JUCE does: an out-of-range entry used to select a
          // pattern slot that does not exist and play a silent bar (D6).
          this.chain = d.list.map((x) => Math.max(0, Math.min(NPATTERNS - 1, x | 0)));
          this.chainPos = Math.min(this.chainPos, this.chain.length - 1);
        }
        break;
      case 'play':
        if (this.hosted) break; // conductor owns the transport
        this.playing = true; this.step = -1; this.chainPos = 0; this.samplesToNext = 0;
        this.resetPoly(currentFrame);
        this.port.postMessage({ t: 'anchor', frame: this.polyAnchor });
        break;
      case 'stop': this.playing = false; this.step = -1; break;
      case 'sel': this.sel = Math.max(0, Math.min(NPADS - 1, d.pad | 0)); break;
      case 'panic':
        this.meterEnergy.fill(0); this.meterSamples = 0; this.meterReduction = 0;
        this.echoEnergy.fill(0); this.echoSamples = 0;
        this.reverbEnergy.fill(0); this.reverbSamples = 0;
        for (const v of this.voices) v.kill();
        for (const v of this.tails) v.kill();
        for (const v of this.fades) v.kill();
        if (!d.preserveTransport) {
          this.clip = null; this.clipPend = null; this.clipStopAt = -1; this.clipStep = -1;
        }
        break;
      case 'host': this.hosted = !!d.on; break;
      case 'tempo':
        const anchorMatches = Number.isFinite(d.anchor) && d.anchor === this.hostAnchor;
        const legacyNext = anchorMatches && this.clip && !rhythmHasEnabledLane(this.clip.rhythm)
          ? this.polyFirstOrdinal(currentFrame, this.hostAnchor, this.hostBpm, null, this.hostSwing)
          : 0;
        if (Number.isFinite(d.bpm)) {
          const oldBpm = this.hostBpm;
          if (anchorMatches && oldBpm > 0 && d.bpm > 0 && oldBpm !== d.bpm) {
            const beat = (currentFrame - this.hostAnchor) / ((60 / oldBpm) * sampleRate);
            this.hostAnchor = currentFrame - beat * (60 / d.bpm) * sampleRate;
          }
          this.hostBpm = d.bpm;
        }
        if (Number.isFinite(d.swing)) this.hostSwing = d.swing;
        if (Number.isFinite(d.anchor) && !anchorMatches)
          this.hostAnchor = d.anchor;
        if (this.clip && !rhythmHasEnabledLane(this.clip.rhythm))
          this.syncLegacyClip(currentFrame, legacyNext);
        break;
      case 'clip':
        this.clipPend = { data: new Uint8Array(d.data), bars: Math.max(1, d.bars | 0), rhythm: normalizeRhythm(d.rhythm ?? d.drumRhythm), at: +d.atFrame || 0 };
        this.clipStopAt = -1;
        break;
      case 'seqauto': this.seqAuto = this.autoRead(d.lanes); break;
      case 'auto': {
        // Follows its clip/clipupdate message: attach to the pending launch,
        // else to the playing clip.
        const lanes = this.autoRead(d.lanes);
        if (this.clipPend) this.clipPend.auto = lanes;
        else if (this.clip) this.clip.auto = lanes;
        break;
      }
      case 'clipstop':
        this.clipPend = null;
        this.clipStopAt = +d.atFrame || 0;
        break;
      case 'clipupdate': {
        // Hosted hot-swap (SQ-4): replace pattern bytes in place. Position is
        // derived arithmetic, so a live swap never moves the playhead.
        const data = new Uint8Array(d.data);
        const bars = Math.max(1, d.bars | 0);
        const hasRhythm = Object.prototype.hasOwnProperty.call(d, 'rhythm') || Object.prototype.hasOwnProperty.call(d, 'drumRhythm');
        const rhythm = hasRhythm ? normalizeRhythm(d.rhythm ?? d.drumRhythm) : undefined;
        if (this.clipPend) {
          this.clipPend = { data, bars, rhythm: rhythm === undefined ? this.clipPend.rhythm : rhythm, at: this.clipPend.at, auto: this.clipPend.auto };
        } else if (this.clip) {
          const resized = bars !== this.clip.bars;
          const previousRhythm = this.clip.rhythm;
          if (rhythm !== undefined && !rhythmHasMicro(rhythm)) this.microState[1].ready = false;
          const rhythmChanged = rhythm !== undefined && !rhythmEqual(this.clip.rhythm, rhythm);
          this.clip = { data, bars, at: this.clip.at, rhythm: rhythm === undefined ? this.clip.rhythm : rhythm, auto: this.clip.auto };
          // Re-derive the phase only on a bar-count change (plain modulo can
          // land a grown clip half a cycle off). Same-length edits — every
          // sequencer click — are a pure data swap: touching the phase inside
          // a swing/quantization window would skip a step and desync devices.
          if (rhythmChanged && rhythmHasEnabledLane(this.clip.rhythm)) {
            if (!rhythmHasEnabledLane(previousRhythm)) this.resetHostedPoly(currentFrame, true);
            else for (let i = 0; i < NPADS; i++) {
              const before = previousRhythm.lanes[i], after = this.clip.rhythm.lanes[i];
              if (after && after.timing.mode === 'fit' && (!before || before.timing.mode !== 'fit'
                  || before.steps !== after.steps || before.timing.cycleBeats !== after.timing.cycleBeats))
                this.hostPolyFitOrdinal[i] = this.polyFirstOrdinal(currentFrame, this.hostAnchor, this.hostBpm, after, 0);
            }
          }
          else if (rhythmChanged) this.syncLegacyClip(currentFrame);
          else if (resized && this.clipStep >= 0) this.clipStep = this.clipPhase(Math.floor, currentFrame);
        }
        break;
      }
    }
  }

  setRhythm(value) {
    const next = normalizeRhythm(value);
    const previous = this.rhythm;
    const changed = !rhythmEqual(previous, next);
    this.rhythm = next;
    if (!rhythmHasMicro(next)) this.microState[0].ready = false;
    if (!changed || !this.playing) return;
    const oldActive = rhythmHasEnabledLane(previous);
    const nextActive = rhythmHasEnabledLane(next);
    const bpm = this.pv[G_BPM] || 126;
    const swing = this.pv[G_SWING] || 0;
    if (oldActive && !nextActive) {
      this.syncLegacyStandalone(currentFrame, bpm, swing);
      return;
    }
    if (!oldActive && nextActive) {
      this.polyOrdinal = Math.max(this.polyOrdinal, this.polyFirstOrdinal(currentFrame, this.polyAnchor, bpm, null, swing));
      for (let i = 0; i < NPADS; i++) {
        const lane = next.lanes[i];
        this.polyFitOrdinal[i] = lane && lane.timing.mode === 'fit'
          ? this.polyFirstOrdinal(currentFrame, this.polyAnchor, bpm, lane, 0) : 0;
      }
      this.syncLegacyStandalone(currentFrame, bpm, swing);
      return;
    }
    const oldGridNeeded = previous.lanes.some(lane => !lane || lane.timing.mode !== 'fit');
    const nextGridNeeded = next.lanes.some(lane => !lane || lane.timing.mode !== 'fit');
    if (!oldGridNeeded && nextGridNeeded)
      this.polyOrdinal = Math.max(this.polyOrdinal, this.polyFirstOrdinal(currentFrame, this.polyAnchor, bpm, null, swing));
    for (let i = 0; i < NPADS; i++) {
      const before = previous && previous.lanes[i];
      const after = next && next.lanes[i];
      const timingChanged = !before || !after || before.timing.mode !== after.timing.mode
        || (after.timing.mode === 'fit' && before.timing.cycleBeats !== after.timing.cycleBeats)
        || before.steps !== after.steps;
      if (after && after.timing.mode === 'fit' && timingChanged)
        this.polyFitOrdinal[i] = this.polyFirstOrdinal(currentFrame, this.polyAnchor, bpm, after, 0);
    }
  }

  retimeStandalone(oldBpm, oldSwing, newBpm, newSwing, frame) {
    if (!this.playing) return;
    const legacyNext = !rhythmHasEnabledLane(this.rhythm)
      ? this.polyFirstOrdinal(frame, this.polyAnchor, oldBpm, null, oldSwing)
      : 0;
    const oldQuarter = (60 / Math.max(1, oldBpm)) * sampleRate;
    const beat = (frame - this.polyAnchor) / oldQuarter;
    this.polyAnchor = frame - beat * (60 / Math.max(1, newBpm)) * sampleRate;
    this.port.postMessage({ t: 'anchor', frame: this.polyAnchor });
    if (!rhythmHasEnabledLane(this.rhythm))
      this.syncLegacyStandalone(frame, newBpm, newSwing, legacyNext);
  }

  syncLegacyStandalone(frame, bpm, swing, minimumOrdinal = 0) {
    const next = Math.max(minimumOrdinal, this.polyOrdinal,
      this.polyFirstOrdinal(frame, this.polyAnchor, bpm, null, swing));
    this.polyOrdinal = next;
    this.step = positiveModulo(next - 1, STEPS);
    this.chainPos = positiveModulo(Math.floor((next - 1) / STEPS), this.chain.length);
    this.samplesToNext = Math.max(0, this.polyEventFrame(this.polyAnchor, next, bpm, null, swing) - frame);
  }

  polyBeat(frame, ordinal, bpm, lane, swing) {
    const beat = (60 / Math.max(1, bpm)) * sampleRate;
    if (lane && lane.timing.mode === 'fit') {
      const cycle = lane.timing.cycleBeats * beat;
      return Math.floor(ordinal / lane.steps) * cycle + (ordinal % lane.steps) * cycle / lane.steps;
    }
    const delay = ordinal % 2 ? Math.max(0, swing || 0) * SWING_MAX * beat / 4 : 0;
    return ordinal * beat / 4 + delay;
  }

  polyEventFrame(anchor, ordinal, bpm, lane, swing) {
    return anchor + this.polyBeat(0, ordinal, bpm, lane, swing);
  }

  polyFirstOrdinal(frame, anchor, bpm, lane, swing) {
    const slot = (60 / Math.max(1, bpm)) * sampleRate
      * (lane && lane.timing.mode === 'fit' ? lane.timing.cycleBeats / lane.steps : 0.25);
    const delta = Math.max(0, frame - anchor);
    let ordinal = Math.max(0, Math.floor(delta / Math.max(1, slot)) - 1);
    while (this.polyEventFrame(anchor, ordinal, bpm, lane, swing) < frame - 1e-7) ordinal++;
    while (ordinal > 0 && this.polyEventFrame(anchor, ordinal - 1, bpm, lane, swing) >= frame - 1e-7) ordinal--;
    return ordinal;
  }

  resetPoly(frame) {
    this.microState[0].ready = false;
    this.lanePositions.fill(-1);
    this.polyAnchor = frame;
    this.polyOrdinal = 0;
    this.polyFitOrdinal.fill(0);
  }

  resetHostedPoly(frame, preserveGrid = false) {
    this.microState[1].ready = false;
    this.lanePositions.fill(-1);
    if (!this.clip) return;
    this.hostPolyOrdinal = Math.max(preserveGrid ? this.hostPolyOrdinal : 0, this.polyFirstOrdinal(frame, this.hostAnchor, this.hostBpm, null, this.hostSwing));
    for (let i = 0; i < NPADS; i++) {
      const lane = this.clip.rhythm && this.clip.rhythm.lanes[i];
      this.hostPolyFitOrdinal[i] = lane && lane.timing.mode === 'fit'
        ? this.polyFirstOrdinal(frame, this.hostAnchor, this.hostBpm, lane, 0) : 0;
    }
  }

  polyValue(padI, ordinal, lane, hosted = false) {
    const data = hosted ? this.clip.data : this.pats;
    const bars = hosted ? this.clip.bars : NPATTERNS;
    if (lane) {
      const bar = Math.min(bars - 1, Math.max(0, lane.sourceBar | 0));
      const step = positiveModulo(ordinal - lane.rotation, lane.steps);
      this.lanePositions[padI] = bar * STEPS + step;
      return hosted ? data[(bar * NPADS + padI) * STEPS + step] : data[bar * NPADS * STEPS + padI * STEPS + step];
    }
    if (!hosted) {
      const step = positiveModulo(ordinal, STEPS);
      const pat = this.chain[positiveModulo(Math.floor(ordinal / STEPS), this.chain.length)] | 0;
      return data[pat * NPADS * STEPS + padI * STEPS + step];
    }
    const abs = positiveModulo(ordinal, bars * STEPS);
    const bar = (abs / STEPS) | 0, step = abs % STEPS;
    return data[(bar * NPADS + padI) * STEPS + step];
  }

  firePoly(frame, hosted = false, gridEvent = false, fitDue = this.polyDue) {
    const rhythm = hosted ? this.clip?.rhythm : this.rhythm;
    if (!rhythm) return;
    const gridOrdinal = hosted ? this.hostPolyOrdinal : this.polyOrdinal;
    if (gridEvent) {
      if (hosted) this.hostPolyOrdinal++; else this.polyOrdinal++;
    }
    const hits = [];
    let fitIndex = 0;
    for (let i = 0; i < NPADS; i++) {
      const lane = rhythm && rhythm.lanes[i];
      const fitIsDue = fitIndex < this.polyDueCount && fitDue[fitIndex] === i;
      if (gridEvent && (!lane || lane.timing.mode !== 'fit')) {
        const val = this.polyValue(i, gridOrdinal, lane, hosted);
        if (val) { this.trigger(i, val === 2 ? ACCENT_VEL : PLAIN_VEL); hits.push(i); }
      } else if (fitIsDue && lane && lane.timing.mode === 'fit') {
        const ordinal = hosted ? this.hostPolyFitOrdinal[i]++ : this.polyFitOrdinal[i]++;
        const val = this.polyValue(i, ordinal, lane, hosted);
        if (val) this.trigger(i, val === 2 ? ACCENT_VEL : PLAIN_VEL);
        this.port.postMessage({ t: 'poly', pad: i, ordinal, hit: !!val, frame });
      }
      if (fitIsDue) fitIndex++;
    }
    if (gridEvent && !hosted) {
      const s = positiveModulo(gridOrdinal, STEPS);
      const pat = this.chain[positiveModulo(Math.floor(gridOrdinal / STEPS), this.chain.length)] | 0;
      this.port.postMessage({ t: 'step', s, pat, hits, frame });
    } else if (gridEvent && hosted) {
      const abs = positiveModulo(gridOrdinal, this.clip.bars * STEPS);
      this.clipStep = abs;
      this.port.postMessage({ t: 'pos', step: abs % STEPS, bar: (abs / STEPS) | 0, hits, frame });
    }
  }

  // ---------- automation (SQ-4 clips and the standalone sequence) ----------
  // Each lane is an absolute-value table {i, table, len, fit, rot} played on
  // the transport anchor clock: grid lanes cycle every `len` sixteenths, FIT
  // lanes spread `len` slots over `fit` beats. autoHeld keeps the stored knob
  // value of every automated param; it returns when the lane leaves the clip.
  autoRead(list) {
    const lanes = [];
    for (const l of Array.isArray(list) ? list : []) {
      const i = PARAM_INDEX.get(l.k);
      const len = Math.max(1, l.len | 0);
      const table = new Float32Array(l.table);
      if (i === undefined || table.length !== len * 16) continue;
      lanes.push({ i, table, len, fit: Math.max(0, +l.fit || 0), rot: +l.rot || 0, fx: /(^|\.)fx\./.test(l.k) || l.k === 'master.volume' });
    }
    return lanes;
  }

  autoTick(frame) {
    const lanes = this.hosted ? (this.clip ? this.clip.auto || null : null)
      : (this.playing ? this.seqAuto : null);
    if (lanes !== this.autoLanes) {
      this.autoLanes = lanes;
      for (const [i, v] of this.autoHeld) {
        if (lanes && lanes.some((l) => l.i === i)) continue;
        this.autoHeld.delete(i);
        this.pv[i] = v;
        this.fxDirty = true;
      }
    }
    if (!lanes || !lanes.length) return;
    const bpm = Math.max(60, Math.min(200, this.hosted ? this.hostBpm || 120 : this.pv[G_BPM] || 126));
    const anchor = this.hosted ? this.hostAnchor : this.polyAnchor;
    const steps = Math.max(0, frame - anchor) / ((60 / bpm / 4) * sampleRate);
    for (let n = 0; n < lanes.length; n++) {
      const l = lanes[n];
      let x = ((l.fit ? ((steps / 4) % l.fit) / l.fit * l.len : steps) - l.rot) % l.len;
      if (x < 0) x += l.len;
      // A tiny negative remainder can round up to len when adding len.
      if (x >= l.len) x = 0;
      const f = x * 16, a = f | 0, b = a + 1 < l.table.length ? a + 1 : 0;
      if (!this.autoHeld.has(l.i)) this.autoHeld.set(l.i, this.pv[l.i]);
      this.pv[l.i] = l.table[a] + (l.table[b] - l.table[a]) * (f - a);
      if (l.fx) this.fxDirty = true;
    }
  }

  // ---------- hosted clip transport ----------
  hostTick(n) {
    const end = currentFrame + n;
    if (this.clipStopAt >= 0 && this.clipStopAt < end) {
      this.clipStopAt = -1;
      if (this.clip) {
        this.clip = null;
        this.clipStep = -1;
        // sounding pads ring out (design: DR-1 stop lets voices decay)
      }
      // ack even when nothing was playing — the stop may have targeted a
      // pending-only launch and the conductor clears its STOP marker on this
      this.port.postMessage({ t: 'clipstop', frame: currentFrame });
    }
    if (this.clipPend && this.clipPend.at < end) {
      this.clip = this.clipPend;
      this.clipPend = null;
      // Phase-lock to the shared timebase: enter at the global song position
      // modulo the clip length, so a (re)launch can never desync devices —
      // position is derived from the anchor, never restarted at step 0.
      this.clipStep = this.clipPhase(Math.round) - 1;
      this.clipToNext = 0;
      this.port.postMessage({ t: 'clipstart', frame: currentFrame });
    }
    if (this.clip) {
      if (this.clipToNext <= 0) this.clipFire(currentFrame);
      this.clipToNext -= n;
    }
  }

  // Global step index (mod clip length) at the current frame. Activation
  // rounds (atFrame sits at a boundary, block-quantized slightly early);
  // mid-flight resizes floor (the last fired step).
  clipPhase(quantize, frame = currentFrame) {
    const bpm = Math.max(60, Math.min(200, this.hostBpm || 120));
    const dur = (60 / bpm / 4) * sampleRate;
    const total = this.clip.bars * STEPS;
    const idx = quantize(Math.max(0, frame - this.hostAnchor) / dur);
    return ((idx % total) + total) % total;
  }

  syncLegacyClip(frame, minimumOrdinal = 0) {
    if (!this.clip) return;
    const bpm = Math.max(60, Math.min(200, this.hostBpm || 120));
    const dur = (60 / bpm / 4) * sampleRate;
    const swing = Math.min(1, Math.max(0, this.hostSwing || 0));
    const total = this.clip.bars * STEPS;
    const elapsed = Math.max(0, frame - this.hostAnchor);
    let ordinal = Math.max(0, Math.floor(elapsed / dur) - 1);
    const at = k => this.hostAnchor + k * dur + (k % 2 ? swing * SWING_MAX * dur : 0);
    while (at(ordinal) < frame - 1e-7) ordinal++;
    while (ordinal > 0 && at(ordinal - 1) >= frame - 1e-7) ordinal--;
    ordinal = Math.max(ordinal, minimumOrdinal, this.hostPolyOrdinal);
    this.hostPolyOrdinal = ordinal;
    this.clipStep = positiveModulo(ordinal - 1, total);
    this.clipToNext = Math.max(0, at(ordinal) - frame);
  }

  clipFire(frame = currentFrame) {
    const bpm = Math.max(60, Math.min(200, this.hostBpm || 120));
    const dur = (60 / bpm / 4) * sampleRate;
    const swing = Math.min(1, Math.max(0, this.hostSwing || 0));
    const total = this.clip.bars * STEPS;
    const abs = (this.clipStep + 1) % total;
    const s = abs % STEPS;
    const bar = (abs / STEPS) | 0;
    const hits = [];
    for (let i = 0; i < NPADS; i++) {
      const val = this.clip.data[(bar * NPADS + i) * STEPS + s];
      if (val) {
        this.trigger(i, val === 2 ? ACCENT_VEL : PLAIN_VEL);
        hits.push(i);
      }
    }
    this.clipStep = abs;
    const offNow = s % 2 === 1 ? swing * SWING_MAX * dur : 0;
    const sNext = (s + 1) % STEPS;
    const offNext = sNext % 2 === 1 ? swing * SWING_MAX * dur : 0;
    // Schedule the next step at its absolute anchor-grid time. A free-running
    // countdown (dur - offNow + offNext) drops the block-quantization residue
    // each fire and drifts late without bound against the shared timebase.
    const idx = Math.round((frame - this.hostAnchor - offNow) / dur);
    this.hostPolyOrdinal = idx + 1;
    this.clipToNext = this.hostAnchor + (idx + 1) * dur + offNext - frame;
    this.port.postMessage({ t: 'pos', step: s, bar, hits });
  }

  trigger(padI, vel) {
    if (padI < 0 || padI >= NPADS) return;
    const pv = this.pv;
    const g = pv[this.padIds[padI][P_CHOKE]] | 0;
    if (g > 0) {
      for (let j = 0; j < NPADS; j++) {
        if (j !== padI && (pv[this.padIds[j][P_CHOKE]] | 0) === g) {
          this.voices[j].choke();
          this.tails[j].choke();
          this.fades[j].choke();
        }
      }
    }
    // Retrigger: park the sounding hit on the tail slot with a choke fade and
    // start the new one on the freed slot. Two hits inside one fade (~3 ms)
    // collide: the tail slot is still busy. Keep whichever tail is louder (a
    // quiet tail replacing a loud one would cut it, which clicks) and park the
    // quieter sounding hit on the second fade slot instead of restarting it in
    // place. Only a third hit inside one fade still cuts its quietest voice.
    // Same policy as DrumEngine::trigger.
    const cur = this.voices[padI];
    if (cur.active && cur.ampLevel > 1e-4) {
      const tail = this.tails[padI];
      if (!tail.active || tail.ampLevel <= cur.ampLevel) {
        tail.kill();
        this.tails[padI] = cur;
        cur.choke();
        this.voices[padI] = tail;
      } else {
        const fade = this.fades[padI];
        if (!fade.active || fade.ampLevel <= cur.ampLevel) {
          fade.kill();
          this.fades[padI] = cur;
          cur.choke();
          this.voices[padI] = fade;
        }
      }
    }
    const v = this.voices[padI];
    v.trigger(Math.max(0, Math.min(1, Number.isFinite(vel) ? vel : 1)), this.rng.uni());
    const f = this.padIds[padI];
    const phaseA = (Math.max(0, Math.min(1, pv[f[OSC_A + A_PHASE]])) * 2048) % 2048;
    for (let i = 0; i < MAXUNI; i++) v.oA.phases[i] = phaseA;
  }

  // Modulation matrix evaluated at voice time `t`, written into `out` (no
  // allocation — the render path calls this twice per block to get a ramp).
  padMod(f, v, t, out) {
    const pv = this.pv;
    const dec = Math.max(0.002, pv[f[P_MODENV_DEC]] / 4.5);
    const env = Math.exp(-t / (dec * sampleRate));
    const velSrc = v.vel * pv[f[P_V2M]];
    for (let i = 0; i < NMOD; i++) out[i] = 0;
    for (let n = 0; n < 4; n++) {
      const b = P_MOD1 + n * 3;
      const src = pv[f[b]] | 0;
      const dst = pv[f[b + 1]] | 0;
      if (!src || !dst || dst > NMOD) continue;
      const s = src === 1 ? env : src === 2 ? velSrc : src === 3 ? v.rand : 0;
      out[dst - 1] += s * (pv[f[b + 2]] || 0) * M_SCALE[dst - 1];
    }
  }

  // Modulation value at block fraction `u`, between the two evaluations the
  // render path made at the block's edges.
  mlerp(i, u) {
    const a = this.m0[i];
    return a + (this.m1[i] - a) * u;
  }

  // `pitch0/pitch1` are absolute MIDI note numbers at the first and last
  // sample of the sub-block; everything derived from them ramps per sample.
  setupOsc(o, f, base, pitch0, pitch1, pos0, pos1, count) {
    const pv = this.pv;
    const table = this.tables[pv[f[base + A_TABLE]] | 0];
    if (!table) return false;

    const freq0 = 440 * Math.pow(2, (pitch0 - 69) / 12);
    const freq1 = 440 * Math.pow(2, (pitch1 - 69) / 12);
    const nyq = sampleRate * 0.45;
    if (!(freq0 > 0 && freq0 <= nyq)) return false;
    const fEnd = Math.min(nyq, Math.max(1e-4, freq1));

    let level = Math.min(1.2, Math.max(0, pv[f[base + A_LEVEL]]));
    level *= level;
    if (!(level >= 1e-5)) return false;

    const uni = Math.max(1, Math.min(MAXUNI, pv[f[base + A_UNISON]] | 0));
    const det = pv[f[base + A_DETUNE]];
    const spr = 0.6;

    const posT = Math.min(1, Math.max(0, pos1));
    const prev = o.posSm;
    if (prev < 0) o.posSm = Math.min(1, Math.max(0, pos0));
    else o.posSm += (posT - o.posSm) * smoothCoef(count, POS_TAU * sampleRate);
    const posPrev = prev < 0 ? o.posSm : prev;

    const spanF = table.frames - 1;
    const posF0 = posPrev * spanF;
    const posF1 = o.posSm * spanF;
    const f0 = posF1 | 0;
    const f1 = Math.min(spanF, f0 + 1);
    // Ramp the morph fraction across the sub-block, but snap when the frame
    // pair changes — the two reads then address different frames (JUCE does
    // the same, DrumEngine.cpp:334).
    o.ftEnd = posF1 - f0;
    o.ft = (posF0 | 0) === f0 ? posF0 - f0 : o.ftEnd;

    const cps0 = freq0 / sampleRate;
    const cps1 = fEnd / sampleRate;
    const maxRatio = Math.pow(2, (Math.abs(det) * 50) / 1200);
    const prevValid = o.havePrev && o.pUni === uni && o.pData === table.data;
    let maxInc0 = 0, maxInc1 = 0;
    o.data = table.data;
    o.mask = table.mask;
    o.size = table.size;
    o.mips = table.mips;
    o.uni = uni;

    for (let u = 0; u < uni; u++) {
      const sprd = uni > 1 ? (u / (uni - 1)) * 2 - 1 : 0;
      const cents = sprd * det * 50;
      const ratio = Math.pow(2, cents / 1200);
      o.incs[u] = cps0 * ratio * table.size;
      o.incsEnd[u] = cps1 * ratio * table.size;
      maxInc0 = Math.max(maxInc0, prevValid ? o.pIncs[u] : o.incs[u]);
      maxInc1 = Math.max(maxInc1, o.incsEnd[u]);
      const pan = Math.max(-1, Math.min(1, sprd * spr));
      const a = ((pan + 1) * Math.PI) / 4;
      o.gl[u] = Math.cos(a);
      o.gr[u] = Math.sin(a);
    }
    o.frame0 = f0 * table.mips * table.size;
    o.frame1 = f1 * table.mips * table.size;
    o.maxInc0 = maxInc0;
    o.maxInc1 = maxInc1;
    o.rampPrev = prevValid;
    o.gain = (level * 0.32) / Math.sqrt(uni);
    return true;
  }

  renderOsc(o, tmpL, tmpR, off, n) {
    const data = o.data, mask = o.mask, size = o.size, g = o.gain;
    const invN = n > 0 ? 1 / n : 0;
    const ft0 = o.ft, dFt = (o.ftEnd - ft0) * invN;
    const maxInc0 = o.maxInc0, maxInc1 = o.maxInc1;
    const frame0 = o.frame0, frame1 = o.frame1;
    for (let u = 0; u < o.uni; u++) {
      let ph = o.phases[u];
      const inc0 = o.rampPrev ? o.pIncs[u] : o.incs[u];
      const dInc = (o.incsEnd[u] - inc0) * invN;
      const gl = o.gl[u] * g, gr = o.gr[u] * g;
      for (let i = 0; i < n; i++) {
        const idx = ph | 0;
        const frac = ph - idx;
        const ft = ft0 + dFt * i;
        const maxInc = maxInc0 + (maxInc1 - maxInc0) * (i * invN);
        const mipF = Math.log2(maxInc * 0.5 / 0.475);
        const mip = mipF > 0 ? Math.min(o.mips - 1, Math.ceil(mipF)) : 0;
        const fineMip = Math.max(0, mip - 1);
        const blend = mip > 0 ? Math.max(0, Math.min(1, 1 - (mipF - (mip - 1)) / 0.07)) : 0;
        const off0 = frame0 + mip * size, off1 = frame1 + mip * size;
        const off0b = frame0 + fineMip * size, off1b = frame1 + fineMip * size;
        const s0 = hermiteTable(data, off0, idx, mask, frac);
        const s1 = hermiteTable(data, off1, idx, mask, frac);
        let s = s0 + ft * (s1 - s0);
        if (blend > 0) {
          const t0 = hermiteTable(data, off0b, idx, mask, frac);
          const t1 = hermiteTable(data, off1b, idx, mask, frac);
          s += blend * (t0 + ft * (t1 - t0) - s);
        }
        tmpL[off + i] += s * gl;
        tmpR[off + i] += s * gr;
        ph += inc0 + dInc * i;
        if (ph >= size) ph -= size;
        else if (ph < 0) ph += size;
      }
      o.phases[u] = ph;
      o.pIncs[u] = o.incsEnd[u];
    }
    o.pUni = o.uni;
    o.pData = o.data;
    o.havePrev = true;
  }

  // One-shot sample layer. This deliberately mirrors DrumEngine.cpp's
  // playback contract: Hermite reads, a band-limited sinc read above rate 1
  // (blended in over the first 5%), a per-sample rate ramp, and edge fades
  // measured in output time. A sample's natural attack is not faded in.
  renderSample(st, f, base, pitch0, pitch1, start0, tmpL, tmpR, off, n) {
    if (st.done) return false;
    const pv = this.pv;
    const index = Math.max(0, Math.min(this.samples.length - 1, pv[f[base + A_TABLE]] | 0));
    const sample = this.samples[index];
    if (!sample || sample.data.length < 2) return false;

    const level = Math.max(0, Math.min(1.2, pv[f[base + A_LEVEL]]));
    const gain = level * level * 0.75;
    if (gain <= 1e-6) return false; // early-out: no loop at level 0 (D7)

    const data = sample.data;
    const last = data.length - 1;
    const start = Math.max(0, Math.min(0.999, start0));
    const end = Math.max(start + 1 / data.length, Math.min(1, pv[f[base + A_DETUNE]]));
    const reverse = pv[f[base + A_PHASE]] >= 0.5;
    const lo = start * last;
    const hi = end * last;
    if (st.pos < 0 || st.index !== index) {
      st.index = index;
      st.pos = reverse ? hi : lo;
      st.havePrev = false;
    }

    const dir = reverse ? -1 : 1;
    const rate = sample.sampleRate / sampleRate;
    const step1 = rate * Math.pow(2, pitch1 / 12) * dir;
    const step0 = st.havePrev ? st.pStep : step1;
    const dStep = n > 0 ? (step1 - step0) / n : 0;
    const fadeInEdge = reverse ? hi < last - 1e-9 : lo > 1e-9;
    const half = Math.max((hi - lo) * .5, 1);
    const read = (position) => {
      const i0 = Math.floor(position), frac = position - i0;
      const at = (i) => data[i < 0 ? 0 : i > last ? last : i];
      return hermite4(at(i0 - 1), at(i0), at(i0 + 1), at(i0 + 2), frac);
    };

    let pos = st.pos;
    for (let i = 0; i < n; i++) {
      if ((!reverse && pos >= hi) || (reverse && pos <= lo)) {
        st.done = true;
        break;
      }
      const step = step0 + dStep * i;
      const speed = Math.abs(step);
      let value;
      if (speed > 1) {
        // Band-limited read, blended in over the first 5% above 1 source
        // sample per output sample so a pitch envelope crossing it does not
        // switch readers.
        const sc = Math.min(speed, SINC_MAX_AST);
        const inv = SINC_RES / sc;
        const reach = SINC_HALF * sc;
        const k0 = Math.ceil(pos - reach), k1 = Math.floor(pos + reach);
        let acc = 0, wsum = 0;
        for (let k = k0; k <= k1; k++) {
          const u = Math.abs(k - pos) * inv;
          const ti = u | 0;
          const w = SINC_TABLE[ti] + (u - ti) * (SINC_TABLE[ti + 1] - SINC_TABLE[ti]);
          acc += w * data[k < 0 ? 0 : k > last ? last : k];
          wsum += w;
        }
        const kern = acc / wsum;
        const mix = Math.min((speed - 1) / (SINC_BLEND - 1), 1);
        if (mix >= 1) value = kern;
        else { const h = read(pos); value = h + (kern - h) * mix; }
      } else {
        value = read(pos);
      }

      const fadeSource = Math.min(Math.max(speed, 1) * EDGE_FADE * sampleRate, half);
      const distanceIn = reverse ? hi - pos : pos - lo;
      const distanceOut = reverse ? pos - lo : hi - pos;
      let eg = Math.max(0, Math.min(1, distanceOut / fadeSource));
      if (fadeInEdge) eg = Math.min(eg, Math.max(0, Math.min(1, distanceIn / fadeSource)));
      const s = value * gain * eg;
      tmpL[off + i] += s;
      tmpR[off + i] += s;
      pos += step;
    }
    st.pos = pos;
    st.pStep = step1; st.havePrev = true;
    return true;
  }

  setupFilter(fs, f, mCut, mRes, count) {
    const pv = this.pv;
    const ftype = pv[f[P_FLT_TYPE]] | 0;
    if (ftype !== fs.ftype && fs.cutSm > 0) {
      // Hand the outgoing type its own copy of the state and fade it out over
      // TYPE_XFADE; the switch used to step the output in one sample.
      fs.svfOld.set(fs.svf);
      fs.ftypeOld = fs.ftype;
      fs.twoPoleOld = fs.twoPole;
      fs.xfLen = Math.max(1, TYPE_XFADE * sampleRate);
      fs.xfLeft = fs.xfLen;
    }
    fs.ftype = ftype;
    let fc = pv[f[P_FLT_CUT]] * Math.pow(2, mCut * MOD_LOG_D);
    if (!Number.isFinite(fc)) fc = 20;
    fc = Math.min(sampleRate * 0.45, Math.max(20, fc));
    if (fs.cutSm <= 0) fs.cutSm = fc;
    fs.cutSm += (fc - fs.cutSm) * smoothCoef(count, CUT_TAU * sampleRate);
    const cut = fs.cutSm;
    const res = Math.min(0.999, Math.max(0, pv[f[P_FLT_RES]] + mRes));

    fs.twoPole = ftype === 1;
    const g = Math.tan((Math.PI * cut) / sampleRate);
    const k = 2 - 1.93 * res;
    fs.k1 = k;
    fs.a1 = 1 / (1 + g * (g + k));
    fs.a2 = g * fs.a1;
    fs.a3 = g * fs.a2;
  }

  runFilter(fs, inL, inR, outL, outR, drive, off, n) {
    // Drive: 2x oversampled ADAA tanh. The stage is in the path only while the
    // saturator is active; at drive 0 it is a bit-exact copy.
    const adaaTarget = Math.max(0, Math.min(1, drive / ADAA_FADE_WIDTH));
    const adaaStart = fs.adaaMix;
    const active = adaaTarget > 0 || adaaStart > 1e-6;
    const dg = active ? 1 + drive * 7 : 1;
    const dcomp = active ? 1 / Math.pow(dg, 0.55) : 1;
    const kF = dcomp / dg;
    const osL = fs.osL, osR = fs.osR;
    if (active) { osL.F = kF * lcosh(dg * osL.xp); osR.F = kF * lcosh(dg * osR.xp); }
    const wStep = 1 / (DRIVE_OS_RAMP_SEC * sampleRate);
    for (let i = off; i < off + n; i++) {
      const m = adaaStart + (adaaTarget - adaaStart) * ((i - off + 1) / n);
      outL[i] = driveOsStep(osL, inL[i], active, active, m, wStep, dg, dcomp, kF);
      outR[i] = driveOsStep(osR, inR[i], active, active, m, wStep, dg, dcomp, kF);
    }
    fs.adaaMix = active ? adaaTarget : 0;

    // While a type switch is fading, the outgoing type runs on `svfOld` over a
    // copy of the same input and the two are mixed sample by sample.
    const fading = fs.xfLeft > 0;
    if (fading) {
      this.xL.set(outL.subarray(off, off + n), off);
      this.xR.set(outR.subarray(off, off + n), off);
    }

    this.svfStage(fs, fs.svf, fs.ftype, fs.twoPole, outL, outR, off, n);

    if (fading) {
      this.svfStage(fs, fs.svfOld, fs.ftypeOld, fs.twoPoleOld, this.xL, this.xR, off, n);
      const step = 1 / fs.xfLen;
      let g = fs.xfLeft * step; // weight of the outgoing type, 1 → 0
      for (let i = off; i < off + n; i++) {
        if (g <= 0) { g = 0; break; }
        outL[i] += g * (this.xL[i] - outL[i]);
        outR[i] += g * (this.xR[i] - outR[i]);
        g -= step;
      }
      fs.xfLeft = Math.max(0, fs.xfLeft - n);
    }
  }

  // One SVF pass (plus the second pole for LP24) over `bufL/bufR`, using the
  // state array `F` and the coefficients currently on `fs`.
  svfStage(fs, F, ftype, twoPole, bufL, bufR, off, n) {
    const a1 = fs.a1, a2 = fs.a2, a3 = fs.a3, k1 = fs.k1;
    for (let ch = 0; ch < 2; ch++) {
      const buf = ch === 0 ? bufL : bufR;
      const o1 = ch * 2;
      let ic1 = F[o1], ic2 = F[o1 + 1];
      for (let i = off; i < off + n; i++) {
        const x = buf[i];
        const v3 = x - ic2;
        const v1 = a1 * ic1 + a2 * v3;
        const v2 = ic2 + a2 * ic1 + a3 * v3;
        ic1 = 2 * v1 - ic1;
        ic2 = 2 * v2 - ic2;
        switch (ftype) {
          case 0: case 1: buf[i] = v2; break;
          case 2: buf[i] = k1 * v1; break;
          case 3: buf[i] = x - k1 * v1 - v2; break;
          default: buf[i] = x - k1 * v1; break;
        }
      }
      F[o1] = ic1; F[o1 + 1] = ic2;
    }
    if (twoPole) {
      for (let ch = 0; ch < 2; ch++) {
        const buf = ch === 0 ? bufL : bufR;
        const o1 = 4 + ch * 2;
        let ic1 = F[o1], ic2 = F[o1 + 1];
        for (let i = off; i < off + n; i++) {
          const x = buf[i];
          const v3 = x - ic2;
          const v1 = a1 * ic1 + a2 * v3;
          const v2 = ic2 + a2 * ic1 + a3 * v3;
          ic1 = 2 * v1 - ic1;
          ic2 = 2 * v2 - ic2;
          buf[i] = v2;
        }
        F[o1] = ic1; F[o1 + 1] = ic2;
      }
    }
  }

  renderPad(v, padI, L, R, off, n) {
    const pv = this.pv, f = this.padIds[padI];
    const m0 = this.m0, m1 = this.m1;
    this.padMod(f, v, v.t, m0);
    this.padMod(f, v, v.t + n, m1);
    const tmpL = this.tmpL, tmpR = this.tmpR;
    tmpL.fill(0, 0, n); tmpR.fill(0, 0, n);
    const invN = n > 0 ? 1 / n : 0;

    const pDec = Math.max(0.002, pv[f[P_PENV_DEC]]);
    const pAmt = pv[f[P_PENV_AMT]];
    const peK = -4.5 / (pDec * sampleRate);
    const tuneA = pv[f[OSC_A + A_TUNE]], fineA = pv[f[OSC_A + A_FINE]];
    const tuneB = pv[f[OSC_B + A_TUNE]], fineB = pv[f[OSC_B + A_FINE]];
    const posA = pv[f[OSC_A + A_POS]], posB = pv[f[OSC_B + A_POS]];
    for (let at = 0; at < n; at += 16) {
      const count = Math.min(16, n - at);
      const u0 = at * invN, u1 = (at + count) * invN;
      const pe0 = pAmt * Math.exp(peK * (v.t + at));
      const pe1 = pAmt * Math.exp(peK * (v.t + at + count));
      const pitch0 = this.mlerp(M_PITCH, u0), pitch1 = this.mlerp(M_PITCH, u1);
      const aP0 = BASE_NOTE + tuneA + (fineA + this.mlerp(M_FINEA, u0)) / 100 + pe0 + pitch0;
      const aP1 = BASE_NOTE + tuneA + (fineA + this.mlerp(M_FINEA, u1)) / 100 + pe1 + pitch1;
      const aOn = this.setupOsc(v.oA, f, OSC_A, aP0, aP1,
        posA + this.mlerp(M_POSA, u0), posA + this.mlerp(M_POSA, u1), count);
      if (aOn) this.renderOsc(v.oA, tmpL, tmpR, at, count);
      const bP0 = tuneB + (fineB + this.mlerp(M_FINEB, u0)) / 100 + pe0 + pitch0;
      const bP1 = tuneB + (fineB + this.mlerp(M_FINEB, u1)) / 100 + pe1 + pitch1;
      this.renderSample(v.sample, f, OSC_B, bP0, bP1, posB + this.mlerp(M_POSB, u0),
        tmpL, tmpR, at, count);
    }

    const noiseLevel = Math.min(1, Math.max(0, pv[f[P_NOISE_LEVEL]] + m0[M_NOISE]));
    const noiseGain = noiseLevel * noiseLevel * 0.35;
    if (noiseGain > 1e-6) {
      const color = Math.min(1, Math.max(-1, pv[f[P_NOISE_COLOR]]));
      const a = mapPole(0.02 + (color + 1) * 0.49, sampleRate);
      const rng = this.rng;
      let y = v.noiseY;
      for (let i = 0; i < n; i++) {
        y += (rng.uni() - y) * a;
        const s = y * noiseGain;
        tmpL[i] += s; tmpR[i] += s;
      }
      v.noiseY = y;
    }

    // Sine ring modulator. A fixed-Hz carrier deliberately breaks the
    // oscillator's harmonic series into inharmonic sidebands—the useful bit
    // for bells, struck metal and synthetic cymbals. MIX=0 is a true bypass.
    const ringMix = Math.min(1, Math.max(0, pv[f[P_RING_MIX]]));
    if (ringMix > 1e-6) {
      const ringFreq = Math.min(sampleRate * 0.45, Math.max(20, pv[f[P_RING_FREQ]]));
      const ringInc = ringFreq / sampleRate;
      let phase = v.ringPhase;
      for (let i = 0; i < n; i++) {
        const carrier = Math.sin(phase * Math.PI * 2) * Math.SQRT2;
        const gain = 1 + ringMix * (carrier - 1);
        tmpL[i] *= gain;
        tmpR[i] *= gain;
        phase += ringInc;
        if (phase >= 1) phase -= 1;
      }
      v.ringPhase = phase;
    }

    let srcL = tmpL, srcR = tmpR;
    if (pv[f[P_FLT_ON]]) {
      // 32-sample coefficient chunks on a smoothed cutoff, like JUCE: a
      // cutoff sweep no longer steps once per block.
      const drive = pv[f[P_FLT_DRIVE]];
      for (let at = 0; at < n; at += 32) {
        const count = Math.min(32, n - at);
        const u = (at + count) * invN;
        this.setupFilter(v.f, f, this.mlerp(M_CUT, u), this.mlerp(M_RES, u), count);
        this.runFilter(v.f, tmpL, tmpR, this.fL, this.fR, drive, at, count);
      }
      srcL = this.fL; srcR = this.fR;
    }

    const velGain = 1 - pv[f[P_V2L]] * (1 - v.vel);
    const lv0 = Math.min(1, Math.max(0, pv[f[P_LVL]] + m0[M_LEVEL]));
    const lv1 = Math.min(1, Math.max(0, pv[f[P_LVL]] + m1[M_LEVEL]));
    const lg0 = lv0 * lv0, dLg = (lv1 * lv1 - lg0) * invN;
    const pan = Math.min(1, Math.max(-1, pv[f[P_PAN]]));
    const panA = ((pan + 1) * Math.PI) / 4;
    const panL = Math.cos(panA), panR = Math.sin(panA);
    const dcR = this.dcR;
    const chokeC = smoothCoef(1, CHOKE_TAU * sampleRate);
    const chokeSlew = smoothCoef(1, CHOKE_SLEW * sampleRate);

    // Amp envelope constants hoisted out of the sample loop; the exponential
    // segment advances by a recursive multiply instead of a Math.exp per
    // sample (review D7).
    const att = Math.max(1, pv[f[P_AENV_ATT]] * sampleRate);
    const hold = pv[f[P_AENV_HOLD]] * sampleRate;
    const dec = Math.max(1, pv[f[P_AENV_DEC]] * sampleRate);
    const curve = pv[f[P_AENV_CURVE]];
    const decStart = att + hold;
    const decEnd = decStart + dec;
    const invDec = 1 / dec;
    const rExp = Math.exp(-4.5 * invDec);
    let ex = -1; // running e^(-4.5·td/dec), primed on entry to the decay

    for (let i = 0; i < n; i++) {
      const sl = srcL[i], sr = srcR[i];
      const yL = sl - v.dcxL + dcR * v.dcyL;
      const yR = sr - v.dcxR + dcR * v.dcyR;
      v.dcxL = sl; v.dcyL = yL;
      v.dcxR = sr; v.dcyR = yR;

      if (v.choking) {
        v.ampLevel *= 1 - chokeC;
        v.chokeSm += (v.ampLevel - v.chokeSm) * chokeSlew;
        if (v.chokeSm < 1e-4) {
          v.kill();
          break;
        }
      } else {
        const t = v.t + i;
        if (t < att) {
          v.ampLevel = t / att;
        } else if (t < decStart) {
          v.ampLevel = 1;
        } else if (t < decEnd) {
          const td = t - decStart;
          if (ex < 0) ex = Math.exp(-4.5 * td * invDec);
          else ex *= rExp;
          // Normalised so the decay reaches 0 instead of stepping down from
          // 0.011·curve at the boundary (review D3).
          const lin = 1 - td * invDec;
          v.ampLevel = lin + ((ex - E45) * INV_E45 - lin) * curve;
        } else {
          v.ampLevel = 0;
        }
      }
      const amp = (v.choking ? v.chokeSm : v.ampLevel) * velGain * (lg0 + dLg * i);
      L[off + i] += yL * amp * panL;
      R[off + i] += yR * amp * panR;
    }

    v.t += n;
    if (v.active && !v.choking && v.t >= decEnd && v.ampLevel < 1e-4) v.kill();
  }

  // Independent lane cursors look ahead so a negative offset crosses step/bar
  // boundaries. The consumed mask also permits adjacent hits to exchange order.
  scheduleMicro(frame, endFrame, hosted) {
    const rhythm = hosted ? this.clip.rhythm : this.rhythm;
    const state = this.microState[hosted ? 1 : 0];
    const bpm = hosted ? this.hostBpm : (this.pv[G_BPM] || 126);
    const swing = hosted ? this.hostSwing : (this.pv[G_SWING] || 0);
    const anchor = hosted ? this.hostAnchor : this.polyAnchor;
    const beatFrames = 60 / Math.max(1, bpm) * sampleRate;
    const start = hosted ? (this.clip.at ?? anchor) : anchor;
    const maxDelay = sampleRate * .1;
    let next = endFrame, selected = -1, selectedBit = 0, selectedOrdinal = 0;
    for (let pad = 0; pad < NPADS; pad++) {
      const data = rhythm.lanes[pad];
      const lane = data?.enabled ? data : null;
      const slot = beatFrames * (lane?.timing.mode === 'fit' ? lane.timing.cycleBeats / lane.steps : .25);
      const topology = lane ? `${lane.timing.mode}/${lane.steps}/${lane.timing.cycleBeats ?? 0}` : 'grid';
      const init = !state.ready || state.topology[pad] !== topology;
      if (init) {
        const minimum = lane?.timing.mode === 'fit'
          ? (hosted ? this.hostPolyFitOrdinal[pad] : this.polyFitOrdinal[pad])
          : (hosted ? this.hostPolyOrdinal : this.polyOrdinal);
        state.ordinal[pad] = Math.max(minimum, 0, Math.floor((frame - anchor - maxDelay) / slot) - 1);
        state.consumed[pad] = 0;
        state.topology[pad] = topology;
      }
      // At most 32 nearby events; ordinary musical tempos need only 2–4.
      for (let bit = 0; bit < 32; bit++) {
        const ordinal = state.ordinal[pad] + bit;
        const base = this.polyEventFrame(anchor, ordinal, bpm, lane, lane?.timing.mode === 'fit' ? 0 : swing);
        if (base - maxDelay >= next) break;
        if ((state.consumed[pad] >>> bit) & 1) continue;
        const bar = lane ? lane.sourceBar : hosted
          ? Math.floor(ordinal / 16) % this.clip.bars
          : this.chain[Math.floor(ordinal / 16) % this.chain.length];
        const step = lane ? positiveModulo(ordinal - lane.rotation, lane.steps) : ordinal % 16;
        const at = Math.max(start, base + ((data?.delayMs ?? 0) + (data?.stepDelayMs?.[bar * 16 + step] ?? 0)) * sampleRate / 1000);
        // Seek/enable skips past hits; a fresh launch clamps its first early hit.
        if (init && at < frame - 1e-7) { state.consumed[pad] |= 1 << bit; continue; }
        if (at < next - 1e-7) { next = at; selected = pad; selectedBit = bit; selectedOrdinal = ordinal; }
      }
      // Defer compaction until after dispatch because selectedBit uses this base.
    }
    state.ready = true;
    const gridOrdinal = hosted ? this.hostPolyOrdinal : this.polyOrdinal;
    const gridAt = this.polyEventFrame(anchor, gridOrdinal, bpm, null, swing);
    if (gridAt <= frame + 1e-7) {
      if (hosted) {
        this.hostPolyOrdinal++;
        const abs = gridOrdinal % (this.clip.bars * 16);
        this.clipStep = abs;
        this.port.postMessage({ t: 'pos', step: abs % 16, bar: Math.floor(abs / 16), hits: [], frame });
      } else {
        this.polyOrdinal++;
        this.port.postMessage({ t: 'step', s: gridOrdinal % 16, pat: this.chain[Math.floor(gridOrdinal / 16) % this.chain.length], hits: [], frame });
      }
    }
    if (selected >= 0 && next <= frame + 1e-7) {
      state.consumed[selected] |= 1 << selectedBit;
      const lane = rhythm.lanes[selected]?.enabled ? rhythm.lanes[selected] : null;
      const value = this.polyValue(selected, selectedOrdinal, lane, hosted);
      if (value) this.trigger(selected, value === 2 ? ACCENT_VEL : PLAIN_VEL);
      this.port.postMessage({ t: 'poly', pad: selected, ordinal: selectedOrdinal, hit: !!value, frame });
      if (lane?.timing.mode === 'fit') {
        (hosted ? this.hostPolyFitOrdinal : this.polyFitOrdinal)[selected] = selectedOrdinal + 1;
      }
    }
    for (let pad = 0; pad < NPADS; pad++) {
      while (state.consumed[pad] & 1) { state.consumed[pad] >>>= 1; state.ordinal[pad]++; }
    }
    if (gridAt <= frame + 1e-7 || next <= frame + 1e-7) return 0;
    return Math.max(1, Math.min(endFrame - frame, Math.ceil(Math.min(next, gridAt) - frame - 1e-9)));
  }

  schedulePoly(frame, endFrame, hosted) {
    const rhythm = hosted ? this.clip?.rhythm : this.rhythm;
    if (!rhythm) return endFrame - frame;
    if (rhythmHasMicro(rhythm)) return this.scheduleMicro(frame, endFrame, hosted);
    const bpm = hosted ? this.hostBpm : (this.pv[G_BPM] || 126);
    const swing = hosted ? this.hostSwing : (this.pv[G_SWING] || 0);
    const anchor = hosted ? this.hostAnchor : this.polyAnchor;
    const gridNeeded = true; // Overall bar progress remains independent of lane timing.
    const gridOrdinal = hosted ? this.hostPolyOrdinal : this.polyOrdinal;
    let gridAt = endFrame;
    if (gridNeeded) gridAt = this.polyEventFrame(anchor, gridOrdinal, bpm, null, swing);
    let fitAt = endFrame;
    for (let i = 0; i < NPADS; i++) {
      const lane = rhythm.lanes[i];
      this.polyFitAt[i] = endFrame;
      if (lane && lane.timing.mode === 'fit') {
        const ordinal = hosted ? this.hostPolyFitOrdinal[i] : this.polyFitOrdinal[i];
        const at = this.polyEventFrame(anchor, ordinal, bpm, lane, 0);
        this.polyFitAt[i] = at;
        fitAt = Math.min(fitAt, at);
      }
    }
    const next = Math.min(gridAt, fitAt, endFrame);
    const due = Math.ceil(next - frame - 1e-9);
    if (due > 0) return Math.min(endFrame - frame, due);

    const eps = 1e-7;
    const gridDue = gridAt <= frame + eps;
    this.polyDueCount = 0;
    for (let i = 0; i < NPADS; i++) {
      if (this.polyFitAt[i] <= frame + eps)
        this.polyDue[this.polyDueCount++] = i;
    }
    this.firePoly(frame, hosted, gridDue, this.polyDue);
    return 0;
  }

  capturePad(i, n) {
    const l = this.padL[i], r = this.padR[i], buf = this.capBuf[i];
    for (let k = 0; k < n; k++) {
      buf[this.capLen[i]++] = 0.5 * (l[k] + r[k]);
      if (this.capLen[i] === CAPTURE_LEN) {
        this.port.postMessage({ t: 'padAudio', pad: i, frames: this.capFrames + k, data: buf.slice() });
        this.capLen[i] = 0;
      }
    }
  }

  process(inputs, outputs) {
    // The SQ-4 key bus (five mono channels); empty when nothing is connected.
    this.keyIn = inputs[0]?.length ? inputs[0] : null;
    // One stereo worklet output per OUTPUT BUS. Each pad renders into its own
    // buffer, runs its own FX chain, then sums into the bus its `out` param
    // selects; the main thread only meters what comes back. Missing outputs are
    // tolerated by the lightweight test harness and older hosts.
    for (const out of outputs) {
      for (const channel of out) channel.fill(0);
    }
    const n = outputs[0]?.[0]?.length || 128;
    this.ensureCap(n);
    if (this.pauto) this.pauto.tick(currentFrame, this.pautoSet);

    const padL = this.padL, padR = this.padR;
    for (let i = 0; i < NPADS; i++) { padL[i].fill(0, 0, n); padR[i].fill(0, 0, n); }

    const standalone = this.playing && !this.hosted;
    const standalonePoly = standalone && rhythmHasEnabledLane(this.rhythm);

    // Events whose frame has already passed are dropped, not played late.
    const evq = this.evq;
    while (this.evHead < evq.length && evq[this.evHead][0] < currentFrame) this.evHead++;
    if (this.evHead > 256) { this.evq = evq.slice(this.evHead); this.evHead = 0; }

    let pos = 0;
    while (pos < n) {
      let run = n - pos;
      const frame = currentFrame + pos;
      const q = this.evq;
      while (this.evHead < q.length && q[this.evHead][0] <= frame) this.applyEvent(q[this.evHead++]);
      if (this.evHead < q.length && q[this.evHead][0] < frame + run) run = Math.max(1, Math.ceil(q[this.evHead][0] - frame));
      let legacyClip = false;
      if (this.hosted) {
        if (this.clipStopAt >= 0 && this.clipStopAt <= frame) {
          this.clipStopAt = -1; this.clip = null; this.clipStep = -1;
          this.port.postMessage({ t: 'clipstop', frame });
        }
        if (this.clipPend && this.clipPend.at <= frame) {
          this.clip = this.clipPend; this.clipPend = null;
          if (rhythmHasEnabledLane(this.clip.rhythm)) this.resetHostedPoly(frame);
          else this.clipStep = this.clipPhase(Math.round, frame) - 1;
          this.clipToNext = 0;
          this.port.postMessage({ t: 'clipstart', frame });
        }
        this.autoTick(frame);
        if (this.clipStopAt >= 0 && this.clipStopAt < currentFrame + n)
          run = Math.min(run, Math.max(1, Math.ceil(this.clipStopAt - frame)));
        if (this.clipPend && this.clipPend.at < currentFrame + n)
          run = Math.min(run, Math.max(1, Math.ceil(this.clipPend.at - frame)));
        if (this.clip) {
          if (rhythmHasEnabledLane(this.clip.rhythm)) {
            const polyRun = this.schedulePoly(frame, currentFrame + n, true);
            if (polyRun <= 0) continue;
            run = Math.min(run, polyRun);
          } else {
            legacyClip = true;
            if (this.clipToNext <= 0) this.clipFire(frame);
            run = Math.min(run, Math.max(1, Math.ceil(this.clipToNext)));
          }
        }
      }
      if (!this.hosted) this.autoTick(frame);
      if (standalonePoly) {
        const polyRun = this.schedulePoly(frame, currentFrame + n, false);
        if (polyRun <= 0) continue;
        run = Math.min(run, polyRun);
      }
      if (standalone) {
        if (!standalonePoly && this.samplesToNext <= 0) {
          this.fireStep();
        }
        if (!standalonePoly) run = Math.min(run, Math.ceil(this.samplesToNext));
      }
      for (let i = 0; i < NPADS; i++) {
        const v = this.voices[i];
        if (v.active) this.renderPad(v, i, padL[i], padR[i], pos, run);
        const tail = this.tails[i];
        if (tail.active) this.renderPad(tail, i, padL[i], padR[i], pos, run);
        const fade = this.fades[i];
        if (fade.active) this.renderPad(fade, i, padL[i], padR[i], pos, run);
      }
      if (standalone) this.samplesToNext -= run;
      if (legacyClip && this.clip) this.clipToNext -= run;
      pos += run;
    }

    this.renderFx(outputs, n);
    if (this.hitPads) {
      const pads = [];
      for (let i = 0; i < NPADS; i++) if (this.hitPads & (1 << i)) pads.push(i);
      this.hitPads = 0;
      this.port.postMessage({ t: 'hits', pads });
    }

    if (this.reverbMetering && this.reverbSamples >= sampleRate / 30) {
      const e = this.reverbEnergy, rms = i => Math.max(-90, 10 * Math.log10(Math.max(1e-9, e[i] / this.reverbSamples)));
      const product = Math.sqrt(e[0] * e[1]);
      this.port.postMessage({ t: 'reverb', pad: this.meterPad, left: rms(0), right: rms(1), correlation: product > this.reverbSamples * 1e-9 ? Math.max(-1, Math.min(1, e[2] / product)) : 0, bus: this.meterBus, shared: true });
      e.fill(0); this.reverbSamples = 0;
    }
    if (this.echoMetering && this.echoSamples >= sampleRate / 30) {
      const e = this.echoEnergy, rms = i => Math.max(-90, 10 * Math.log10(Math.max(1e-9, e[i] / this.echoSamples)));
      const fx = this.padFx[this.meterPad];
      this.port.postMessage({ t: 'echo', pad: this.meterPad, input: rms(0), left: rms(1), right: rms(2), time: fx.dlTime.cur, driftL: 0, driftR: 0 });
      e.fill(0); this.echoSamples = 0;
    }
    if (this.metering && this.meterSamples >= sampleRate / 30) {
      const e = this.meterEnergy, fx = this.padFx[this.meterPad], ott = fx.ott, comp = fx.comp;
      const db = value => Math.max(-90, Math.min(60, 20 * Math.log10(Math.max(1e-9, value))));
      const rms = i => db(Math.sqrt(e[i] / this.meterSamples));
      const active = ott.depthTarget > 0;
      this.port.postMessage({ t: 'dynamics', pad: this.meterPad,
        ott: { input: rms(0), output: rms(1), levels: Array.from(ott.env, v => active ? db(v) : -90), gains: Array.from(ott.gain, (v, i) => active && ott.env[i] > 1e-7 ? db(v) : 0), makeup: active ? db(ott.autoGain.gain) : 0 },
        comp: { input: rms(2), output: rms(3), reduction: this.meterReduction, trace: comp.takeTrace(), makeup: comp.wetTarget ? db(comp.autoGain.gain) : 0 },
      });
      e.fill(0); this.meterSamples = 0; this.meterReduction = 0;
    }

    this.vizCount += n;
    if (this.vizCount >= 2048) {
      this.vizCount = 0;
      const v = this.voices[this.sel];
      this.port.postMessage({
        t: 'viz',
        lanes: Array.from(this.lanePositions),
        a: v.active ? v.oA.posSm : -1,
        b: v.active && this.samples[v.sample.index] && v.sample.pos >= 0
          ? Math.max(0, Math.min(1,
            v.sample.pos / Math.max(1, this.samples[v.sample.index].data.length - 1)))
          : -1,
        env: v.active ? v.ampLevel : 0,
      });
    }
    return true;
  }

  // Pad FX chains -> bus sums (+ the shared reverb send) -> bus output stage.
  /** Points a pad or group strip at its side-chain key for this block. */
  routeKey(fx, n) {
    const src = fx.keySource;
    if (src >= 1 && src <= NPADS) { fx.keyL = this.keyDryL[src - 1]; fx.keyR = this.keyDryR[src - 1]; }
    else if (src > NPADS) { const ext = this.keyIn?.[src - NPADS] ?? null; fx.keyL = fx.keyR = ext && ext.subarray(0, n); }
    else fx.keyL = fx.keyR = null;
  }

  renderFx(outputs, n) {
    // Dry pad copies for side-chain keys, taken before any pad FX run so every
    // strip hears the same key whatever the pad order.
    for (let i = 0; i < NPADS; i++) { this.keyDryL[i].set(this.padL[i].subarray(0, n)); this.keyDryR[i].set(this.padR[i].subarray(0, n)); }
    // The extra output carries pad 01 (KICK) alone, mono, for SQ-4 keys, at
    // the kit's output gain so a KICK key is as strong as the kick in the mix.
    const kick = outputs[BUSES];
    if (kick && kick[0]) {
      const vol = this.pv[G_VOL], g = 0.5 * vol * vol * 1.6;
      for (let k = 0; k < n; k++) kick[0][k] = g * (this.padL[0][k] + this.padR[0][k]);
    }
    const bpm = this.hostBpm > 0 && this.hosted ? this.hostBpm : (this.pv[G_BPM] || 126);
    for (const fx of this.padFx) fx.lab.setTempoOverride(bpm);
    for (const fx of this.groupFx) fx.lab.setTempoOverride(bpm);
    if (this.fxDirty) {
      this.fxDirty = false;
      for (let i = 0; i < NPADS; i++) this.padFx[i].setParams(this.pv, this.padIds[i]);
      for (let b = 0; b < BUSES; b++) this.groupFx[b].setParams(this.pv, this.groupFxIds);
      const vol = this.pv[G_VOL];
      for (const b of this.busOut) b.gain.target = vol * vol * 1.6;
    }
    const busL = this.busL, busR = this.busR, vinL = this.verbInL, vinR = this.verbInR;
    for (let b = 0; b < BUSES; b++) {
      busL[b].fill(0, 0, n); busR[b].fill(0, 0, n);
      vinL[b].fill(0, 0, n); vinR[b].fill(0, 0, n);
    }
    this.sizeAcc.fill(0); this.sizeW.fill(0);
    // Bus identity comes from the selected pad's routed parameters, even when
    // that pad is silent/gated. This keeps the visualizer on AUX tails during
    // a quiet selected hit instead of falling back to MAIN.
    const selectedBus = this.padFx[this.meterPad].bus;
    if (this.meterBus !== selectedBus) {
      this.reverbEnergy.fill(0); this.reverbSamples = 0;
    }
    this.meterBus = selectedBus;
    for (let b = 0; b < BUSES; b++) this.verbs[b].meterEnabled = this.reverbMetering && b === selectedBus;

    for (let i = 0; i < NPADS; i++) {
      const fx = this.padFx[i];
      fx.meterSelected = this.metering || this.echoMetering ? i === this.meterPad : false;
      const live = this.voices[i].active || this.tails[i].active || this.fades[i].active;
      this.routeKey(fx, n);
      if (!fx.process(this.padL[i], this.padR[i], n, live)) continue;
      if (this.padCapture) this.capturePad(i, n);
      if (i === this.meterPad) {
        this.meterBus = fx.bus;
        if (this.metering) {
          this.meterEnergy[0] += fx.meterInput; this.meterEnergy[1] += fx.meterOtt;
          this.meterEnergy[2] += fx.meterCompIn; this.meterEnergy[3] += fx.meterCompOut;
          this.meterReduction = Math.max(this.meterReduction, Math.max(0, -20 * Math.log10(Math.max(1e-9, fx.comp.gain))));
          fx.meterInput = fx.meterOtt = fx.meterCompIn = fx.meterCompOut = 0;
        }
        if (this.echoMetering) {
          this.echoEnergy[0] += fx.meterEchoIn; this.echoEnergy[1] += fx.meterEchoL; this.echoEnergy[2] += fx.meterEchoR;
          fx.meterEchoIn = fx.meterEchoL = fx.meterEchoR = 0;
        }
      }
      const b = fx.bus;
      const l = this.padL[i], r = this.padR[i];
      const bl = busL[b], br = busR[b], vl = vinL[b], vr = vinR[b];
      if (fx.verbWet.settled() && fx.verbDry.settled()) {
        const w = fx.verbWet.cur, d = fx.verbDry.cur;
        if (w === 0) {
          for (let k = 0; k < n; k++) { bl[k] += l[k] * d; br[k] += r[k] * d; }
        } else {
          for (let k = 0; k < n; k++) {
            bl[k] += l[k] * d; br[k] += r[k] * d;
            vl[k] += l[k] * w; vr[k] += r[k] * w;
          }
        }
      } else {
        for (let k = 0; k < n; k++) {
          const w = fx.verbWet.next(), d = fx.verbDry.next();
          bl[k] += l[k] * d; br[k] += r[k] * d;
          vl[k] += l[k] * w; vr[k] += r[k] * w;
        }
      }
      if (fx.verbOn && fx.verbWet.target > 0) {
        // One Freeverb per bus, shared by the pads sending into it. Its SIZE is
        // the send-weighted mean of theirs — continuous, and smoothed into the
        // running tail rather than swapped under it.
        this.sizeAcc[b] += fx.verbWet.target * fx.verbSize;
        this.sizeW[b] += fx.verbWet.target;
      }
    }

    for (let b = 0; b < BUSES; b++) {
      const verb = this.verbs[b];
      if (this.sizeW[b] > 0) verb.size.target = this.sizeAcc[b] / this.sizeW[b];
      verb.update(n);
      this.verbInputGuards[b].process(vinL[b], vinR[b], n);
      verb.meterL = verb.meterR = verb.meterLR = 0;
      verb.process(vinL[b], vinR[b], busL[b], busR[b], n);
      if (this.reverbMetering && b === this.meterBus) {
        this.reverbEnergy[0] += verb.meterL; this.reverbEnergy[1] += verb.meterR; this.reverbEnergy[2] += verb.meterLR;
      }
      // The group strip is a true post-mix insert. PadFx keeps reverb as a
      // send, so give this second layer its own final group reverb network.
      const group = this.groupFx[b];
      const bl = busL[b], br = busR[b];
      this.routeKey(group, n);
      group.process(bl, br, n, true);
      const gvinL = vinL[b], gvinR = vinR[b];
      gvinL.fill(0, 0, n); gvinR.fill(0, 0, n);
      if (group.verbWet.settled() && group.verbDry.settled()) {
        const w = group.verbWet.cur, d = group.verbDry.cur;
        for (let k = 0; k < n; k++) {
          const l = bl[k], r = br[k];
          bl[k] = l * d; br[k] = r * d; gvinL[k] = l * w; gvinR[k] = r * w;
        }
      } else {
        for (let k = 0; k < n; k++) {
          const w = group.verbWet.next(), d = group.verbDry.next(), l = bl[k], r = br[k];
          bl[k] = l * d; br[k] = r * d; gvinL[k] = l * w; gvinR[k] = r * w;
        }
      }
      const groupVerb = this.groupVerbs[b];
      groupVerb.size.target = group.verbSize;
      groupVerb.update(n);
      this.groupVerbInputGuards[b].process(gvinL, gvinR, n);
      groupVerb.process(gvinL, gvinR, bl, br, n);
      let pk = 0;
      for (let k = 0; k < n; k++) {
        const a = bl[k] < 0 ? -bl[k] : bl[k], c = br[k] < 0 ? -br[k] : br[k];
        if (a > pk) pk = a;
        if (c > pk) pk = c;
      }
      if (!this.busOut[b].process(bl, br, n, pk)) continue;
      if (this.mixdown) {
        const out = outputs[0];
        if (!out || !out[0]) continue;
        const oL = out[0], oR = out.length > 1 ? out[1] : null;
        for (let k = 0; k < n; k++) { oL[k] += bl[k]; if (oR) oR[k] += br[k]; }
        continue;
      }
      const out = outputs[b];
      if (!out) continue;
      out[0].set(bl.subarray(0, n));
      if (out.length > 1) out[1].set(br.subarray(0, n));
    }
    if (this.metering) this.meterSamples += n;
    if (this.padCapture) this.capFrames += n;
    if (this.echoMetering) this.echoSamples += n;
    if (this.reverbMetering) this.reverbSamples += n;
  }

  fireStep() {
    this.polyOrdinal++;
    const bpm = Math.max(60, Math.min(200, this.pv[G_BPM] || 126));
    const dur = (60 / bpm / 4) * sampleRate;
    const swing = this.pv[G_SWING] || 0;
    const next = this.step + 1;
    if (next >= STEPS) {
      this.step = -1;
      this.chainPos = (this.chainPos + 1) % this.chain.length;
    }
    const s = (this.step + 1) % STEPS;
    const pat = this.chain[this.chainPos] | 0;
    const hits = [];
    for (let i = 0; i < NPADS; i++) {
      const val = this.pats[pat * NPADS * STEPS + i * STEPS + s];
      if (val) {
        this.trigger(i, val === 2 ? ACCENT_VEL : PLAIN_VEL);
        hits.push(i);
      }
    }
    this.step = s;
    const offNow = s % 2 === 1 ? swing * SWING_MAX * dur : 0;
    const sNext = (s + 1) % STEPS;
    const offNext = sNext % 2 === 1 ? swing * SWING_MAX * dur : 0;
    this.samplesToNext = dur - offNow + offNext;
    this.port.postMessage({ t: 'step', s, pat, hits });
  }
}

registerProcessor('fable-dr', DrumProcessor);
