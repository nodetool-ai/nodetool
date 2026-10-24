// FableSynth BL-1 DSP core — AudioWorklet thread. Self-contained (no imports).
// Source: fablesynth src/bass/engine/worklet-bass.js. One mono last-note-
// priority acid voice and the BL-1 FX rack. The timeline sequences it: the
// upstream pattern sequencer, arp and SQ-4 clip transport are removed.
//
// In:  {t:'init',params} {t:'tables',list} {t:'p',k,v} {t:'panic'}
//      {t:'evs',ev}  flat [frame, on, pitch, velocity 0..1] quadruples
//      {t:'evclear'} drop queued events and release the voice
//      {t:'noteon',pitch,vel} {t:'noteoff',pitch}  on-screen keyboard
//      {t:'tempo',bpm,anchor}  bar-locked LFO: tempo and the frame of beat 0
//      {t:'dynamics'|'echo'|'reverb',on}  FX telemetry subscriptions
// processorOptions: {params, tables, events, bpm, anchor} — everything an
//      offline render needs before its first quantum.
// Out: {t:'ready'} {t:'latency',n} {t:'viz',pos,env,fenv,cut,gate,pitch}
//      and the FX telemetry packets.
//
// A note-on while another note is held slides into it (the envelopes keep
// running); a note-on at or above velocity `acc.vel` (1..127) is an accent.

const MAXUNI = 7;
const ACCENT_VEL = 1.0;
const PLAIN_VEL = 0.72;
const ROOT_MIDI = 36;
// Filter env sweep span (octaves at flt.env = ±100%) and LFO span (octaves at
// depth = 100%). Accent multiplies the env peak and shortens its decay.
const FENV_OCT = 5;
const LFO_OCT = 2;
const ACC_GAIN = 0.7;
// Declick slew on the amp level (s). Rounds the corners of a fast attack or
// release without audibly softening the transient.
const AMP_SLEW = 0.0003;
// Accent/velocity gain slew (s): time-based, so a gain change never depends
// on how the render is split into chunks.
const GAIN_SLEW = 0.001;
const ACC_DEC_SHORTEN = 0.35;
const KEYTRACK_REF = 60;
// DC blocker pole at the 48 kHz reference rate; remapped to the device rate in
// the constructor so the corner sits at the same frequency everywhere.
const DC_R = 0.9998;
// Chunk-invariant smoothing constants. The engine used to apply a fixed
// coefficient per call (0.35 per 16-sample osc sub-block, 0.5 per chunk), which
// makes the glide depend on the block size and the device rate. Expressed as
// time constants they reproduce the old 48 kHz behaviour exactly and hold it at
// any rate. -ln(1 - 0.35) = 0.4307829160924542, -ln(1 - 0.5) = ln 2.
const POS_TAU = 16 / (48000 * 0.4307829160924542);
const CUT_TAU = 128 / (48000 * Math.LN2);
// Accent ramp: an accent that latches on a running voice (slide into an
// accented step) fades in over this time instead of stepping the amp gain and
// the filter-env peak at the chunk boundary. A fresh note-on snaps.
const ACC_TAU = 0.008;
// Match the native ADAA transition: the drive amount is a linear blend over
// the full 100 ms control range, rather than a block-size-dependent one-pole.
const ADAA_FADE_WIDTH = 0.1;
const ADAA_INPUT_LIMIT = 16;
// Cutoff coefficient update rate inside a chunk (samples).
const FLT_SUB = 32;
// Cycles per beat for each lfo.rate index — mirrors LFO_DIV_F in src/params.ts.
const LFO_DIV_F = [0.25, 0.5, 1, 2 / 3, 1.5, 2, 4 / 3, 3, 4, 6, 8];

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

// One-pole coefficient for n samples at time constant tauSr (in samples).
function smoothCoef(n, tauSr) {
  return 1 - Math.exp(-n / tauSr);
}

// Cubic Hermite (Catmull-Rom) table read, indices pre-wrapped. Mirrors rdH in
// juce/source/bass/dsp/BassEngine.cpp — 10-20 dB less interpolation image than
// the linear read it replaces.
function rdH(d, off, im1, i0, i1, i2, f) {
  const ym1 = d[off + im1], y0 = d[off + i0], y1 = d[off + i1], y2 = d[off + i2];
  const c1 = 0.5 * (y1 - ym1);
  const c2 = ym1 - 2.5 * y0 + 2 * y1 - 0.5 * y2;
  const c3 = 0.5 * (y2 - ym1) + 1.5 * (y0 - y1);
  return ((c3 * f + c2) * f + c1) * f + y0;
}

// Band-limited square for the SUB oscillator. Mirrors subSquareTable() /
// subSquareMip() / subSquareRead() in juce/source/dsp/Wavetables.{h,cpp}: odd
// harmonics 1/k, coarsest mip first (mip m keeps harmonics 1..(1024>>m)), a
// 4096-point cycle with 1 wrapped guard sample before and 2 after, read with
// the same mip rule and cubic Hermite as the wavetable oscillators. Built once
// per worklet scope (constructors call it), never on the audio thread.
const SUBSQ_SIZE = 4096, SUBSQ_STRIDE = SUBSQ_SIZE + 3, SUBSQ_MIPS = 11;
let subSquareTbl = null;
function subSquareTable() {
  if (subSquareTbl) return subSquareTbl;
  const lut = new Float64Array(SUBSQ_SIZE), acc = new Float64Array(SUBSQ_SIZE);
  for (let j = 0; j < SUBSQ_SIZE; j++) lut[j] = Math.sin(2 * Math.PI * j / SUBSQ_SIZE);
  const out = new Float32Array(SUBSQ_MIPS * SUBSQ_STRIDE);
  const coef = 4 / Math.PI;
  let k = 1;
  for (let m = SUBSQ_MIPS - 1; m >= 0; m--) {
    const maxHarm = 1024 >> m;
    for (; k <= maxHarm; k += 2) {
      const inv = 1 / k;
      for (let i = 0; i < SUBSQ_SIZE; i++) acc[i] += lut[(k * i) & (SUBSQ_SIZE - 1)] * inv;
    }
    const base = m * SUBSQ_STRIDE;
    for (let i = -1; i < SUBSQ_SIZE + 2; i++)
      out[base + i + 1] = acc[(i + SUBSQ_SIZE) & (SUBSQ_SIZE - 1)] * coef;
  }
  return (subSquareTbl = out);
}
// Mip for phase increment `inc` into the reusable `r` {off, offFine, blend}.
function subSquareMip(r, inc) {
  const mipF = Math.log2((inc * 1024) / 0.475);
  let mip = 0; r.blend = 0;
  if (mipF > 0) {
    mip = Math.min(SUBSQ_MIPS - 1, Math.ceil(mipF));
    const over = mipF - (mip - 1);
    if (over < 0.07) r.blend = 1 - over / 0.07;
  }
  r.off = mip * SUBSQ_STRIDE;
  r.offFine = (mip > 0 ? mip - 1 : 0) * SUBSQ_STRIDE;
  return r;
}
function subSquareReadMip(t, off, ph) {
  const p = ph * SUBSQ_SIZE;
  const idx = p | 0;
  const f = p - idx;
  const q = off + idx;
  const ym1 = t[q], y0 = t[q + 1], y1 = t[q + 2], y2 = t[q + 3];
  const c1 = 0.5 * (y1 - ym1);
  const c2 = ym1 - 2.5 * y0 + 2 * y1 - 0.5 * y2;
  const c3 = 0.5 * (y2 - ym1) + 1.5 * (y0 - y1);
  return ((c3 * f + c2) * f + c1) * f + y0;
}
function subSquareRead(t, m, ph) {
  const sc = subSquareReadMip(t, m.off, ph);
  if (m.blend < 0.001) return sc;
  return sc + m.blend * (subSquareReadMip(t, m.offFine, ph) - sc);
}
const SUBSQ_MIP = { off: 0, offFine: 0, blend: 0 };

// ---------------------------------------------------------------------------
// Master FX chain — JS port of juce/source/bass/dsp/BassFx.cpp and the shared
// primitives in juce/source/dsp/Fx.{h,cpp}. BL-1 used to run this rack as a
// graph of native WebAudio nodes (WaveShaper 2x, DelayNode, ConvolverNode,
// DynamicsCompressor); those are a different algorithm from the plugin's, so
// accents and resonance peaks came out several dB apart between the two
// products (audio-engine review B5/W6). One algorithm now runs in both.
//
// OTT -> compressor -> drive -> chorus -> ping-pong delay -> Freeverb ->
// master gain -> DC block -> lookahead limiter (-1 dBFS hard ceiling).
// ---------------------------------------------------------------------------

const HB1_TAPS = 63;
const HB2_TAPS = 17;
// Up+shape+down group delay, exact in base samples.
const DRIVE_LATENCY = (HB1_TAPS - 1) / 2 + (HB2_TAPS - 1) / 4; // 35
// Safety-limiter static curve: threshold -6 dB, ratio 14 — the settings of the
// DynamicsCompressorNode this replaces, kept only to reproduce its makeup gain.
const LIM_THR = 0.501;
const LIM_RATIO = 14;
const LIM_CEILING = 0.8912509381337456; // -1 dBFS
// Freeverb tuning (classic constants, scaled to the device rate).
const COMB_TUNE = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617];
const AP_TUNE = [556, 441, 341, 225];
const STEREO_SPREAD = 23;
const FX_COEF_CHUNK = 32;

function besselI0(x) {
  let sum = 1, term = 1;
  for (let k = 1; k < 64; k++) {
    term *= (x * x) / (4 * k * k);
    sum += term;
    if (term < 1e-16 * sum) break;
  }
  return sum;
}

// Kaiser-windowed odd-length half-band FIR (cutoff = rate/4), polyphase.
// Every tap at an even offset from the centre is structurally zero and the
// centre tap is exactly 0.5, so the 2x interpolator is one branch plus a pure
// delay and the 2x decimator is one branch plus a delayed tap: 86 MACs per
// base sample through the 4x drive path instead of 324 (review finding J4).
// pe[j] = h[2j], po[j] = h[2j+1]; [A,B] is each phase's non-zero index range.
// Same decomposition as HalfBandFir in juce/source/dsp/Fx.cpp.
class LfoClock {
  constructor() { this.ready = false; }
  reset() { this.ready = false; }
  update(position, rate) {
    if (!this.ready || position < this.position) {
      this.cycles = position * rate;
      this.ready = true;
    } else this.cycles += (position - this.position) * this.rate;
    this.position = position; this.rate = rate;
    return this.cycles;
  }
  phase(position, rate) { const c = this.update(position, rate); return c - Math.floor(c); }
}

