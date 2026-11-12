/**
 * The TypeScript loops that the kernels replaced, copied unchanged from
 * image-nodes/src/nodes/lib-image-enhance.ts, audio-nodes/src/nodes/
 * lib-audio-effects.ts, lib-audio-dsp.ts, synthesis.ts, realtime-audio.ts and
 * audio-nodes/src/lib/{biquad,synth-dsp}.ts. The parity tests compare each
 * kernel with its loop here. These copies are test oracles only.
 */

/* ── Image enhance ─────────────────────────────────────────────────── */

export function autoContrast(rgba: Uint8Array, w: number, h: number, cutoff: number): Uint8Array {
  const channels = 4;
  const totalPixels = w * h;
  const out = new Uint8Array(rgba);
  const cutCount = Math.floor((totalPixels * cutoff) / 100);
  for (let c = 0; c < 3; c++) {
    const hist = new Uint32Array(256);
    for (let i = c; i < out.length; i += channels) hist[out[i]]++;
    let lo = 0;
    let cumLo = 0;
    while (lo < 255 && cumLo + hist[lo] <= cutCount) {
      cumLo += hist[lo];
      lo++;
    }
    let hi = 255;
    let cumHi = 0;
    while (hi > 0 && cumHi + hist[hi] <= cutCount) {
      cumHi += hist[hi];
      hi--;
    }
    if (lo >= hi) continue;
    const scale = 255.0 / (hi - lo);
    for (let i = c; i < out.length; i += channels) {
      out[i] = Math.max(0, Math.min(255, Math.round((out[i] - lo) * scale)));
    }
  }
  return out;
}

export function equalize(rgba: Uint8Array, w: number, h: number): Uint8Array {
  const channels = 4;
  const totalPixels = w * h;
  const out = new Uint8Array(rgba);
  for (let c = 0; c < 3; c++) {
    const hist = new Uint32Array(256);
    for (let i = c; i < out.length; i += channels) hist[out[i]]++;
    const cdf = new Uint32Array(256);
    cdf[0] = hist[0];
    for (let j = 1; j < 256; j++) cdf[j] = cdf[j - 1] + hist[j];
    let cdfMin = 0;
    for (let j = 0; j < 256; j++) {
      if (cdf[j] > 0) {
        cdfMin = cdf[j];
        break;
      }
    }
    const lut = new Uint8Array(256);
    const denom = totalPixels - cdfMin;
    if (denom > 0) {
      for (let j = 0; j < 256; j++) {
        lut[j] = Math.round(((cdf[j] - cdfMin) / denom) * 255);
      }
    }
    for (let i = c; i < out.length; i += channels) out[i] = lut[out[i]];
  }
  return out;
}

export function adaptiveContrast(
  rgba: Uint8Array,
  w: number,
  h: number,
  clipLimit: number,
  gridSizeProp: number
): Uint8Array {
  const channels = 4;
  const gridSize = Math.max(1, Math.round(gridSizeProp));
  const tileW = Math.ceil(w / gridSize);
  const tileH = Math.ceil(h / gridSize);
  const tileCDFs: Float32Array[][][] = [];
  for (let ty = 0; ty < gridSize; ty++) {
    tileCDFs[ty] = [];
    for (let tx = 0; tx < gridSize; tx++) {
      tileCDFs[ty][tx] = [];
      const x0 = tx * tileW;
      const y0 = ty * tileH;
      const x1 = Math.min(x0 + tileW, w);
      const y1 = Math.min(y0 + tileH, h);
      const tilePixels = (x1 - x0) * (y1 - y0);
      for (let c = 0; c < 3; c++) {
        const hist = new Uint32Array(256);
        for (let y = y0; y < y1; y++) {
          for (let x = x0; x < x1; x++) {
            hist[rgba[(y * w + x) * channels + c]]++;
          }
        }
        const limit = Math.max(1, Math.round((clipLimit * tilePixels) / 256));
        let excess = 0;
        for (let j = 0; j < 256; j++) {
          if (hist[j] > limit) {
            excess += hist[j] - limit;
            hist[j] = limit;
          }
        }
        const increment = Math.floor(excess / 256);
        for (let j = 0; j < 256; j++) hist[j] += increment;
        const cdf = new Float32Array(256);
        cdf[0] = hist[0];
        for (let j = 1; j < 256; j++) cdf[j] = cdf[j - 1] + hist[j];
        const cdfMax = cdf[255];
        if (cdfMax > 0) {
          for (let j = 0; j < 256; j++) cdf[j] = (cdf[j] / cdfMax) * 255;
        }
        tileCDFs[ty][tx][c] = cdf;
      }
    }
  }
  const result = new Uint8Array(rgba);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const ftx = (x + 0.5) / tileW - 0.5;
      const fty = (y + 0.5) / tileH - 0.5;
      const tx0 = Math.max(0, Math.floor(ftx));
      const ty0 = Math.max(0, Math.floor(fty));
      const tx1 = Math.min(gridSize - 1, tx0 + 1);
      const ty1 = Math.min(gridSize - 1, ty0 + 1);
      const fx = Math.max(0, Math.min(1, ftx - tx0));
      const fy = Math.max(0, Math.min(1, fty - ty0));
      for (let c = 0; c < 3; c++) {
        const val = rgba[(y * w + x) * channels + c];
        const tl = tileCDFs[ty0][tx0][c][val];
        const tr = tileCDFs[ty0][tx1][c][val];
        const bl = tileCDFs[ty1][tx0][c][val];
        const br = tileCDFs[ty1][tx1][c][val];
        const top = tl * (1 - fx) + tr * fx;
        const bot = bl * (1 - fx) + br * fx;
        result[(y * w + x) * channels + c] = Math.round(top * (1 - fy) + bot * fy);
      }
    }
  }
  return result;
}

