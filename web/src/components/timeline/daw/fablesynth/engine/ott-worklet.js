// Reusable, allocation-free stereo OTT-style dynamics component.
// Load with audioWorklet.addModule before an instrument's processor module.
// Original implementation, not an emulation of a proprietary preset.
// Slow, stereo-linked energy matching. Measure the uncorrected wet signal so
// this is feed-forward compensation, not a feedback leveler. Hold in silence.
class AutoGain {
  constructor(sr) {
    this.energyCoef = 1 - Math.exp(-1 / (0.3 * sr));
    this.gainCoef = 1 - Math.exp(-1 / (0.15 * sr));
    this.reset();
  }
  reset() { this.input = 0; this.wet = 0; this.gain = 1; this.target = 1; this.tick = 0; }
  next(inL, inR, wetL, wetR) {
    const input = 0.5 * (inL * inL + inR * inR);
    const wet = 0.5 * (wetL * wetL + wetR * wetR);
    this.input += (input - this.input) * this.energyCoef;
    this.wet += (wet - this.wet) * this.energyCoef;
    if (this.tick === 0 && input > 1e-12 && this.input > 1e-12 && this.wet > 1e-16) {
      // -48 to +24 dB, sufficient to tame OTT boosts without runaway makeup.
      this.target = Math.max(0.003981071706, Math.min(15.848931925, Math.sqrt(this.input / this.wet)));
    }
    this.tick = (this.tick + 1) & 15;
    this.gain += (this.target - this.gain) * this.gainCoef;
    return this.gain;
  }
}

// Shared -1 dBFS sample-peak guard. No lookahead; stereo-linked 80 ms release.
class PeakGuard {
  constructor(sr) { this.release = 1 - Math.exp(-1 / (0.08 * sr)); this.gain = 1; }
  reset() { this.gain = 1; }
  gainFor(l, r) {
    const pk = Math.max(Math.abs(l), Math.abs(r));
    const required = pk > 0.8912509381337456 ? 0.8912509381337456 / pk : 1;
    this.gain = Math.min(required, this.gain + (1 - this.gain) * this.release);
    if (required === 1 && 1 - this.gain < 1e-8) this.gain = 1;
    return this.gain;
  }
  process(L, R, n) {
    for (let i = 0; i < n; i++) {
      const l = L[i], r = R[i];
      if (!Number.isFinite(l) || !Number.isFinite(r)) { L[i] = 0; R[i] = 0; continue; }
      const g = this.gainFor(l, r);
      if (g !== 1) { L[i] = l * g; R[i] = r * g; }
    }
  }
}