class HalfBand {
  constructor(taps, beta) {
    const h = new Float64Array(taps);
    const M = taps - 1, ib = besselI0(beta);
    for (let i = 0; i < taps; i++) {
      const m = i - M * 0.5;
      const sinc = m === 0 ? 0.5 : Math.sin(Math.PI * 0.5 * m) / (Math.PI * m);
      const t = (2 * m) / M;
      h[i] = (sinc * besselI0(beta * Math.sqrt(Math.max(0, 1 - t * t)))) / ib;
    }
    // sin(PI*m/2) for an even integer m evaluates to ~1e-16, not 0. Forcing
    // those taps to zero makes the polyphase split exact.
    const c = (taps - 1) >> 1;
    for (let i = 0; i < taps; i++) if (i !== c && (i - c) % 2 === 0) h[i] = 0;

    // The centre tap is exactly 0.5 and it is the only non-zero tap of its
    // phase, so one polyphase branch is a bare delay and the other is a dense
    // FIR of ceil(taps/4) taps. g[] holds that dense branch.
    const ne = (taps + 1) >> 1, no = taps >> 1;
    this.cEven = (c & 1) === 0;
    const branch = new Float64Array(this.cEven ? no : ne);
    for (let j = 0; j < branch.length; j++) branch[j] = h[this.cEven ? 2 * j + 1 : 2 * j];
    this.g = branch;
    this.dly = c >> 1; // delay-branch tap, in phase samples
    this.np = Math.max(ne, no + 1);
    // mirror-written histories, so a branch reads a contiguous window
    this.hx = new Float64Array(2 * this.np);
    this.he = new Float64Array(2 * this.np);
    this.ho = new Float64Array(2 * this.np);
    this.px = 0; this.pd = 0;
    this.y0 = 0; this.y1 = 0;
  }

  reset() {
    this.hx.fill(0); this.he.fill(0); this.ho.fill(0);
    this.px = 0; this.pd = 0; this.y0 = 0; this.y1 = 0;
  }

  // One base-rate sample in, both upsampled samples out (y0, y1). Equivalent
  // to the direct form's process(2*x) then process(0).
  interpolate(x) {
    let p = this.px - 1;
    if (p < 0) p = this.np - 1;
    this.px = p;
    const hx = this.hx, g = this.g, nb = g.length;
    hx[p] = x; hx[p + this.np] = x;
    let a = 0, j = 0;
    for (; j + 3 < nb; j += 4) {
      a += g[j] * hx[p + j] + g[j + 1] * hx[p + j + 1]
         + g[j + 2] * hx[p + j + 2] + g[j + 3] * hx[p + j + 3];
    }
    for (; j < nb; j++) a += g[j] * hx[p + j];
    a += a;
    const d = hx[p + this.dly];
    if (this.cEven) { this.y0 = d; this.y1 = a; } else { this.y0 = a; this.y1 = d; }
  }

  // The two high-rate samples of one output period in, the kept (first) phase
  // out. Equivalent to process(x0) then process(x1), keeping the first result.
  decimate(x0, x1) {
    let p = this.pd - 1;
    if (p < 0) p = this.np - 1;
    this.pd = p;
    const he = this.he, ho = this.ho, g = this.g, nb = g.length, np = this.np;
    he[p] = x0; he[p + np] = x0;
    ho[p] = x1; ho[p + np] = x1;
    // The dense branch reads the phase the centre tap does not.
    const b = this.cEven ? ho : he;
    const q = this.cEven ? p + 1 : p;
    let a = 0, j = 0;
    for (; j + 3 < nb; j += 4) {
      a += g[j] * b[q + j] + g[j + 1] * b[q + j + 1]
         + g[j + 2] * b[q + j + 2] + g[j + 3] * b[q + j + 3];
    }
    for (; j < nb; j++) a += g[j] * b[q + j];
    return a + 0.5 * (this.cEven ? he[p + this.dly] : ho[p + this.dly + 1]);
  }

  // Block forms of the two entry points above. Identical arithmetic in
  // identical order — the taps and the ring pointer just land in locals once
  // per segment instead of once per sample, which is most of the cost at these
  // tap counts. Verified bit-identical against the per-sample form.
  interpolateBlock(src, at, n, dst) {
    const g = this.g, nb = g.length, hx = this.hx, np = this.np, dly = this.dly, cEven = this.cEven;
    let p = this.px;
    for (let i = 0; i < n; i++) {
      if (--p < 0) p = np - 1;
      const x = src[at + i];
      hx[p] = x; hx[p + np] = x;
      let a = 0, j = 0;
      for (; j + 3 < nb; j += 4) {
        a += g[j] * hx[p + j] + g[j + 1] * hx[p + j + 1]
           + g[j + 2] * hx[p + j + 2] + g[j + 3] * hx[p + j + 3];
      }
      for (; j < nb; j++) a += g[j] * hx[p + j];
      a += a;
      const d = hx[p + dly];
      if (cEven) { dst[2 * i] = d; dst[2 * i + 1] = a; } else { dst[2 * i] = a; dst[2 * i + 1] = d; }
    }
    this.px = p;
  }

  decimateBlock(src, n, dst, at) {
    const g = this.g, nb = g.length, he = this.he, ho = this.ho;
    const np = this.np, dly = this.dly, cEven = this.cEven;
    let p = this.pd;
    for (let i = 0; i < n; i++) {
      if (--p < 0) p = np - 1;
      const x0 = src[2 * i], x1 = src[2 * i + 1];
      he[p] = x0; he[p + np] = x0;
      ho[p] = x1; ho[p + np] = x1;
      const b = cEven ? ho : he;
      const q = cEven ? p + 1 : p;
      let a = 0, j = 0;
      for (; j + 3 < nb; j += 4) {
        a += g[j] * b[q + j] + g[j + 1] * b[q + j + 1]
           + g[j + 2] * b[q + j + 2] + g[j + 3] * b[q + j + 3];
      }
      for (; j < nb; j++) a += g[j] * b[q + j];
      dst[at + i] = a + 0.5 * (cEven ? he[p + dly] : ho[p + dly + 1]);
    }
    this.pd = p;
  }

  // Copy the whole filter state out of `o`. An FIR's state is its input
  // history, so after a stretch of identical input two instances hold the same
  // numbers; this makes that explicit when one of them was skipped.
  copyStateFrom(o) {
    this.hx.set(o.hx); this.he.set(o.he); this.ho.set(o.ho);
    this.px = o.px; this.pd = o.pd; this.y0 = o.y0; this.y1 = o.y1;
  }
}

// One-pole smoother toward a target (setTargetAtTime equivalent).
class Smooth {
  constructor() { this.cur = 0; this.target = 0; this.coef = 0.01; }
  setTime(tau, sr) { this.coef = 1 - Math.exp(-1 / (tau * sr)); }
  next() { this.cur += (this.target - this.cur) * this.coef; return this.cur; }
  snap(v) { this.cur = v; this.target = v; }
}

// Finding J1: AMT, chorus RATE/DEPTH and reverb SIZE arrive as block values, so
// their derived coefficients used to jump once per render quantum. They now ramp
// over ~15 ms in FX_COEF_CHUNK-sample steps. (Mix, feedback, delay time and
// master gain were already per-sample Smooths.) Lockstep with ChunkRamp in
// juce/source/dsp/Fx.h.
class ChunkRamp {
  constructor() { this.cur = 0; this.target = 0; this.step = 0; this.left = 0; this.steps = 8; }
  setSteps(s) { this.steps = s > 1 ? s : 1; }
  setTarget(t) {
    if (t === this.target) return;
    this.target = t; this.step = (t - this.cur) / this.steps; this.left = this.steps;
  }
  // Advances one chunk; true while the value still moves, so the caller only
  // pays for a coefficient rebuild during the ramp.
  next() {
    if (this.left <= 0) return false;
    this.cur = --this.left === 0 ? this.target : this.cur + this.step;
    return true;
  }
  snapToTarget() { this.cur = this.target; this.left = 0; this.step = 0; }
}

// RBJ cookbook biquad, transposed direct form II.
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