export function rankFilter(rgba: Uint8Array, w: number, h: number, sizeProp: number, rank: number): Uint8Array {
  const channels = 4;
  const size = Math.max(1, Math.min(25, sizeProp));
  const half = Math.floor(size / 2);
  const result = new Uint8Array(rgba);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      for (let c = 0; c < 3; c++) {
        const neighbors: number[] = [];
        for (let ky = -half; ky <= half; ky++) {
          for (let kx = -half; kx <= half; kx++) {
            const ny = Math.min(h - 1, Math.max(0, y + ky));
            const nx = Math.min(w - 1, Math.max(0, x + kx));
            neighbors.push(rgba[(ny * w + nx) * channels + c]);
          }
        }
        neighbors.sort((a, b) => a - b);
        const idx = Math.min(rank, neighbors.length - 1);
        result[(y * w + x) * channels + c] = neighbors[idx];
      }
    }
  }
  return result;
}

/* ── Audio effects ─────────────────────────────────────────────────── */

export function perChannel(
  samples: Float32Array,
  numChannels: number,
  sampleRate: number,
  fn: (channel: Float32Array, sampleRate: number) => Float32Array
): Float32Array {
  const frameSamples = Math.floor(samples.length / numChannels);
  const channels: Float32Array[] = [];
  for (let ch = 0; ch < numChannels; ch++) {
    const channelData = new Float32Array(frameSamples);
    for (let i = 0; i < frameSamples; i++) channelData[i] = samples[i * numChannels + ch];
    channels.push(fn(channelData, sampleRate));
  }
  const outFrames = channels[0].length;
  const outSamples = new Float32Array(outFrames * numChannels);
  for (let ch = 0; ch < numChannels; ch++) {
    for (let i = 0; i < outFrames; i++) outSamples[i * numChannels + ch] = channels[ch][i];
  }
  return outSamples;
}

export function bitcrush(ch: Float32Array, bitDepth: number, srrFactor: number): Float32Array {
  const levels = Math.max(1, Math.pow(2, bitDepth) - 1);
  const out = new Float32Array(ch.length);
  for (let i = 0; i < ch.length; i++) {
    const idx = Math.floor(i / srrFactor) * srrFactor;
    const srcIdx = Math.min(idx, ch.length - 1);
    out[i] = Math.round(ch[srcIdx] * levels) / levels;
  }
  return out;
}