// Stereo-linked compressor with a 9 dB knee and measured automatic gain.
class Compressor {
  constructor(sr) {
    this.smooth = 1 - Math.exp(-1 / (0.02 * sr));
    this.attack = 1 - Math.exp(-1 / (0.003 * sr));
    this.release = 1 - Math.exp(-1 / (0.25 * sr));
    this.autoGain = new AutoGain(sr);
    this.sr = sr; this.ratio = this.ratioTarget = 4;
    this.wet = 0; this.threshold = -16;
    // Detector input (max |L|,|R| per sample) since the last telemetry block,
    // so auto-comp can run this exact detector on the material. Bounded: an
    // undrained trace stops filling.
    this.trace = new Float32Array(Math.ceil(sr / 10)); this.traceLen = 0;
    // Side-chain: an external key drives the detector through a one-pole
    // high-pass. Automatic makeup is off while keyed, or it would undo the
    // ducking the key asks for.
    this.keyed = false; this.keyCoef = 0; this.keyLpL = 0; this.keyLpR = 0;
    this.setParams(false, -16); this.reset();
  }
  takeTrace() { const t = this.trace.slice(0, this.traceLen); this.traceLen = 0; return t; }
  setParams(on, threshold, attack = 0.003, release = 0.25, ratio = 4) {
    this.attack = 1 - Math.exp(-1 / (Math.max(0.0001, Math.min(0.1, attack)) * this.sr));
    this.release = 1 - Math.exp(-1 / (Math.max(0.01, Math.min(2, release)) * this.sr));
    this.ratioTarget = Math.max(1, Math.min(20, ratio));
    this.wetTarget = on ? 1 : 0;
    this.thresholdTarget = Math.max(-40, Math.min(0, threshold));
  }
  /** `keyed` selects the key input; `hpHz` high-passes it (20 Hz ≈ flat). */
  setKey(keyed, hpHz = 20) {
    if (keyed !== this.keyed) { this.keyLpL = this.keyLpR = 0; this.autoGain.reset(); }
    this.keyed = !!keyed;
    this.keyCoef = 1 - Math.exp(-2 * Math.PI * Math.max(10, Math.min(1000, hpHz)) / this.sr);
  }
  reset() { this.env = 0; this.gain = 1; this.step = 0; this.tick = 0; this.l = 0; this.r = 0; this.autoGain.reset(); }
  processSample(l, r, kl = 0, kr = kl) {
    let pk;
    if (this.keyed) {
      this.keyLpL += this.keyCoef * (kl - this.keyLpL);
      this.keyLpR += this.keyCoef * (kr - this.keyLpR);
      pk = Math.max(Math.abs(kl - this.keyLpL), Math.abs(kr - this.keyLpR));
    } else pk = Math.max(Math.abs(l), Math.abs(r));
    if (this.traceLen < this.trace.length) this.trace[this.traceLen++] = pk;
    if (this.wetTarget === 0 && this.wet < 1e-6) {
      if (this.wet !== 0) { this.wet = 0; this.reset(); }
      this.l = l; this.r = r; return;
    }
    this.env += (pk - this.env) * (pk > this.env ? this.attack : this.release);
    this.threshold += (this.thresholdTarget - this.threshold) * this.smooth;
    this.ratio += (this.ratioTarget - this.ratio) * this.smooth;
    if (this.tick === 0) {
      const over = 20 * Math.log10(Math.max(1e-9, this.env)) - this.threshold;
      const slope = 1 / this.ratio - 1;
      const db = over <= 0 ? 0 : over < 9 ? slope * over * over / 18 : slope * (over - 4.5);
      this.step = (Math.pow(10, db / 20) - this.gain) / 32;
    }
    this.tick = (this.tick + 1) & 31;
    this.gain += this.step;
    const g = this.keyed ? this.gain : this.gain * this.autoGain.next(l, r, this.gain * l, this.gain * r);
    this.wet += (this.wetTarget - this.wet) * this.smooth;
    this.l = l + this.wet * (g * l - l);
    this.r = r + this.wet * (g * r - r);
  }
  /** `KL`/`KR` are the key for these samples; omitted means no key signal. */
  process(L, R, n, KL = null, KR = KL) {
    if (this.keyed && KL) {
      for (let i = 0; i < n; i++) { this.processSample(L[i], R[i], KL[i] || 0, KR[i] || 0); L[i] = this.l; R[i] = this.r; }
    } else {
      for (let i = 0; i < n; i++) { this.processSample(L[i], R[i]); L[i] = this.l; R[i] = this.r; }
    }
  }
}

class OttCompressor {
  constructor(sr) {
    this.sr = sr;
    // Complementary one-pole splits reconstruct the input exactly at unity,
    // keeping parallel depth blending free of crossover phase cancellation.
    this.lowCoef = 1 - Math.exp(-2 * Math.PI * 120 / sr);
    this.highCoef = 1 - Math.exp(-2 * Math.PI * 2500 / sr);
    this.smooth = 1 - Math.exp(-1 / (0.015 * sr));
    this.split = new Float64Array(4);
    this.env = new Float64Array(3);
    this.gain = new Float64Array(3).fill(1);
    this.target = new Float64Array(3).fill(1);
    this.bandsL = new Float64Array(3);
    this.bandsR = new Float64Array(3);
    this.attack = new Float64Array(3);
    this.release = new Float64Array(3);
    this.depth = 0; this.tick = 0; this.l = 0; this.r = 0;
    this.autoGain = new AutoGain(sr);
    this.setParams(false, 0.35, 1, 1, 1);
  }

  setParams(on, depth, time, up, down) {
    this.depthTarget = on ? Math.max(0, Math.min(1, depth)) : 0;
    this.up = Math.max(0, Math.min(2, up));
    this.down = Math.max(0, Math.min(2, down));
    time = Math.max(0.01, Math.min(10, time));
    if (time !== this.time) {
      this.time = time;
      for (let b = 0; b < 3; b++) {
        this.attack[b] = 1 - Math.exp(-1 / ((b === 0 ? 0.008 : b === 1 ? 0.003 : 0.001) * time * this.sr));
        this.release[b] = 1 - Math.exp(-1 / ((b === 0 ? 0.18 : b === 1 ? 0.12 : 0.08) * time * this.sr));
      }
    }
  }

  reset() {
    this.split.fill(0); this.env.fill(0);
    this.gain.fill(1); this.target.fill(1); this.tick = 0;
    this.autoGain.reset();
  }

  process(L, R, n) {
    for (let i = 0; i < n; i++) { this.processSample(L[i], R[i]); L[i] = this.l; R[i] = this.r; }
  }