// Fractional-read delay line. float32 storage, as in the plugin.
class DelayLine {
  constructor(n) { this.b = new Float32Array(Math.max(4, n | 0)); this.w = 0; }
  reset() { this.b.fill(0); this.w = 0; }
  write(x) { this.b[this.w] = x; if (++this.w >= this.b.length) this.w = 0; }
  read(d) {
    const sz = this.b.length;
    let rd = this.w - d;
    while (rd < 0) rd += sz;
    const i0 = rd | 0, frac = rd - i0;
    const i1 = i0 + 1 < sz ? i0 + 1 : 0;
    return this.b[i0] + frac * (this.b[i1] - this.b[i0]);
  }
  // 4-point Catmull-Rom, for the modulated reads (chorus, echo).
  readH(d) {
    const b = this.b, sz = b.length;
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

// Freeverb building blocks.
class FvComb {
  constructor(n) { this.buf = new Float32Array(Math.max(1, n | 0)); this.idx = 0; this.filt = 0; this.damp1 = 0.2; this.damp2 = 0.8; this.feedback = 0.84; }
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
  constructor(n) { this.buf = new Float32Array(Math.max(1, n | 0)); this.idx = 0; this.feedback = 0.5; }
  reset() { this.buf.fill(0); }
  process(x) {
    const bufout = this.buf[this.idx];
    const out = -x + bufout;
    this.buf[this.idx] = x + bufout * this.feedback;
    if (++this.idx >= this.buf.length) this.idx = 0;
    return out;
  }
}

// Lookahead brickwall limiter: fixed makeup gain feeding a delayed signal
// path, linked-stereo sliding-window-minimum gain that fully develops inside
// the ~1.5 ms lookahead, ~200 ms release, hard -1 dBFS sample-peak ceiling.
// The DynamicsCompressorNode this replaces had no ceiling at all.
class LookaheadLimiter {
  constructor(sr, makeup) {
    this.la = Math.max(8, Math.round(0.0015 * sr));
    this.qcap = this.la + 2;
    this.dlL = new Float32Array(this.la);
    this.dlR = new Float32Array(this.la);
    this.qv = new Float64Array(this.qcap).fill(1);
    this.qi = new Float64Array(this.qcap);
    this.atk = 1 - Math.exp(-4 / this.la);
    this.rel = 1 - Math.exp(-1 / (0.2 * sr));
    this.makeup = makeup;
    this.w = 0; this.qh = 0; this.qt = 0; this.t = 0; this.env = 1;
    this.outL = 0; this.outR = 0;
  }
  reset() {
    this.dlL.fill(0); this.dlR.fill(0);
    this.qh = 0; this.qt = 0; this.w = 0; this.t = 0; this.env = 1;
  }
  process(l, r) {
    const cap = this.qcap, qv = this.qv, qi = this.qi;
    const xl = l * this.makeup, xr = r * this.makeup;
    const pk = Math.max(Math.abs(xl), Math.abs(xr));
    const g = pk > LIM_CEILING ? LIM_CEILING / pk : 1;
    // monotonic ring queue: minimum required gain over the last la+1 samples
    while (this.qh !== this.qt) {
      const prev = this.qt > 0 ? this.qt - 1 : cap - 1;
      if (qv[prev] < g) break;
      this.qt = prev;
    }
    qv[this.qt] = g; qi[this.qt] = this.t;
    this.qt = this.qt + 1 < cap ? this.qt + 1 : 0;
    if (qi[this.qh] < this.t - this.la) this.qh = this.qh + 1 < cap ? this.qh + 1 : 0;
    const wmin = qv[this.qh];
    this.env += (wmin - this.env) * (wmin < this.env ? this.atk : this.rel);
    const dl = this.dlL[this.w], dr = this.dlR[this.w];
    this.dlL[this.w] = xl; this.dlR[this.w] = xr;
    if (++this.w >= this.la) this.w = 0;
    this.t++;
    let gg = this.env;
    const pd = Math.max(Math.abs(dl), Math.abs(dr));
    if (gg * pd > LIM_CEILING) gg = LIM_CEILING / pd; // catch smoothing residue
    this.outL = dl * gg; this.outR = dr * gg;
  }
}

// Equal-power wet/dry, gated to hard bypass when the stage is OFF.
function mixGate(on, amount, wet) {
  if (wet) return on ? Math.sin((amount * Math.PI) / 2) : 0;
  return on ? Math.cos((amount * Math.PI) / 2) : 1;
}

class BassFx {
  constructor(sr) {
    this.keyChannel = -1; this.keyIn = null; // COMP side-chain, see setParams
    this.sr = sr;
    const scale = sr / 44100;
    this.headroom = {};
    for (const stage of ['input', 'ott', 'comp', 'drive', 'chorus', 'delay', 'reverb']) {
      this.headroom[stage] = new globalThis.FablePeakGuard(sr);
    }
    this.delayFeedbackGuard = new globalThis.FablePeakGuard(sr);

    this.combL = []; this.combR = [];
    for (let i = 0; i < 8; i++) {
      this.combL.push(new FvComb(COMB_TUNE[i] * scale));
      this.combR.push(new FvComb((COMB_TUNE[i] + STEREO_SPREAD) * scale));
    }
    this.apL = []; this.apR = [];
    for (let i = 0; i < 4; i++) {
      this.apL.push(new FvAllpass(AP_TUNE[i] * scale));
      this.apR.push(new FvAllpass((AP_TUNE[i] + STEREO_SPREAD) * scale));
    }

    this.chDl1 = new DelayLine(0.05 * sr);
    this.chDl2 = new DelayLine(0.05 * sr);
    this.dlLine = [new DelayLine(2 * sr + 4), new DelayLine(2 * sr + 4)];

    const sm = (tau) => { const s = new Smooth(); s.setTime(tau, sr); return s; };
    this.driveWet = sm(0.02); this.driveDry = sm(0.02);
    this.driveColorL = new globalThis.FableDriveColor(sr);
    this.driveColorR = new globalThis.FableDriveColor(sr);
    this.comp = new globalThis.FableCompressor(sr);
    this.eq = new globalThis.FableParametricEq(sr);
    this.ott = new globalThis.FableOttCompressor(sr);
    this.chWet = sm(0.02); this.chDry = sm(0.02);
    this.dlTime = sm(0.08); this.dlFb = sm(0.02);
    this.dlWet = sm(0.02); this.dlDry = sm(0.02);
    this.verbWet = sm(0.02); this.verbDry = sm(0.02);
    this.masterGain = sm(0.02);
    this.driveDry.snap(1); this.chDry.snap(1); this.dlDry.snap(1); this.verbDry.snap(1);

    this.dcL = new Biquad(); this.dcL.highpass(8, 0.707, sr);
    this.dcR = new Biquad(); this.dcR.highpass(8, 0.707, sr);
    this.dlDamp = new Biquad(); this.dlDamp.lowpass(4500, 0.707, sr);

    // 4x drive oversampler, one cascade per channel.
    const os = () => ({
      u1: new HalfBand(HB1_TAPS, 6), u2: new HalfBand(HB2_TAPS, 6),
      d2: new HalfBand(HB2_TAPS, 6), d1: new HalfBand(HB1_TAPS, 6),
    });
    this.osL = os(); this.osR = os();
    this.dryL = new DelayLine(DRIVE_LATENCY + 4);
    this.dryR = new DelayLine(DRIVE_LATENCY + 4);
    // Drive scratch, sized for one coefficient chunk. The chain runs a segment
    // at a time so the shaper's coefficients still change exactly where the
    // per-sample form changed them.
    this.dvIn = new Float64Array(FX_COEF_CHUNK);
    this.dvUp1 = new Float64Array(2 * FX_COEF_CHUNK);
    this.dvUp2 = new Float64Array(4 * FX_COEF_CHUNK);
    this.dvDn2 = new Float64Array(2 * FX_COEF_CHUNK);
    this.wetL = new Float64Array(FX_COEF_CHUNK);
    this.wetR = new Float64Array(FX_COEF_CHUNK);
    // True once a full mono block has passed through the shaper, so the two
    // oversamplers provably hold the same history and the right one can be
    // skipped. Cleared by any stereo block.
    this.driveMonoReady = false;

    // WebAudio's DynamicsCompressor applies a spec-defined makeup gain
    // ((1/c(1))^0.6, c = static curve at 0 dBFS). The node this replaces WAS
    // that limiter, so keep its makeup ahead of the lookahead stage or the
    // patch loudness drops several dB.
    const c1 = Math.pow(1 / LIM_THR, 1 / LIM_RATIO - 1);
    this.lim = new LookaheadLimiter(sr, Math.pow(1 / c1, 0.6));

    // ~15 ms of coefficient ramp, in FX_COEF_CHUNK-sample steps (finding J1).
    const steps = Math.max(1, Math.round((0.015 * sr) / FX_COEF_CHUNK));
    this.driveAmtR = new ChunkRamp(); this.chRateR = new ChunkRamp();
    this.chDepthR = new ChunkRamp(); this.verbSizeR = new ChunkRamp();
    for (const r of [this.driveAmtR, this.chRateR, this.chDepthR, this.verbSizeR]) r.setSteps(steps);
    this.chunkPos = 0;

    this.chPhase = 0;
    this.driveK = 1; this.drivePre = 1; this.driveNorm = 1;
    this.chRate = 0.6; this.chDepth = 0.3;
    this.roomSize = 0.84;
    this.driveOff = false; this.chorusOff = false; this.delayOff = false; this.verbOff = false;
    this.driveGated = false; this.chorusGated = false; this.delayGated = false; this.verbGated = false;
    // Opt-in UI telemetry. These accumulators are idle unless a panel is
    // subscribed, so the normal audio path does not pay for metering.
    this.metering = false; this.meterSamples = 0; this.meterEnergy = new Float64Array(4); this.meterReduction = 0;
    this.echoMetering = false; this.echoSamples = 0; this.echoEnergy = new Float64Array(3);
    this.reverbMetering = false; this.reverbSamples = 0; this.reverbEnergy = new Float64Array(3);
    this.reset();
  }

  get latencySamples() { return DRIVE_LATENCY + this.lim.la; }

  reset() {
    this.chDl1.reset(); this.chDl2.reset();
    this.meterEnergy.fill(0); this.meterSamples = 0; this.meterReduction = 0;
    this.echoEnergy.fill(0); this.echoSamples = 0;
    this.reverbEnergy.fill(0); this.reverbSamples = 0;
    this.dlLine[0].reset(); this.dlLine[1].reset();
    this.dryL.reset(); this.dryR.reset();
    for (const c of this.combL) c.reset();
    for (const c of this.combR) c.reset();
    for (const a of this.apL) a.reset();
    for (const a of this.apR) a.reset();
    this.dcL.reset(); this.dcR.reset(); this.dlDamp.reset();
    for (const guard of Object.values(this.headroom)) guard.reset();
    this.delayFeedbackGuard.reset();
    this.driveColorL.reset(); this.driveColorR.reset(); this.comp.reset(); this.ott.reset(); this.eq.reset();
    for (const o of [this.osL, this.osR]) { o.u1.reset(); o.u2.reset(); o.d2.reset(); o.d1.reset(); }
    this.lim.reset();
    this.chPhase = 0;
    this.chunkPos = 0;
    this.snapRamps();
    this.driveGated = false; this.chorusGated = false; this.delayGated = false; this.verbGated = false;
    this.meterSamples = 0; this.meterEnergy.fill(0); this.meterReduction = 0;
    this.echoSamples = 0; this.echoEnergy.fill(0);
    this.reverbSamples = 0; this.reverbEnergy.fill(0);
    for (const s of [this.driveWet, this.driveDry, this.chWet, this.chDry, this.dlTime,
      this.dlFb, this.dlWet, this.dlDry, this.verbWet, this.verbDry, this.masterGain]) s.snap(s.target);
  }

  setParams(p) {
    this.eq.setParams(k => p[k]);
    const num = (k, d) => (Number.isFinite(p[k]) ? p[k] : d);

    // AMT ramps; the shaper gains are rebuilt in updateCoefs.
    this.driveAmtR.setTarget(num('fx.drive.amt', 0));
    const dOn = num('fx.drive.on', 0) > 0.5;
    this.driveOff = !dOn;
    const dMix = num('fx.drive.mix', 0);
    this.driveWet.target = mixGate(dOn, dMix, true);
    this.driveDry.target = mixGate(dOn, dMix, false);

    this.driveColorL.setParams(num('fx.drive.type', 0), num('fx.drive.tone', 0));
    this.driveColorR.setParams(num('fx.drive.type', 0), num('fx.drive.tone', 0));
    this.comp.setParams(num('fx.comp.on', 0) > 0.5, num('fx.comp.thr', -16), num('fx.comp.att', 0.003), num('fx.comp.rel', 0.25), num('fx.comp.ratio', 4));
    // Side-chain (src/engine/sidechain.ts): 1 KICK → key channel 4, TRACK n → n-1.
    const sc = Math.round(num('fx.comp.sc', 0));
    this.keyChannel = sc === 1 ? 4 : sc >= 2 ? sc - 2 : -1;
    this.comp.setKey(this.keyChannel >= 0, num('fx.comp.schp', 20));
    this.ott.setParams(num('fx.ott.on', 0) > 0.5, num('fx.ott.depth', 0.35),
      num('fx.ott.time', 1), num('fx.ott.up', 1), num('fx.ott.down', 1));

    this.chRateR.setTarget(num('fx.chorus.rate', 0.6));
    this.chDepthR.setTarget(num('fx.chorus.depth', 0.3));
    const cOn = num('fx.chorus.on', 0) > 0.5;
    this.chorusOff = !cOn;
    const cMix = num('fx.chorus.mix', 0) * 0.8;
    this.chWet.target = mixGate(cOn, cMix, true);
    this.chDry.target = mixGate(cOn, cMix, false);

    this.dlTime.target = num('fx.delay.time', 0.375);
    this.dlFb.target = num('fx.delay.fb', 0);
    const delOn = num('fx.delay.on', 0) > 0.5;
    this.delayOff = !delOn;
    const delMix = num('fx.delay.mix', 0) * 0.85;
    this.dlWet.target = mixGate(delOn, delMix, true);
    this.dlDry.target = mixGate(delOn, delMix, false);

    // SIZE maps to roomsize/decay — a longer, brighter tail. Unlike the
    // ConvolverNode it replaces there is no buffer to re-render, so the tail
    // stays continuous across a SIZE change.
    // The comb coefficients follow SIZE in updateCoefs.
    this.verbSizeR.setTarget(Math.min(1, Math.max(0, num('fx.reverb.size', 0.3))));
    const rOn = num('fx.reverb.on', 0) > 0.5;
    this.verbOff = !rOn;
    const rMix = num('fx.reverb.mix', 0) * 0.9;
    this.verbWet.target = mixGate(rOn, rMix, true);
    this.verbDry.target = mixGate(rOn, rMix, false);

    const vol = num('master.volume', 0.78);
    this.masterGain.target = vol * vol * 1.6;
  }

  // Rebuild every coefficient that derives from a ramped parameter. Called once
  // per FX_COEF_CHUNK samples, and only while something is moving.
  updateCoefs(force) {
    let moved = force;
    if (this.driveAmtR.next()) moved = true;
    if (this.chRateR.next()) moved = true;
    if (this.chDepthR.next()) moved = true;
    const verbMoved = this.verbSizeR.next();
    if (moved) {
      const amt = this.driveAmtR.cur;
      this.drivePre = 1 + amt * 2;
      this.driveK = 1 + amt * 12;
      this.driveNorm = 1 / (this.drivePre * Math.tanh(this.driveK));
      this.chRate = this.chRateR.cur;
      this.chDepth = this.chDepthR.cur;
    }
    if (verbMoved || force) {
      // SIZE maps to roomsize/decay — a longer, brighter tail. Unlike the
      // ConvolverNode this replaces there is no buffer to re-render, so the
      // tail stays continuous across a SIZE change.
      const size = this.verbSizeR.cur;
      this.roomSize = 0.7 + size * 0.28;
      const damp = 0.4 - size * 0.2;
      for (let i = 0; i < 8; i++) {
        this.combL[i].feedback = this.roomSize; this.combR[i].feedback = this.roomSize;
        this.combL[i].damp1 = damp; this.combR[i].damp1 = damp;
        this.combL[i].damp2 = 1 - damp; this.combR[i].damp2 = 1 - damp;
      }
    }
  }

  // A patch load or a fresh start is not a 15 ms glide up from silence.
  snapRamps() {
    this.driveAmtR.snapToTarget(); this.chRateR.snapToTarget();
    this.chDepthR.snapToTarget(); this.verbSizeR.snapToTarget();
    this.updateCoefs(true);
  }

  shape(x) { return Math.tanh(x * this.driveK) * this.driveNorm; }

  // One channel of one segment through the 4x oversampled shaper: up to 2x,
  // up to 4x, shape every sample in one flat loop, then back down. The
  // per-sample form interleaved these six filters; each one still sees exactly
  // the same input sequence in the same order, so the result is bit-identical.
  driveSegment(o, src, at, m, dst) {
    const inb = this.dvIn, up1 = this.dvUp1, up2 = this.dvUp2, dn2 = this.dvDn2;
    const pre = this.drivePre;
    for (let i = 0; i < m; i++) inb[i] = pre * src[at + i];
    o.u1.interpolateBlock(inb, 0, m, up1);
    o.u2.interpolateBlock(up1, 0, 2 * m, up2);
    const color = o === this.osL ? this.driveColorL : this.driveColorR;
    const k = this.driveK, norm = this.driveNorm, n4 = 4 * m;
    for (let i = 0; i < n4; i++) up2[i] = color.shape(up2[i], k, norm);
    o.d2.decimateBlock(up2, 2 * m, dn2, 0);
    o.d1.decimateBlock(dn2, m, dst, 0);
  }

  process(L, R, n) {
    // Gate only when OFF; mix == 0 while ON must keep state accumulating.
    const driveGate = this.driveOff && this.driveWet.target === 0 && Math.abs(this.driveWet.cur) < 1e-6;
    const chorusGate = this.chorusOff && this.chWet.target === 0 && Math.abs(this.chWet.cur) < 1e-6;
    const delayGate = this.delayOff && this.dlWet.target === 0 && Math.abs(this.dlWet.cur) < 1e-6;
    const verbGate = this.verbOff && this.verbWet.target === 0 && Math.abs(this.verbWet.cur) < 1e-6;

    if (driveGate && !this.driveGated) {
      this.driveWet.snap(0); this.driveDry.snap(1);
      this.driveColorL.reset(); this.driveColorR.reset();
      for (const o of [this.osL, this.osR]) { o.u1.reset(); o.u2.reset(); o.d2.reset(); o.d1.reset(); }
    }
    if (chorusGate && !this.chorusGated) {
      this.chWet.snap(0); this.chDry.snap(1);
      this.chDl1.reset(); this.chDl2.reset();
    }
    if (delayGate && !this.delayGated) {
      this.dlWet.snap(0); this.dlDry.snap(1);
      this.dlLine[0].reset(); this.dlLine[1].reset(); this.dlDamp.reset();
    }
    if (verbGate && !this.verbGated) {
      this.verbWet.snap(0); this.verbDry.snap(1);
      for (const c of this.combL) c.reset();
      for (const c of this.combR) c.reset();
      for (const a of this.apL) a.reset();
      for (const a of this.apR) a.reset();
    }
    this.driveGated = driveGate; this.chorusGated = chorusGate;
    this.delayGated = delayGate; this.verbGated = verbGate;

    const sr = this.sr;
    const dlL = this.dlLine[0], dlR = this.dlLine[1];
    this.headroom.input.process(L, R, n);
    this.eq.process(L, R, n);

    // ---- OTT -> compressor (automatic level matching) ----
    // These stages precede the oversampled drive. Process the source arrays
    // first so both the drive's wet segment and latency-aligned dry path see
    // the dynamics-processed signal.
    const key = this.keyChannel >= 0 ? this.keyIn?.[this.keyChannel] : null;
    for (let i = 0; i < n; i++) {
      if (this.metering) this.meterEnergy[0] += 0.5 * (L[i] * L[i] + R[i] * R[i]);
      this.ott.processSample(L[i], R[i]);
      let l = this.ott.l, r = this.ott.r;
      if (this.metering) this.meterEnergy[1] += 0.5 * (l * l + r * r);
      const og = this.headroom.ott.gainFor(l, r);
      l *= og; r *= og;
      if (this.metering) this.meterEnergy[2] += 0.5 * (l * l + r * r);
      this.comp.processSample(l, r, key ? key[i] : 0);
      l = this.comp.l; r = this.comp.r;
      if (this.metering) {
        this.meterEnergy[3] += 0.5 * (l * l + r * r);
        this.meterReduction = Math.max(this.meterReduction, Math.max(0, -20 * Math.log10(Math.max(1e-9, this.comp.gain))));
      }
      const cg = this.headroom.comp.gainFor(l, r);
      L[i] = l * cg; R[i] = r * cg;
    }

    // The two channels carry the same signal whenever the voice ran its own
    // mono fast path (uni 1 or spread 0 — review finding B8), which is the
    // common case for a 303 patch. The shaper is memoryless per channel and an
    // FIR's state is its input history, so after one full mono block the two
    // oversamplers hold identical numbers and the right one can be skipped
    // outright. The first mono block still runs both, which is what makes the
    // histories converge; only from the second does the fast path engage.
    let monoIn = !this.driveGated;
    if (monoIn) {
      for (let i = 0; i < n; i++) if (L[i] !== R[i]) { monoIn = false; break; }
    }
    const monoDrive = monoIn && this.driveMonoReady;
    // A short block cannot refill the deepest history (24 base samples), so it
    // is never allowed to arm the fast path.
    this.driveMonoReady = monoIn && n >= 64;

    const wetLB = this.wetL, wetRB = this.wetR;
    let pos = 0;
    while (pos < n) {
      // One coefficient chunk at a time, so the shaper's gains still step
      // exactly where the per-sample loop stepped them.
      if (this.chunkPos === 0) this.updateCoefs(false);
      const m = Math.min(FX_COEF_CHUNK - this.chunkPos, n - pos);
      this.chunkPos += m;
      if (this.chunkPos >= FX_COEF_CHUNK) this.chunkPos = 0;

      if (!this.driveGated) {
        this.driveSegment(this.osL, L, pos, m, wetLB);
        if (monoDrive) {
          wetRB.set(wetLB.subarray(0, m));
        } else {
          this.driveSegment(this.osR, R, pos, m, wetRB);
        }
      }

      for (let i = pos; i < pos + m; i++) {
        let l = L[i], r = R[i];

        // ---- drive (4x oversampled tanh waveshaper) ----
        // The bypass path always runs through the same DRIVE_LATENCY delay, so
        // the dry/wet mix stays time-aligned with the shaper's FIR group delay
        // and the reported chain latency is constant whether drive is on or off.
        this.dryL.write(l); this.dryR.write(r);
        const dryLv = this.dryL.read(DRIVE_LATENCY + 1);
        const dryRv = this.dryR.read(DRIVE_LATENCY + 1);
        if (!this.driveGated) {
          const wet = this.driveWet.next(), dry = this.driveDry.next();
          l = dry * dryLv + wet * this.driveColorL.processTone(wetLB[i - pos]);
          r = dry * dryRv + wet * this.driveColorR.processTone(wetRB[i - pos]);
        } else {
          l = dryLv; r = dryRv;
        }

        const driveGuard = this.headroom.drive.gainFor(l, r);
        l *= driveGuard; r *= driveGuard;

        // ---- chorus (two modulated taps, stereo) ----
        if (!this.chorusGated) {
          this.chPhase += this.chRate / sr;
          if (this.chPhase >= 1) this.chPhase -= 1;
          const lfo = Math.sin(2 * Math.PI * this.chPhase);
          const depth = 0.0008 + this.chDepth * 0.0045;
          const mono = 0.5 * (l + r);
          this.chDl1.write(mono); this.chDl2.write(mono);
          const c1 = this.chDl1.readH((0.012 + depth * lfo) * sr);
          const c2 = this.chDl2.readH((0.017 - depth * 0.8 * lfo) * sr);
          const wet = this.chWet.next(), dry = this.chDry.next();
          l = dry * l + wet * c1;
          r = dry * r + wet * c2;
        }
        const chorusGuard = this.headroom.chorus.gainFor(l, r);
        l *= chorusGuard; r *= chorusGuard;

        // ---- ping-pong delay ----
        if (!this.delayGated) {
          const dt = this.dlTime.next() * sr;
          const fb = this.dlFb.next();
          const dLv = dlL.readH(dt);
          const dRv = dlR.readH(dt);
          if (this.echoMetering) this.echoEnergy[0] += 0.5 * (l * l + r * r);
          const mono = 0.5 * (l + r);
          const feedbackL = mono + fb * dRv;
          const feedbackR = this.dlDamp.process(fb * dLv);
          const feedbackGain = this.delayFeedbackGuard.gainFor(feedbackL, feedbackR);
          dlL.write(feedbackL * feedbackGain);
          dlR.write(feedbackR * feedbackGain);
          const wet = this.dlWet.next(), dry = this.dlDry.next();
          if (this.echoMetering) {
            this.echoEnergy[1] += (wet * dLv) * (wet * dLv);
            this.echoEnergy[2] += (wet * dRv) * (wet * dRv);
          }
          l = dry * l + wet * dLv;
          r = dry * r + wet * dRv;
        }
        const delayGuard = this.headroom.delay.gainFor(l, r);
        l *= delayGuard; r *= delayGuard;

        // ---- reverb (Freeverb) ----
        if (!this.verbGated) {
          const input = (l + r) * 0.015; // fixed input gain (Freeverb convention)
          let outL = 0, outR = 0;
          for (let c = 0; c < 8; c++) { outL += this.combL[c].process(input); outR += this.combR[c].process(input); }
          for (let a = 0; a < 4; a++) { outL = this.apL[a].process(outL); outR = this.apR[a].process(outR); }
          const wet = this.verbWet.next(), dry = this.verbDry.next();
          if (this.reverbMetering) {
            const wetL = wet * outL, wetR = wet * outR;
            this.reverbEnergy[0] += wetL * wetL; this.reverbEnergy[1] += wetR * wetR; this.reverbEnergy[2] += wetL * wetR;
          }
          l = dry * l + wet * outL;
          r = dry * r + wet * outR;
        }
        const reverbGuard = this.headroom.reverb.gainFor(l, r);
        l *= reverbGuard; r *= reverbGuard;

        // ---- master gain, DC block, lookahead limiter ----
        const g = this.masterGain.next();
        l = this.dcL.process(l * g);
        r = this.dcR.process(r * g);
        this.lim.process(l, r);
        L[i] = this.lim.outL;
        R[i] = this.lim.outR;
      }
      if (this.metering) this.meterSamples += m;
      if (this.echoMetering) this.echoSamples += m;
      if (this.reverbMetering) this.reverbSamples += m;
      pos += m;
    }

    // Keep the skipped oversampler in step, so the moment the channels diverge
    // its history is what it would have been had it run all along.
    if (monoDrive) {
      this.driveColorR.copyShapeFrom(this.driveColorL);
      this.osR.u1.copyStateFrom(this.osL.u1); this.osR.u2.copyStateFrom(this.osL.u2);
      this.osR.d2.copyStateFrom(this.osL.d2); this.osR.d1.copyStateFrom(this.osL.d1);
    }
  }
}

class BassProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    subSquareTable(); // build the sub-square table now, not on the audio thread
    const opts = (options && options.processorOptions) || {};
    this.p = Object.create(null);
    this.tables = [];
    // Timeline note events, sorted by frame (note-offs first within a frame).
    this.evq = [];
    this.evHead = 0;
    this.bpm = 120;
    this.anchor = 0; // context frame of the timeline's beat zero
    this.songPos = 0; // frames since beat zero, for the bar-locked LFO

    // ---- voice ----
    this.gate = false;
    this.acc = false;
    this.vel = PLAIN_VEL;
    this.semi = 0; // slid/current semitone offset from ROOT_MIDI
    this.semiTarget = 0;
    this.fenvT = 1e9; // samples since (non-slid) trigger
    this.ampStage = 0; // 0 idle · 1 att · 2 dec/sus · 3 rel
    this.ampLevel = 0; this.ampSm = 0;
    this.held = []; // keyboard stack, last = current

    // osc state
    this.phases = new Float64Array(MAXUNI);
    this.incs = new Float64Array(MAXUNI);
    this.gl = new Float32Array(MAXUNI);
    this.gr = new Float32Array(MAXUNI);
    this.uni = 1; this.off0 = 0; this.off1 = 0; this.off0b = 0; this.off1b = 0;
    this.mipBlend = 0; this.ft = 0; this.oscGain = 0;
    this.mask = 0; this.size = 0; this.data = null; this.posSm = -1;
    this.subPhase = 0; this.subIncPrev = -1;
    this.oscMono = true;
    // previous sub-block osc targets — renderOsc ramps from these
    this.pIncs = new Float64Array(MAXUNI);
    this.pGl = new Float32Array(MAXUNI);
    this.pGr = new Float32Array(MAXUNI);
    this.pFt = 0; this.pOff0 = -1; this.pUni = 0; this.havePrev = false;
    // filter state
    this.svf = new Float64Array(8);
    this.cutSm = 0; this.curCut = 0;
    this.cutPrev = -1; // previous chunk's smoothed base cutoff
    this.cutSub = new Float64Array(8); // per-sub-block cutoff incl. envelope
    this.nSub = 0;
    this.osL = makeDriveOs(); this.osR = makeDriveOs(); this.adaaMix = 0;
    this.ftype = 1; this.twoPole = true;
    this.k1 = 0; this.k2 = 0;
    this.accSm = 0; // ramped accent amount (0..1)
    this.gainSm = -1; // slewed amp gain (-1 = new note from silence)
    this.lfoClock = new LfoClock();
    this.shVal = 0; this.shPhase = -1;
    this.rngState = 0x9e3779b9; // seeded xorshift — renders are reproducible
    this.dcR = Math.pow(DC_R, 48000 / sampleRate);
    this.dcxL = 0; this.dcxR = 0; this.dcyL = 0; this.dcyR = 0;

    this.tmpL = new Float32Array(128); this.tmpR = new Float32Array(128);
    this.fL = new Float32Array(128); this.fR = new Float32Array(128);
    this.vizCount = 0;
    // Master FX rack. Used to be a graph of native WebAudio nodes on the main
    // thread; it now runs the plugin's algorithm here so both products sound
    // the same and the chain is testable offline.
    this.fx = new BassFx(sampleRate);
    this.fxDirty = true; this.fxSnap = true;
    this.monoR = null; // scratch right channel for a mono output
    if (opts.params) this.applyParams(opts.params);
    if (Array.isArray(opts.tables)) this.setTables(opts.tables);
    if (Number.isFinite(opts.bpm)) this.bpm = opts.bpm;
    if (Number.isFinite(opts.anchor)) this.anchor = opts.anchor;
    if (opts.events) this.queueEvents(opts.events);
    this.port.postMessage({ t: 'latency', n: this.fx.latencySamples });
    this.port.postMessage({ t: 'ready' });
    // Timeline automation lanes (devices/param-automation-worklet.js).
    this.pauto = globalThis.FableParamAutomation ? new globalThis.FableParamAutomation() : null;
    this.pautoSet = (k, v) => this.onMsg({ t: 'p', k, v });
    this.port.onmessage = (e) => this.onMsg(e.data);
  }