export function compress(
  ch: Float32Array,
  sr: number,
  thresholdDb: number,
  ratio: number,
  attackMs: number,
  releaseMs: number,
  autoGain: boolean
): Float32Array {
  const makeupDb = autoGain ? (-thresholdDb * (1 - 1 / ratio)) / 2 : 0;
  const makeup = Math.pow(10, makeupDb / 20);
  const out = new Float32Array(ch.length);
  const attackCoeff = Math.exp(-1 / ((sr * attackMs) / 1000));
  const releaseCoeff = Math.exp(-1 / ((sr * releaseMs) / 1000));
  const thresholdLin = Math.pow(10, thresholdDb / 20);
  let envelope = 0;
  for (let i = 0; i < ch.length; i++) {
    const absVal = Math.abs(ch[i]);
    if (absVal > envelope) {
      envelope = attackCoeff * envelope + (1 - attackCoeff) * absVal;
    } else {
      envelope = releaseCoeff * envelope + (1 - releaseCoeff) * absVal;
    }
    if (envelope > thresholdLin) {
      const dbOver = 20 * Math.log10(envelope / thresholdLin);
      const dbReduction = dbOver * (1 - 1 / ratio);
      const gainReduction = Math.pow(10, -dbReduction / 20);
      out[i] = ch[i] * gainReduction * makeup;
    } else {
      out[i] = ch[i] * makeup;
    }
  }
  return out;
}

export function distortion(ch: Float32Array, driveDb: number): Float32Array {
  const drive = Math.pow(10, driveDb / 20);
  const out = new Float32Array(ch.length);
  for (let i = 0; i < ch.length; i++) out[i] = (2 / Math.PI) * Math.atan(ch[i] * drive);
  return out;
}

export function limiter(ch: Float32Array, sr: number, thresholdDb: number, releaseMs: number, autoGain: boolean): Float32Array {
  const threshold = Math.pow(10, thresholdDb / 20);
  const makeup = autoGain ? 1 / threshold : 1;
  const out = new Float32Array(ch.length);
  const releaseCoeff = Math.exp(-1 / ((sr * releaseMs) / 1000));
  let gainReduction = 1;
  for (let i = 0; i < ch.length; i++) {
    const absVal = Math.abs(ch[i]);
    if (absVal > threshold) {
      const targetGain = threshold / absVal;
      if (targetGain < gainReduction) gainReduction = targetGain;
    } else {
      gainReduction = releaseCoeff * gainReduction + (1 - releaseCoeff) * 1.0;
    }
    out[i] = ch[i] * gainReduction * makeup;
  }
  return out;
}

export function reverb(ch: Float32Array, sr: number, roomScale: number, damping: number, wetLevel: number, dryLevel: number): Float32Array {
  const baseCombDelays = [1557, 1617, 1491, 1422];
  const baseAllpassDelays = [225, 556];
  const scale = sr / 44100;
  function combFilter(input: Float32Array, delaySamples: number, feedback: number, damp: number): Float32Array {
    const out = new Float32Array(input.length);
    const buf = new Float32Array(delaySamples);
    let bufIdx = 0;
    let filterStore = 0;
    for (let i = 0; i < input.length; i++) {
      const delayed = buf[bufIdx];
      filterStore = delayed * (1 - damp) + filterStore * damp;
      buf[bufIdx] = input[i] + filterStore * feedback;
      out[i] = delayed;
      bufIdx = (bufIdx + 1) % delaySamples;
    }
    return out;
  }
  function allpassFilter(input: Float32Array, delaySamples: number, feedback: number): Float32Array {
    const out = new Float32Array(input.length);
    const buf = new Float32Array(delaySamples);
    let bufIdx = 0;
    for (let i = 0; i < input.length; i++) {
      const delayed = buf[bufIdx];
      buf[bufIdx] = input[i] + delayed * feedback;
      out[i] = delayed - input[i] * feedback;
      bufIdx = (bufIdx + 1) % delaySamples;
    }
    return out;
  }
  const feedback = roomScale * 0.28 + 0.7;
  const combOut = new Float32Array(ch.length);
  for (const baseDelay of baseCombDelays) {
    const filtered = combFilter(ch, Math.round(baseDelay * scale), feedback, damping);
    for (let i = 0; i < ch.length; i++) combOut[i] += filtered[i];
  }
  let apOut: Float32Array = combOut;
  for (const baseDelay of baseAllpassDelays) apOut = allpassFilter(apOut, Math.round(baseDelay * scale), 0.5);
  const out = new Float32Array(ch.length);
  for (let i = 0; i < ch.length; i++) out[i] = ch[i] * dryLevel + apOut[i] * wetLevel;
  return out;
}