  processSample(inL, inR) {
    if (this.depthTarget === 0 && this.depth < 1e-6) {
      if (this.depth !== 0) { this.depth = 0; this.reset(); }
      this.l = inL; this.r = inR; return;
    }
    const s = this.split, l = this.bandsL, r = this.bandsR;
    s[0] += this.lowCoef * (inL - s[0]);
    s[1] += this.lowCoef * (inR - s[1]);
    s[2] += this.highCoef * (inL - s[0] - s[2]);
    s[3] += this.highCoef * (inR - s[1] - s[3]);
    l[0] = s[0]; l[1] = s[2]; l[2] = inL - s[0] - s[2];
    r[0] = s[1]; r[1] = s[3]; r[2] = inR - s[1] - s[3];
    let wetL = 0, wetR = 0;
    for (let b = 0; b < 3; b++) {
      // Stereo-linked detection prevents the image moving with dynamics.
      const pk = Math.max(Math.abs(l[b]), Math.abs(r[b]));
      this.env[b] += (pk - this.env[b]) * (pk > this.env[b] ? this.attack[b] : this.release[b]);
      if (this.tick === 0) {
        const db = 20 * Math.log10(Math.max(1e-9, this.env[b]));
        // At 100%: 4:1 upward below -36 dB, 10:1 downward above -18 dB.
        // Above 100% exaggerates the gain curve, including overcompression
        // (louder input can produce quieter output). Maximum boost: 48 dB.
        // Fade upward gain below -72 dB; never amplify digital silence.
        const floor = Math.max(0, Math.min(1, (db + 90) / 18));
        const boost = Math.min(24, Math.max(0, -36 - db) * 0.75) * this.up * floor;
        const cut = Math.max(0, db + 18) * 0.9 * this.down;
        this.target[b] = Math.pow(10, (boost - cut) / 20);
      }
      this.gain[b] += (this.target[b] - this.gain[b]) * this.smooth;
      wetL += l[b] * this.gain[b]; wetR += r[b] * this.gain[b];
    }
    this.tick = (this.tick + 1) & 15;
    this.depth += (this.depthTarget - this.depth) * this.smooth;
    const compensation = this.autoGain.next(inL, inR, wetL, wetR);
    this.l = inL + this.depth * (wetL * compensation - inL);
    this.r = inR + this.depth * (wetR * compensation - inR);
  }
}

globalThis.FableOttCompressor = OttCompressor;
globalThis.FableAutoGain = AutoGain;
globalThis.FablePeakGuard = PeakGuard;
globalThis.FableCompressor = Compressor;