  applyParams(params) {
    for (const k in params) {
      const v = params[k];
      if (Number.isFinite(v)) this.p[k] = v;
    }
    this.fxDirty = true;
    this.fxSnap = true; // a patch load is not a 15 ms glide
  }

  setTables(list) {
    this.tables = list.map((x) => ({
      frames: x.frames, mips: x.mips, size: x.size, mask: x.size - 1,
      data: ArrayBuffer.isView(x.data) ? x.data : new Float32Array(x.buf),
    }));
    this.havePrev = false; // new offsets — nothing to ramp from
  }

  // ev: flat [frame, on, pitch, velocity] quadruples (any order).
  queueEvents(ev) {
    const pending = this.evq.slice(this.evHead);
    for (let i = 0; i + 3 < ev.length; i += 4) {
      pending.push({ f: ev[i], on: ev[i + 1] > 0.5, pitch: ev[i + 2] | 0, vel: ev[i + 3] });
    }
    pending.sort((a, b) => a.f - b.f || (a.on ? 1 : 0) - (b.on ? 1 : 0));
    this.evq = pending;
    this.evHead = 0;
  }

  applyEvent(e) {
    if (e.on) this.keyOn(e.pitch - ROOT_MIDI, e.vel);
    else this.keyOff(e.pitch - ROOT_MIDI);
  }