export function noiseGate(ch: Float32Array, sr: number, thresholdDb: number, attackMsProp: number, releaseMsProp: number): Float32Array {
  const attackMs = Math.max(0.1, attackMsProp);
  const releaseMs = Math.max(1, releaseMsProp);
  const thresholdLin = Math.pow(10, thresholdDb / 20);
  const out = new Float32Array(ch.length);
  const attackCoeff = Math.exp(-1 / ((sr * attackMs) / 1000));
  const releaseCoeff = Math.exp(-1 / ((sr * releaseMs) / 1000));
  let envelope = 0;
  let gain = 0;
  for (let i = 0; i < ch.length; i++) {
    const absVal = Math.abs(ch[i]);
    if (absVal > envelope) {
      envelope = attackCoeff * envelope + (1 - attackCoeff) * absVal;
    } else {
      envelope = releaseCoeff * envelope + (1 - releaseCoeff) * absVal;
    }
    const targetGain = envelope >= thresholdLin ? 1 : 0;
    const coeff = targetGain > gain ? attackCoeff : releaseCoeff;
    gain = coeff * gain + (1 - coeff) * targetGain;
    out[i] = ch[i] * gain;
  }
  return out;
}

export function phaser(ch: Float32Array, sr: number, rateHz: number, depth: number, centreFreqHz: number, feedback: number, mix: number): Float32Array {
  const out = new Float32Array(ch.length);
  const numStages = 4;
  const xPrev = new Float32Array(numStages);
  const yPrev = new Float32Array(numStages);
  let feedbackSample = 0;
  let lfoPhase = 0;
  const lfoIncrement = (2 * Math.PI * rateHz) / sr;
  for (let i = 0; i < ch.length; i++) {
    const lfo = Math.sin(lfoPhase) * depth;
    lfoPhase += lfoIncrement;
    if (lfoPhase > 2 * Math.PI) lfoPhase -= 2 * Math.PI;
    const modFreq = Math.max(20, Math.min(sr / 2 - 1, centreFreqHz * (1 + lfo)));
    const tanVal = Math.tan((Math.PI * modFreq) / sr);
    const a = (tanVal - 1) / (tanVal + 1);
    const signal = ch[i] + feedbackSample * feedback;
    let apOut = signal;
    for (let s = 0; s < numStages; s++) {
      const newOut = a * apOut + xPrev[s] - a * yPrev[s];
      xPrev[s] = apOut;
      yPrev[s] = newOut;
      apOut = newOut;
    }
    feedbackSample = apOut;
    out[i] = ch[i] * (1 - mix) + apOut * mix;
  }
  return out;
}

export function delay(samples: Float32Array, numChannels: number, sampleRate: number, delaySec: number, feedback: number, mix: number): Float32Array {
  const frameSamples = Math.floor(samples.length / numChannels);
  const delaySamples = Math.floor(delaySec * sampleRate);
  const outLength = frameSamples + delaySamples * 4;
  const outSamples = new Float32Array(outLength * numChannels);
  for (let ch = 0; ch < numChannels; ch++) {
    const dry = new Float32Array(outLength);
    const wet = new Float32Array(outLength);
    for (let i = 0; i < frameSamples; i++) dry[i] = samples[i * numChannels + ch];
    for (let i = delaySamples; i < outLength; i++) {
      wet[i] = dry[i - delaySamples] + wet[i - delaySamples] * feedback;
    }
    for (let i = 0; i < outLength; i++) outSamples[i * numChannels + ch] = dry[i] * (1 - mix) + wet[i] * mix;
  }
  return outSamples;
}

/* ── Biquad (lib/biquad.ts) ────────────────────────────────────────── */

export type RbjType = "lowpass" | "highpass" | "lowshelf" | "highshelf" | "peaking";