// Shared four-band EQ; coefficient formulas match WT-1.
class EqBiquad {
  constructor(sr) { this.sr = sr; this.b0 = 1; this.b1 = 0; this.b2 = 0; this.a1 = 0; this.a2 = 0; this.z1 = 0; this.z2 = 0; }
  reset() { this.z1 = 0; this.z2 = 0; }
  copyFrom(other) {
    this.b0 = other.b0; this.b1 = other.b1; this.b2 = other.b2;
    this.a1 = other.a1; this.a2 = other.a2;
    this.z1 = other.z1; this.z2 = other.z2;
  }
  process(x) {
    const y = this.b0 * x + this.z1;
    this.z1 = this.b1 * x - this.a1 * y + this.z2;
    this.z2 = this.b2 * x - this.a2 * y;
    return y;
  }
  lowpass(freq, q) {
    const w0 = 2 * Math.PI * Math.min(freq, this.sr * 0.49) / this.sr;
    const cw = Math.cos(w0), alpha = Math.sin(w0) / (2 * q), a0 = 1 + alpha;
    this.b0 = (1 - cw) / 2 / a0; this.b1 = (1 - cw) / a0; this.b2 = this.b0;
    this.a1 = (-2 * cw) / a0; this.a2 = (1 - alpha) / a0;
  }
  highpass(freq, q) {
    const w0 = 2 * Math.PI * Math.min(freq, this.sr * 0.49) / this.sr;
    const cw = Math.cos(w0), alpha = Math.sin(w0) / (2 * q), a0 = 1 + alpha;
    this.b0 = (1 + cw) / 2 / a0; this.b1 = -(1 + cw) / a0; this.b2 = this.b0;
    this.a1 = (-2 * cw) / a0; this.a2 = (1 - alpha) / a0;
  }
  lowShelf(freq, gainDb, q = Math.SQRT1_2) {
    const A = Math.pow(10, gainDb / 40);
    const w0 = 2 * Math.PI * Math.min(freq, this.sr * 0.49) / this.sr;
    const cw = Math.cos(w0), sw = Math.sin(w0);
    const alpha = sw / (2 * q);
    const tsa = 2 * Math.sqrt(A) * alpha;
    const a0 = (A + 1) + (A - 1) * cw + tsa;
    this.b0 = A * ((A + 1) - (A - 1) * cw + tsa) / a0;
    this.b1 = 2 * A * ((A - 1) - (A + 1) * cw) / a0;
    this.b2 = A * ((A + 1) - (A - 1) * cw - tsa) / a0;
    this.a1 = -2 * ((A - 1) + (A + 1) * cw) / a0;
    this.a2 = ((A + 1) + (A - 1) * cw - tsa) / a0;
  }
  highShelf(freq, gainDb, q = Math.SQRT1_2) {
    const A = Math.pow(10, gainDb / 40);
    const w0 = 2 * Math.PI * Math.min(freq, this.sr * 0.49) / this.sr;
    const cw = Math.cos(w0), sw = Math.sin(w0);
    const alpha = sw / (2 * q);
    const tsa = 2 * Math.sqrt(A) * alpha;
    const a0 = (A + 1) - (A - 1) * cw + tsa;
    this.b0 = A * ((A + 1) + (A - 1) * cw + tsa) / a0;
    this.b1 = -2 * A * ((A - 1) + (A + 1) * cw) / a0;
    this.b2 = A * ((A + 1) + (A - 1) * cw - tsa) / a0;
    this.a1 = 2 * ((A - 1) - (A + 1) * cw) / a0;
    this.a2 = ((A + 1) - (A - 1) * cw - tsa) / a0;
  }
  peaking(freq, q, gainDb) {
    const A = Math.pow(10, gainDb / 40);
    const w0 = 2 * Math.PI * Math.min(freq, this.sr * 0.49) / this.sr;
    const cw = Math.cos(w0), alpha = Math.sin(w0) / (2 * q);
    const a0 = 1 + alpha / A;
    this.b0 = (1 + alpha * A) / a0; this.b1 = (-2 * cw) / a0; this.b2 = (1 - alpha * A) / a0;
    this.a1 = (-2 * cw) / a0; this.a2 = (1 - alpha / A) / a0;
  }
}