  onMsg(d) {
    if (this.pauto && this.pauto.onMsg(d, this.port)) return;
    switch (d.t) {
      case 'dynamics':
        this.fx.metering = !!d.on; this.fx.meterEnergy.fill(0); this.fx.meterSamples = 0; this.fx.meterReduction = 0;
        break;
      case 'echo':
        this.fx.echoMetering = !!d.on; this.fx.echoEnergy.fill(0); this.fx.echoSamples = 0;
        break;
      case 'reverb':
        this.fx.reverbMetering = !!d.on; this.fx.reverbEnergy.fill(0); this.fx.reverbSamples = 0;
        break;
      case 'init':
        this.applyParams(d.params);
        break;
      case 'p':
        if (Number.isFinite(d.v)) {
          this.p[d.k] = d.v;
          if (d.k.startsWith('fx.') || d.k === 'master.volume') this.fxDirty = true;
        }
        break;
      case 'tables':
        this.setTables(d.list);
        break;
      case 'evs':
        this.queueEvents(d.ev);
        break;
      case 'evclear':
        this.evq = []; this.evHead = 0;
        this.held.length = 0;
        this.release();
        break;
      case 'noteon': this.keyOn((d.pitch | 0) - ROOT_MIDI, d.vel); break;
      case 'noteoff': this.keyOff((d.pitch | 0) - ROOT_MIDI); break;
      case 'tempo':
        if (Number.isFinite(d.bpm)) this.bpm = d.bpm;
        if (Number.isFinite(d.anchor)) this.anchor = d.anchor;
        break;
      case 'panic':
        this.kill(); this.held.length = 0;
        this.evq = []; this.evHead = 0;
        this.fx.reset();
        break;
    }
  }