export function biquadCoeffs(type: RbjType, sampleRate: number, frequency: number, q: number, gainDb = 0): number[] {
  const nyquist = sampleRate / 2;
  const f = Math.min(Math.max(frequency, 1), nyquist * 0.9999);
  const w0 = (2 * Math.PI * f) / sampleRate;
  const cosW0 = Math.cos(w0);
  const sinW0 = Math.sin(w0);
  const safeQ = Math.max(q, 1e-4);
  const alpha = sinW0 / (2 * safeQ);
  const A = Math.pow(10, gainDb / 40);
  let b0: number, b1: number, b2: number, a0: number, a1: number, a2: number;
  switch (type) {
    case "lowpass":
      b0 = (1 - cosW0) / 2; b1 = 1 - cosW0; b2 = (1 - cosW0) / 2;
      a0 = 1 + alpha; a1 = -2 * cosW0; a2 = 1 - alpha;
      break;
    case "highpass":
      b0 = (1 + cosW0) / 2; b1 = -(1 + cosW0); b2 = (1 + cosW0) / 2;
      a0 = 1 + alpha; a1 = -2 * cosW0; a2 = 1 - alpha;
      break;
    case "lowshelf": {
      const t = 2 * Math.sqrt(A) * alpha;
      b0 = A * (A + 1 - (A - 1) * cosW0 + t); b1 = 2 * A * (A - 1 - (A + 1) * cosW0);
      b2 = A * (A + 1 - (A - 1) * cosW0 - t); a0 = A + 1 + (A - 1) * cosW0 + t;
      a1 = -2 * (A - 1 + (A + 1) * cosW0); a2 = A + 1 + (A - 1) * cosW0 - t;
      break;
    }
    case "highshelf": {
      const t = 2 * Math.sqrt(A) * alpha;
      b0 = A * (A + 1 + (A - 1) * cosW0 + t); b1 = -2 * A * (A - 1 + (A + 1) * cosW0);
      b2 = A * (A + 1 + (A - 1) * cosW0 - t); a0 = A + 1 - (A - 1) * cosW0 + t;
      a1 = 2 * (A - 1 - (A + 1) * cosW0); a2 = A + 1 - (A - 1) * cosW0 - t;
      break;
    }
    case "peaking":
      b0 = 1 + alpha * A; b1 = -2 * cosW0; b2 = 1 - alpha * A;
      a0 = 1 + alpha / A; a1 = -2 * cosW0; a2 = 1 - alpha / A;
      break;
  }
  return [b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0];
}

export function processBiquad(coeffs: number[], state: number[], input: Float32Array): Float32Array {
  const [b0, b1, b2, a1, a2] = coeffs;
  let [x1, x2, y1, y2] = state;
  const out = new Float32Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const x0 = input[i];
    const y0 = b0 * x0 + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    out[i] = y0;
    x2 = x1; x1 = x0; y2 = y1; y1 = y0;
  }
  state[0] = x1; state[1] = x2; state[2] = y1; state[3] = y2;
  return out;
}

/* ── Synthesis (lib/synth-dsp.ts and synthesis.ts) ─────────────────── */

export function oscSample(wave: "sine" | "saw" | "square" | "triangle", phase: number, pulseWidth = 0.5): number {
  switch (wave) {
    case "sine": return Math.sin(2 * Math.PI * phase);
    case "saw": return 2 * phase - 1;
    case "square": return phase < pulseWidth ? 1 : -1;
    case "triangle": return 1 - 4 * Math.abs(phase - 0.5);
  }
}

export function adsrCoeff(seconds: number, sampleRate: number): number {
  return 1 - Math.exp(-1 / Math.max(1, seconds * sampleRate));
}

export interface AdsrState { stage: string; env: number; gateWasHigh: boolean }

export function adsrStep(
  state: AdsrState,
  gateHigh: boolean,
  params: { attackCoeff: number; decayCoeff: number; releaseCoeff: number; sustain: number }
): number {
  if (gateHigh && !state.gateWasHigh) state.stage = "attack";
  else if (!gateHigh && state.gateWasHigh) state.stage = "release";
  state.gateWasHigh = gateHigh;
  switch (state.stage) {
    case "attack":
      state.env += params.attackCoeff * (1.3 - state.env);
      if (state.env >= 1) { state.env = 1; state.stage = "decay"; }
      break;
    case "decay":
      state.env += params.decayCoeff * (params.sustain - state.env);
      if (Math.abs(state.env - params.sustain) < 1e-4) { state.env = params.sustain; state.stage = "sustain"; }
      break;
    case "sustain":
      state.env = params.sustain;
      break;
    case "release":
      state.env += params.releaseCoeff * (0 - state.env);
      if (state.env < 1e-5) { state.env = 0; state.stage = "idle"; }
      break;
    default:
      state.env = 0;
  }
  return state.env;
}