const EQ_FIELDS = ['on','low','mid','mfreq','high','lfreq','m2freq','hfreq','mid2','lq','ltype','lon','mq','mtype','mon','m2q','m2type','m2on','hq','htype','hon'].map(k => 'fx.eq.' + k);
const EQ_DEFAULTS = [0,0,0,900,0,120,2500,6000,0,Math.SQRT1_2,0,1,.9,1,1,.9,1,1,Math.SQRT1_2,2,1];
const EQ_KEYS = [[5,1,9,10,11],[3,2,12,13,14],[6,8,15,16,17],[7,4,18,19,20]];
class ParametricEq {
  constructor(sr) {
    this.sr = sr; this.steps = Math.max(1, Math.floor(sr * .015 / 32));
    this.wetCoef = 1 - Math.exp(-1 / (.005 * sr));
    this.guard = new PeakGuard(sr); this.wet = this.targetWet = 0; this.primed = false;
    this.typeFadeSamples = Math.max(1, Math.round(.003 * sr));
    this.bands = EQ_KEYS.map(keys => ({keys, l:new EqBiquad(sr), r:new EqBiquad(sr),
      oldL:new EqBiquad(sr), oldR:new EqBiquad(sr),
      cur:[0,0,0], target:[0,0,0], step:[0,0,0], left:[0,0,0],
      type:1, pendingType:1, xfLeft:0, dirty:true}));
    this.reset();
  }
  reset() {
    this.wet = this.targetWet; this.left = 0; this.guard.reset();
    for (const b of this.bands) {
      b.l.reset(); b.r.reset(); b.oldL.reset(); b.oldR.reset(); b.xfLeft=0; b.dirty = true;
      for (let i=0;i<3;i++) { b.cur[i]=b.target[i]; b.left[i]=0; }
    }
  }
  setParams(read) {
    const get = i => { const v=read(EQ_FIELDS[i]); return Number.isFinite(v)?v:EQ_DEFAULTS[i]; };
    const eqOn = get(0) > .5;
    this.targetWet = eqOn ? 1 : 0;
    if (!this.primed) this.wet = this.targetWet;
    for (const b of this.bands) {
      const k=b.keys;
      const values=[Math.log2(Math.max(20,Math.min(20000,get(k[0])))),
        eqOn&&get(k[4])>.5?Math.max(-15,Math.min(15,get(k[1]))):0, Math.max(.2,Math.min(12,get(k[2])))];
      for(let i=0;i<3;i++) {
        if(!this.primed) { b.cur[i]=b.target[i]=values[i]; b.left[i]=0; }
        else if(values[i]!==b.target[i]) { b.target[i]=values[i]; b.step[i]=(values[i]-b.cur[i])/this.steps; b.left[i]=this.steps; }
      }
      const type=Math.max(0,Math.min(2,get(k[3])|0));
      b.dirty ||= b.pendingType!==type; b.pendingType=type;
    }
    this.primed=true;
  }
  process(L,R,n) {
    for(let i=0;i<n;i++) {
      if(this.left--<=0) {
        this.left=31;
        for(const b of this.bands) {
          let changed=b.dirty;
          for(let j=0;j<3;j++) if(b.left[j]>0) { changed=true; b.cur[j]=--b.left[j]===0?b.target[j]:b.cur[j]+b.step[j]; }
          if(!changed) continue;
          const f=Math.pow(2,b.cur[0]),g=b.cur[1],q=b.cur[2];
          if(b.type!==b.pendingType) {
            b.oldL.copyFrom(b.l); b.oldR.copyFrom(b.r);
            b.type=b.pendingType; b.xfLeft=this.typeFadeSamples;
          }
          if(b.type===0) { b.l.lowShelf(f,g,q); b.r.lowShelf(f,g,q); }
          else if(b.type===2) { b.l.highShelf(f,g,q); b.r.highShelf(f,g,q); }
          else { b.l.peaking(f,q,g); b.r.peaking(f,q,g); }
          b.dirty=false;
        }
      }
      this.wet+=(this.targetWet-this.wet)*this.wetCoef;
      if(this.targetWet===0 && this.wet<1e-6) {
        if(this.wet!==0) { this.wet=0; for(const b of this.bands) { b.l.reset(); b.r.reset(); } }
        continue;
      }
      let l=L[i],r=R[i];
      for(const b of this.bands) {
        const inL=l,inR=r,newL=b.l.process(inL),newR=b.r.process(inR);
        if(b.xfLeft>0) {
          const oldL=b.oldL.process(inL),oldR=b.oldR.process(inR);
          const mix=1-b.xfLeft/this.typeFadeSamples;
          l=oldL+mix*(newL-oldL); r=oldR+mix*(newR-oldR); b.xfLeft--;
        } else { l=newL; r=newR; }
      }
      L[i]+=this.wet*(l-L[i]); R[i]+=this.wet*(r-R[i]);
      const gain=this.guard.gainFor(L[i],R[i]); L[i]*=gain; R[i]*=gain;
    }
  }
}
globalThis.FableParametricEq = ParametricEq;
globalThis.FableEqFields = EQ_FIELDS;

// Per-channel drive color. Saturation switches crossfade at 4x; the tone
// shelf runs after decimation. Zero tone is exactly transparent.
class DriveColor {
  constructor(sr) {
    this.fade = 1 - Math.exp(-1 / (0.01 * sr * 4));
    this.smooth = 1 - Math.exp(-1 / (0.02 * sr));
    this.pole = 1 - Math.exp(-2 * Math.PI * 1000 / sr);
    this.tapeTarget = this.hardTarget = this.toneTarget = 0;
    this.reset();
  }
  setParams(type = 0, tone = 0) {
    this.tapeTarget = Math.round(type) === 1 ? 1 : 0;
    this.hardTarget = Math.round(type) === 2 ? 1 : 0;
    this.toneTarget = Math.max(-1, Math.min(1, tone));
  }
  reset() { this.low = 0; this.tape = this.tapeTarget; this.hard = this.hardTarget; this.tone = this.toneTarget; }
  copyShapeFrom(o) { this.tape = o.tape; this.hard = o.hard; }
  shape(x, k, norm) {
    this.tape += (this.tapeTarget - this.tape) * this.fade;
    this.hard += (this.hardTarget - this.hard) * this.fade;
    const z = x * k, soft = Math.tanh(z);
    const tape = Math.abs(z) < 1 ? 1.5 * z - 0.5 * z * z * z : Math.sign(z);
    const hard = Math.max(-1, Math.min(1, z));
    return (soft + this.tape * (tape - soft) + this.hard * (hard - soft)) * norm;
  }
  processTone(x) {
    this.tone += (this.toneTarget - this.tone) * this.smooth;
    this.low += this.pole * (x - this.low);
    // ±6 dB high shelf, neutral at centre; keeps the low-end foundation.
    return x + this.tone * (this.tone < 0 ? 0.5 : 1) * (x - this.low);
  }
}
globalThis.FableDriveColor = DriveColor;