  noteOn(semi, acc, vel) {
    this.gate = true;
    this.acc = !!acc;
    this.vel = Number.isFinite(vel) ? Math.max(0, Math.min(1, vel)) : (acc ? ACCENT_VEL : PLAIN_VEL);
    this.semi = semi;
    this.semiTarget = semi;
    this.fenvT = 0;
    // A note from silence starts at its own gain. A note over a still-sounding
    // voice ramps from the old gain — an accent→plain step would otherwise
    // halve the running waveform in one sample (click).
    if (this.ampStage === 0) this.gainSm = -1;
    this.ampStage = 1;
    this.accSm = this.acc ? 1 : 0; // a fresh note starts at its accent level
  }

  glideTo(semi, acc) {
    this.semiTarget = semi;
    if (acc) this.acc = true;
    this.gate = true;
  }

  release() {
    this.gate = false;
    if (this.ampStage !== 0) this.ampStage = 3;
  }

  // Deterministic xorshift32 — replaces Math.random() in the render path so an
  // offline render of the same patch is bit-reproducible.
  rand() {
    let s = this.rngState;
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    this.rngState = s;
    return (s >>> 8) * (1 / 16777216);
  }

  // Full reset: every recursive state cleared, the way BassEngine::prepare does
  // it. Leaving phases, the DC blocker or the ramp history behind makes the
  // first block after a panic depend on what played before it.
  kill() {
    this.gate = false; this.acc = false; this.ampStage = 0; this.ampLevel = 0; this.ampSm = 0;
    this.fenvT = 1e9;
    this.svf.fill(0); resetDriveOs(this.osL); resetDriveOs(this.osR); this.adaaMix = 0;
    this.posSm = -1; this.cutSm = 0; this.cutPrev = -1;
    this.accSm = 0; this.gainSm = -1;
    this.phases.fill(0);
    this.subPhase = 0; this.subIncPrev = -1;
    this.havePrev = false; this.pOff0 = -1; this.pUni = 0;
    this.dcxL = 0; this.dcxR = 0; this.dcyL = 0; this.dcyR = 0;
    this.lfoClock.reset();
    this.shVal = 0; this.shPhase = -1;
    this.rngState = 0x9e3779b9;
  }

  // A note over a held one slides into it; a note at or above the accent
  // velocity is an accent, on a fresh note and on a slide alike.
  keyOn(semi, vel) {
    const v = Number.isFinite(vel) ? Math.max(0, Math.min(1, vel)) : PLAIN_VEL;
    const thr = Number.isFinite(this.p['acc.vel']) ? this.p['acc.vel'] : 100;
    const acc = v * 127 >= thr - 1e-6;
    const i = this.held.indexOf(semi);
    if (i >= 0) this.held.splice(i, 1);
    const legato = this.held.length > 0 && this.gate;
    this.held.push(semi);
    if (legato) { this.semiTarget = semi; this.acc = acc; this.gate = true; }
    else this.noteOn(semi, acc, v);
  }

  keyOff(semi) {
    const i = this.held.indexOf(semi);
    if (i >= 0) this.held.splice(i, 1);
    if (this.held.length === 0) {
      this.release();
    } else if (this.semiTarget !== this.held[this.held.length - 1]) {
      this.glideTo(this.held[this.held.length - 1], false);
    }
  }


  // ---------- osc setup / render (per 16-sample sub-block) ----------
  setupOsc(noteAbs, n) {
    const p = this.p;
    const table = this.tables[p['osc.table'] | 0];
    if (!table) return false;
    const freq = 440 * Math.pow(2, (noteAbs - 69) / 12);
    if (!(freq > 0 && freq <= sampleRate * 0.45)) return false;

    let level = Math.min(1.2, Math.max(0, p['osc.level']));
    level *= level;
    if (!(level >= 1e-5)) return false;

    const uni = Math.max(1, Math.min(MAXUNI, p['osc.unison'] | 0));
    const det = p['osc.detune'];
    const spr = Math.min(1, Math.max(0, p['osc.spread']));

    const pos = Math.min(1, Math.max(0, p['osc.pos']));
    if (this.posSm < 0) this.posSm = pos;
    this.posSm += (pos - this.posSm) * smoothCoef(n, POS_TAU * sampleRate);
    const posF = this.posSm * (table.frames - 1);
    const f0 = posF | 0;
    const f1 = Math.min(table.frames - 1, f0 + 1);
    this.ft = posF - f0;

    const cps = freq / sampleRate;
    const maxRatio = Math.pow(2, (Math.abs(det) * 50) / 1200);
    const W = 0.07;
    const mipF = Math.log2((cps * maxRatio * 1024) / 0.475);
    let mip = 0, mipBlend = 0;
    if (mipF > 0) {
      mip = Math.min(table.mips - 1, Math.ceil(mipF));
      const over = mipF - (mip - 1);
      if (over < W) mipBlend = 1 - over / W;
    }
    const fineMip = mip > 0 ? mip - 1 : 0;

    this.off0 = (f0 * table.mips + mip) * table.size;
    this.off1 = (f1 * table.mips + mip) * table.size;
    this.off0b = (f0 * table.mips + fineMip) * table.size;
    this.off1b = (f1 * table.mips + fineMip) * table.size;
    this.mipBlend = mipBlend;
    this.data = table.data;
    this.mask = table.mask;
    this.size = table.size;
    this.uni = uni;
    // With one voice, or no spread, every pan lands at centre and the two
    // channels carry the same signal. Say so exactly (cos and sin of pi/4
    // differ by one ulp) so the filter can take its mono path.
    const mono = uni === 1 || spr <= 0;
    this.oscMono = mono;

    for (let u = 0; u < uni; u++) {
      const sprd = uni > 1 ? (u / (uni - 1)) * 2 - 1 : 0;
      const cents = sprd * det * 50;
      const ratio = Math.pow(2, cents / 1200);
      this.incs[u] = cps * ratio * table.size;
      if (mono) {
        this.gl[u] = Math.SQRT1_2;
        this.gr[u] = Math.SQRT1_2;
      } else {
        const pan = Math.max(-1, Math.min(1, sprd * spr));
        const a = ((pan + 1) * Math.PI) / 4;
        this.gl[u] = Math.cos(a);
        this.gr[u] = Math.sin(a);
      }
    }
    this.oscGain = (level * 0.32) / Math.sqrt(uni);
    return true;
  }

  // Increments, morph fraction and pan gains ramp from the previous sub-block's
  // targets across this one (staircase-free slides and pos sweeps), and the
  // table read is cubic Hermite. Same scheme as BassEngine::renderOsc: the ramp
  // is only valid while the voice count and the table offsets are unchanged.
  renderOsc(tmpL, tmpR, off, n) {
    const data = this.data, mask = this.mask, size = this.size, g = this.oscGain;
    const off0 = this.off0, off1 = this.off1;
    const blend = this.mipBlend;
    const invN = 1 / n;
    const rp = this.havePrev && this.pUni === this.uni;
    const ft1 = this.ft;
    const ft0 = rp && this.pOff0 === off0 ? this.pFt : ft1;
    const dFt = (ft1 - ft0) * invN;
    for (let u = 0; u < this.uni; u++) {
      let ph = this.phases[u];
      const inc1 = this.incs[u];
      const inc0 = rp ? this.pIncs[u] : inc1;
      const dInc = (inc1 - inc0) * invN;
      const gl1 = this.gl[u] * g, gr1 = this.gr[u] * g;
      const gl0 = rp ? this.pGl[u] : gl1, gr0 = rp ? this.pGr[u] : gr1;
      const dGl = (gl1 - gl0) * invN, dGr = (gr1 - gr0) * invN;
      if (blend < 0.001) {
        for (let i = 0; i < n; i++) {
          const idx = ph | 0;
          const frac = ph - idx;
          const im1 = (idx - 1) & mask, i2 = (idx + 1) & mask, i3 = (idx + 2) & mask;
          const s0 = rdH(data, off0, im1, idx, i2, i3, frac);
          const s1 = rdH(data, off1, im1, idx, i2, i3, frac);
          const s = s0 + (ft0 + dFt * i) * (s1 - s0);
          tmpL[off + i] += s * (gl0 + dGl * i);
          tmpR[off + i] += s * (gr0 + dGr * i);
          ph += inc0 + dInc * i;
          if (ph >= size) ph -= size;
        }
      } else {
        const off0b = this.off0b, off1b = this.off1b;
        for (let i = 0; i < n; i++) {
          const idx = ph | 0;
          const frac = ph - idx;
          const im1 = (idx - 1) & mask, i2 = (idx + 1) & mask, i3 = (idx + 2) & mask;
          const ftN = ft0 + dFt * i;
          const sc0 = rdH(data, off0, im1, idx, i2, i3, frac);
          const sc1 = rdH(data, off1, im1, idx, i2, i3, frac);
          const sc = sc0 + ftN * (sc1 - sc0);
          const sf0 = rdH(data, off0b, im1, idx, i2, i3, frac);
          const sf1 = rdH(data, off1b, im1, idx, i2, i3, frac);
          const sf = sf0 + ftN * (sf1 - sf0);
          const s = sc + blend * (sf - sc);
          tmpL[off + i] += s * (gl0 + dGl * i);
          tmpR[off + i] += s * (gr0 + dGr * i);
          ph += inc0 + dInc * i;
          if (ph >= size) ph -= size;
        }
      }
      this.phases[u] = ph;
      this.pIncs[u] = inc1;
      this.pGl[u] = gl1; this.pGr[u] = gr1;
    }
    this.pFt = ft1; this.pOff0 = off0; this.pUni = this.uni;
    this.havePrev = true;
  }

  renderSub(tmpL, tmpR, off, n, noteRootAbs) {
    const p = this.p;
    let level = Math.min(1, Math.max(0, p['sub.level']));
    level *= level;
    const gain = level * 0.35;
    if (gain < 1e-6) return;
    const oct = Math.max(-2, Math.min(-1, p['sub.oct'] | 0 || -1));
    const freq = 440 * Math.pow(2, (noteRootAbs + 12 * oct - 69) / 12);
    if (!(freq > 4 && freq <= sampleRate * 0.45)) { this.subIncPrev = -1; return; }
    // Ramp the increment across the sub-block, so a slide moves the sub
    // continuously instead of in 16-sample steps.
    const inc1 = freq / sampleRate;
    const inc0 = this.subIncPrev > 0 ? this.subIncPrev : inc1;
    const dInc = (inc1 - inc0) / n;
    const square = (p['sub.shape'] | 0) === 1;
    let ph = this.subPhase;
    if (square) {
      // Band-limited table read (mip chosen from the larger chunk increment).
      const tbl = subSquareTable();
      const mip = subSquareMip(SUBSQ_MIP, Math.max(inc0, inc1));
      for (let i = 0; i < n; i++) {
        const inc = inc0 + dInc * i;
        const v = subSquareRead(tbl, mip, ph) * gain * 0.8;
        tmpL[off + i] += v; tmpR[off + i] += v;
        ph += inc; if (ph >= 1) ph -= 1;
      }
    } else {
      for (let i = 0; i < n; i++) {
        const v = Math.sin(ph * 2 * Math.PI) * gain * 1.2;
        tmpL[off + i] += v; tmpR[off + i] += v;
        ph += inc0 + dInc * i; if (ph >= 1) ph -= 1;
      }
    }
    this.subPhase = ph;
    this.subIncPrev = inc1;
  }

  // ---------- LFO (bar-locked to the timeline's beat zero) ----------
  advanceLfoClock() {
    const p = this.p;
    const bpm = Math.max(60, Math.min(200, this.bpm || 120));
    const cpb = LFO_DIV_F[p['lfo.rate'] | 0] || 2;
    return this.lfoClock.update(this.songPos / sampleRate, (bpm / 60) * cpb);
  }

  lfoValue() {
    const p = this.p;
    const cycles = this.advanceLfoClock();
    const phase = cycles - Math.floor(cycles);
    const shape = p['lfo.shape'] | 0;
    switch (shape) {
      case 1: return 1 - 4 * Math.abs(phase - 0.5); // tri
      case 2: return 1 - 2 * phase; // saw (falling)
      case 3: return phase < 0.5 ? 1 : -1; // sqr
      case 4: { // s&h
        const step = Math.floor(cycles);
        if (step !== this.shPhase) { this.shPhase = step; this.shVal = this.rand() * 2 - 1; }
        return this.shVal;
      }
      default: return Math.sin(phase * 2 * Math.PI);
    }
  }

  // ---------- filter ----------
  setupFilter(noteAbs, n) {
    const p = this.p;
    const accAmt = Math.min(1, Math.max(0, p['acc.amt']));
    const accBoost = accAmt * this.accSm;

    // filter AD env — accent raises the peak and shortens the decay
    const att = Math.max(1, p['fenv.att'] * sampleRate);
    const dec = Math.max(1, p['fenv.dec'] * sampleRate * (1 - ACC_DEC_SHORTEN * accBoost));
    let env;
    if (this.fenvT < att) env = this.fenvT / att;
    else env = Math.exp(-4.5 * (this.fenvT - att) / dec);
    env *= 1 + accBoost;
    this.fenvVal = env;

    const lfo = this.lfoValue() * Math.min(1, Math.max(0, p['lfo.depth']));
    const track = Math.min(1, Math.max(0, p['flt.track']));
    const key = ((noteAbs - KEYTRACK_REF) / 12) * track;
    const oct = lfo * LFO_OCT + key;

    // The knob / key / LFO part of the cutoff is smoothed per chunk (zipper
    // protection). The envelope part is NOT: it is evaluated every FLT_SUB
    // samples and applied after the smoother, so the accent snap keeps its
    // attack. The ramp end for sub-block j is the envelope at that sub-block's
    // end, so the cutoff sweep is not a chunk late.
    let base = p['flt.cut'] * Math.pow(2, oct);
    if (!Number.isFinite(base) || base <= 0) base = 20;
    if (this.cutSm <= 0) this.cutSm = base;
    this.cutSm += (base - this.cutSm) * smoothCoef(n, CUT_TAU * sampleRate);
    const b0 = this.cutPrev > 0 ? this.cutPrev : this.cutSm;
    const envOct = p['flt.env'] * FENV_OCT;
    this.nSub = 0;
    for (let at = 0; at < n && this.nSub < this.cutSub.length; at += FLT_SUB) {
      const e = Math.min(FLT_SUB, n - at) + at;
      const t = this.fenvT + e;
      let ev = t < att ? t / att : Math.exp(-4.5 * (t - att) / dec);
      ev *= 1 + accBoost;
      let fc = (b0 + (this.cutSm - b0) * (e / n)) * Math.pow(2, envOct * ev);
      if (!Number.isFinite(fc)) fc = 20;
      this.cutSub[this.nSub++] = Math.min(sampleRate * 0.45, Math.max(20, fc));
    }
    this.cutPrev = this.cutSm;
    this.curCut = this.nSub > 0 ? this.cutSub[this.nSub - 1] : this.cutSm;
    const res = Math.min(0.999, Math.max(0, p['flt.res']));

    const ftype = p['flt.type'] | 0;
    if (ftype !== this.ftype) {
      // A type switch changes what the states mean — the LP24 second stage in
      // particular keeps ringing into the new response. Start clean.
      this.svf.fill(0);
      resetDriveOs(this.osL); resetDriveOs(this.osR); this.adaaMix = 0;
    }
    this.ftype = ftype;
    this.twoPole = ftype === 1;
    if (this.twoPole) {
      // Finding B3. LP24 used to cascade two stages with the SAME k, so the
      // peak at fc was (1/k)^2 — two coincident resonances — and with
      // k = 2 - 1.93*res bottoming out at 0.071 the filter reached only
      // Q ~= 14 and never rang, while the bottom quarter of the knob did
      // nothing at all. The resonance now lives in stage 1 alone and stage 2
      // stays critically damped. k1*k2 = (2 - 1.93*resT)^2, so the peak
      // magnitude at fc is the old one to within 0.03 dB up to res = 0.9 and
      // existing patches keep their timbre; above that the single resonant
      // stage's Q climbs from 14 to ~470 and the filter sings.
      // Lockstep with juce/source/dsp/Engine.cpp:751-754.
      const r2 = res * res;
      const resT = res + 0.0035 * r2 * r2;
      const kk = 2 - 1.93 * resT;
      this.k1 = Math.max(0.002, 0.5 * kk * kk);
      this.k2 = 2;
    } else {
      this.k1 = 2 - 1.93 * res; // SVF coefficients are per sub-block, in runFilter
      this.k2 = this.k1;
    }
  }

  // One Cytomic SVF stage over buf[at, at+m). mode 0 = LP, 2 = BP, 3 = notch,
  // anything else = HP. The type test is hoisted out of the sample loop.
  svfStage(buf, at, m, o1, a1, a2, a3, k1, mode) {
    const F = this.svf;
    let ic1 = F[o1], ic2 = F[o1 + 1];
    const end = at + m;
    if (mode === 0) {
      for (let i = at; i < end; i++) {
        const x = buf[i];
        const v3 = x - ic2;
        const v1 = a1 * ic1 + a2 * v3;
        const v2 = ic2 + a2 * ic1 + a3 * v3;
        ic1 = 2 * v1 - ic1; ic2 = 2 * v2 - ic2;
        buf[i] = v2;
      }
    } else if (mode === 2) {
      for (let i = at; i < end; i++) {
        const x = buf[i];
        const v3 = x - ic2;
        const v1 = a1 * ic1 + a2 * v3;
        const v2 = ic2 + a2 * ic1 + a3 * v3;
        ic1 = 2 * v1 - ic1; ic2 = 2 * v2 - ic2;
        buf[i] = k1 * v1;
      }
    } else if (mode === 3) {
      for (let i = at; i < end; i++) {
        const x = buf[i];
        const v3 = x - ic2;
        const v1 = a1 * ic1 + a2 * v3;
        const v2 = ic2 + a2 * ic1 + a3 * v3;
        ic1 = 2 * v1 - ic1; ic2 = 2 * v2 - ic2;
        buf[i] = x - k1 * v1 - v2;
      }
    } else {
      for (let i = at; i < end; i++) {
        const x = buf[i];
        const v3 = x - ic2;
        const v1 = a1 * ic1 + a2 * v3;
        const v2 = ic2 + a2 * ic1 + a3 * v3;
        ic1 = 2 * v1 - ic1; ic2 = 2 * v2 - ic2;
        buf[i] = x - k1 * v1;
      }
    }
    F[o1] = ic1; F[o1 + 1] = ic2;
  }

  // ADAA lcosh drive, then the SVF. `mono` says the two input channels are
  // identical (uni 1 or spread 0): the right channel is then a copy, which
  // halves the exp/log1p count. The cutoff ramps from the previous chunk's
  // value and the coefficients are recomputed every FLT_SUB samples — holding
  // one cutoff per chunk puts an audible step on every filter-env sweep.
  runFilter(inL, inR, outL, outR, drive, n, mono) {
    // Drive: 2x oversampled ADAA tanh. The stage is in the path only while the
    // saturator is active; at drive 0 it is a bit-exact copy.
    const adaaTarget = Math.max(0, Math.min(1, drive / ADAA_FADE_WIDTH));
    const adaaStart = this.adaaMix;
    const active = adaaTarget > 0 || adaaStart > 1e-6;
    const dg = active ? 1 + drive * 7 : 1;
    const dcomp = active ? 1 / Math.pow(dg, 0.55) : 1;
    const kF = dcomp / dg;
    const osL = this.osL, osR = this.osR;
    if (active) {
      osL.F = kF * lcosh(dg * osL.xp);
      if (!mono) osR.F = kF * lcosh(dg * osR.xp);
    }
    const wStep = 1 / (DRIVE_OS_RAMP_SEC * sampleRate);
    for (let i = 0; i < n; i++) {
      const m = adaaStart + (adaaTarget - adaaStart) * ((i + 1) / n);
      outL[i] = driveOsStep(osL, inL[i], active, active, m, wStep, dg, dcomp, kF);
      if (!mono) outR[i] = driveOsStep(osR, inR[i], active, active, m, wStep, dg, dcomp, kF);
    }
    // A mono chunk leaves the right history equal to the left one.
    if (mono) copyDriveOs(osR, osL);
    this.adaaMix = active ? adaaTarget : 0;

    const ftype = this.ftype;
    const mode = ftype === 1 ? 0 : ftype;
    const k1 = this.k1, k2 = this.k2;
    const F = this.svf;
    const chans = mono ? 1 : 2;
    for (let at = 0; at < n; at += FLT_SUB) {
      const m = Math.min(FLT_SUB, n - at);
      const cut = this.cutSub[Math.min((at / FLT_SUB) | 0, this.nSub - 1)];
      const gC = Math.tan((Math.PI * cut) / sampleRate);
      const a1 = 1 / (1 + gC * (gC + k1));
      const a2 = gC * a1, a3 = gC * a2;
      for (let ch = 0; ch < chans; ch++) {
        this.svfStage(ch === 0 ? outL : outR, at, m, ch * 2, a1, a2, a3, k1, mode);
      }
      if (this.twoPole) {
        // Stage 2 carries no resonance (B3), so it needs its own coefficients.
        const b1 = 1 / (1 + gC * (gC + k2));
        const b2 = gC * b1, b3 = gC * b2;
        for (let ch = 0; ch < chans; ch++) {
          this.svfStage(ch === 0 ? outL : outR, at, m, 4 + ch * 2, b1, b2, b3, k2, 0);
        }
      }
    }
    if (mono) {
      // Keep the unused channel's state in step, so a later switch to a spread
      // patch starts from the same place instead of stale numbers.
      outR.set(outL.subarray(0, n));
      F[2] = F[0]; F[3] = F[1]; F[6] = F[4]; F[7] = F[5];
    }
  }

  // ---------- render ----------
  // After the amp closes, the DC blocker still holds the negated DC offset of
  // the last note. Let it ring out on silent input; cutting it at voice end clicked.
  dcTail(L, R, off, n) {
    this.ampSm = 0;
    if (Math.abs(this.dcyL) + Math.abs(this.dcyR) + Math.abs(this.dcxL) + Math.abs(this.dcxR) < 1e-9) {
      this.dcxL = this.dcxR = this.dcyL = this.dcyR = 0;
      return;
    }
    for (let i = 0; i < n; i++) {
      this.dcyL = this.dcR * this.dcyL - this.dcxL; this.dcxL = 0;
      this.dcyR = this.dcR * this.dcyR - this.dcxR; this.dcxR = 0;
      L[off + i] += this.dcyL;
      R[off + i] += this.dcyR;
    }
  }

  renderVoice(L, R, off, n) {
    const p = this.p;
    // The voice sounds until the slewed amp level is silent too: a release
    // shorter than AMP_SLEW reaches ampStage 0 while ampSm still lags.
    if (this.ampStage === 0 && !this.gate && this.ampSm < 1e-4) {
      // still advance the LFO clock
      this.dcTail(L, R, off, n);
      return;
    }
    const tmpL = this.tmpL, tmpR = this.tmpR;
    tmpL.fill(0, 0, n); tmpR.fill(0, 0, n);

    // glide: one-pole approach of semiTarget with time-constant slide.time
    const tau = Math.max(0.005, p['slide.time']) * sampleRate;

    let mono = true;
    for (let at = 0; at < n; at += 16) {
      const count = Math.min(16, n - at);
      if (this.semi !== this.semiTarget) {
        const glide = 1 - Math.exp(-count / tau);
        this.semi += (this.semiTarget - this.semi) * glide;
        if (Math.abs(this.semiTarget - this.semi) < 0.001) this.semi = this.semiTarget;
      }
      const noteRootAbs = ROOT_MIDI + this.semi;
      const noteAbs = noteRootAbs + p['osc.tune'] + p['osc.fine'] / 100;
      if (this.setupOsc(noteAbs, count)) {
        if (!this.oscMono) mono = false;
        this.renderOsc(tmpL, tmpR, at, count);
      } else {
        this.havePrev = false; // no ramp across a silent gap
      }
      this.renderSub(tmpL, tmpR, at, count, noteRootAbs);
    }

    // Accent: an accent that arrives on a running voice (a slide into an
    // accented step) ramps in, instead of stepping the amp gain by up to
    // +3.5 dB and the filter-env peak at the same chunk boundary. A fresh
    // note-on snaps accSm in noteOn(), so a plain accented step is unchanged.
    const acc0 = this.accSm;
    this.accSm += ((this.acc ? 1 : 0) - this.accSm) * smoothCoef(n, ACC_TAU * sampleRate);
    if (Math.abs(this.accSm - (this.acc ? 1 : 0)) < 1e-4) this.accSm = this.acc ? 1 : 0;

    this.setupFilter(ROOT_MIDI + this.semi + p['osc.tune'], n);
    this.runFilter(tmpL, tmpR, this.fL, this.fR, p['flt.drive'], n, mono);
    this.fenvT += n;

    // amp ADSR + accent gain
    const attK = 1 / Math.max(1, p['aenv.att'] * sampleRate);
    const sus = Math.min(1, Math.max(0, p['aenv.sus']));
    const decK = 1 - Math.exp(-4.5 / Math.max(1, p['aenv.dec'] * sampleRate));
    const relK = 1 - Math.exp(-4.5 / Math.max(1, p['aenv.rel'] * sampleRate));
    const accAmt = Math.min(1, Math.max(0, p['acc.amt']));
    const gBase = this.vel * 0.9;
    const gAcc = gBase * accAmt * ACC_GAIN;
    const g1 = gBase + gAcc * this.accSm;
    if (this.gainSm < 0) this.gainSm = gBase + gAcc * acc0;
    const gainK = 1 - Math.exp(-1 / (GAIN_SLEW * sampleRate));
    const dcR = this.dcR;
    const slewK = 1 - Math.exp(-1 / (AMP_SLEW * sampleRate));

    for (let i = 0; i < n; i++) {
      switch (this.ampStage) {
        case 1:
          this.ampLevel += attK;
          if (this.ampLevel >= 1) { this.ampLevel = 1; this.ampStage = 2; }
          break;
        case 2:
          this.ampLevel += (sus - this.ampLevel) * decK;
          break;
        case 3:
          this.ampLevel += (0 - this.ampLevel) * relK;
          if (this.ampLevel < 1e-4) { this.ampLevel = 0; this.ampStage = 0; }
          break;
        default: this.ampLevel = 0;
      }
      this.ampSm += (this.ampLevel - this.ampSm) * slewK;
      this.gainSm += (g1 - this.gainSm) * gainK;
      const amp = this.ampSm * this.gainSm;
      const sl = this.fL[i] * amp, sr = this.fR[i] * amp;
      const yL = sl - this.dcxL + dcR * this.dcyL;
      const yR = sr - this.dcxR + dcR * this.dcyR;
      this.dcxL = sl; this.dcyL = yL;
      this.dcxR = sr; this.dcyR = yR;
      L[off + i] += yL;
      R[off + i] += yR;
    }
  }

  process(inputs, outputs) {
    this.fx.keyIn = inputs[0]?.length ? inputs[0] : null;
    const out = outputs[0];
    const L = out[0];
    const n = L.length;
    // The FX rack is stereo end to end (ping-pong delay, stereo reverb). On a
    // mono output the right channel is a scratch buffer that is thrown away,
    // rather than aliasing L and double-writing it.
    if (out.length <= 1 && (this.monoR === null || this.monoR.length !== n)) this.monoR = new Float32Array(n);
    const R = out.length > 1 ? out[1] : this.monoR;
    L.fill(0); R.fill(0);

    const start = currentFrame;
    if (this.pauto) this.pauto.tick(start, this.pautoSet);
    const q = this.evq;
    // Events whose frame has passed: a note-on is dropped, a note-off still
    // applies so no note hangs.
    while (this.evHead < q.length && q[this.evHead].f < start) {
      const e = q[this.evHead++];
      if (!e.on) this.applyEvent(e);
    }
    let pos = 0;
    while (pos < n) {
      while (this.evHead < q.length && q[this.evHead].f <= start + pos) this.applyEvent(q[this.evHead++]);
      let run = n - pos;
      if (this.evHead < q.length) run = Math.min(run, q[this.evHead].f - (start + pos));
      run = Math.max(1, Math.ceil(run));
      this.songPos = start + pos - this.anchor;
      this.advanceLfoClock();
      this.renderVoice(L, R, pos, run);
      pos += run;
    }
    if (this.evHead > 256 && this.evHead * 2 > q.length) {
      this.evq = q.slice(this.evHead);
      this.evHead = 0;
    }

    // FX run over the whole quantum, always — the delay and reverb tails and
    // the limiter release have to keep developing after the voice goes silent.
    if (this.fxDirty) {
      this.fx.setParams(this.p);
      if (this.fxSnap) { this.fx.snapRamps(); this.fxSnap = false; }
      this.fxDirty = false;
    }
    this.fx.process(L, R, n);

    // Telemetry is deliberately emitted at ~30 Hz and only after an explicit
    // subscription. It reports measured stage/bus levels, never simulated
    // values, and resets after each packet.
    if (this.fx.reverbMetering && this.fx.reverbSamples >= sampleRate / 30) {
      const fx = this.fx, e = fx.reverbEnergy;
      const rms = i => Math.max(-90, 10 * Math.log10(Math.max(1e-9, e[i] / fx.reverbSamples)));
      const product = Math.sqrt(e[0] * e[1]);
      this.port.postMessage({ t: 'reverb', left: rms(0), right: rms(1), correlation: product > fx.reverbSamples * 1e-9 ? Math.max(-1, Math.min(1, e[2] / product)) : 0 });
      e.fill(0); fx.reverbSamples = 0;
    }
    if (this.fx.echoMetering && this.fx.echoSamples >= sampleRate / 30) {
      const fx = this.fx, e = fx.echoEnergy;
      const rms = i => Math.max(-90, 10 * Math.log10(Math.max(1e-9, e[i] / fx.echoSamples)));
      this.port.postMessage({ t: 'echo', input: rms(0), left: rms(1), right: rms(2), time: fx.dlTime.cur, driftL: 0, driftR: 0 });
      e.fill(0); fx.echoSamples = 0;
    }
    if (this.fx.metering && this.fx.meterSamples >= sampleRate / 30) {
      const fx = this.fx, e = fx.meterEnergy, ott = fx.ott, comp = fx.comp;
      const db = value => Math.max(-90, Math.min(60, 20 * Math.log10(Math.max(1e-9, value))));
      const rms = i => db(Math.sqrt(e[i] / fx.meterSamples));
      const active = ott.depthTarget > 0;
      this.port.postMessage({ t: 'dynamics',
        ott: { input: rms(0), output: rms(1), levels: Array.from(ott.env, v => active ? db(v) : -90), gains: Array.from(ott.gain, (v, i) => active && ott.env[i] > 1e-7 ? db(v) : 0), makeup: active ? db(ott.autoGain.gain) : 0 },
        comp: { input: rms(2), output: rms(3), reduction: fx.meterReduction, trace: comp.takeTrace(), makeup: comp.wetTarget ? db(comp.autoGain.gain) : 0 },
      });
      e.fill(0); fx.meterSamples = 0; fx.meterReduction = 0;
    }

    this.vizCount += n;
    if (this.vizCount >= 2048) {
      this.vizCount = 0;
      this.port.postMessage({
        t: 'viz',
        pos: this.ampStage !== 0 ? this.posSm : -1,
        env: this.ampLevel,
        fenv: this.ampStage !== 0 ? (this.fenvVal || 0) : 0,
        cut: this.ampStage !== 0 ? this.curCut : -1,
        gate: this.gate,
        pitch: this.ampStage !== 0 ? ROOT_MIDI + Math.round(this.semiTarget) : -1,
      });
    }
    return true;
  }
}

registerProcessor('fable-bl', BassProcessor);
