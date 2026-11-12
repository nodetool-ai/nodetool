/**
 * Time of each kernel against the TypeScript loop it replaced, on V8.
 * native/kernels/bench/kernels_bench.cpp measures the native build on the
 * same cases.
 *
 *   npx tsx packages/kernels/bench/kernels.bench.ts
 */
import { loadWasmKernels } from "../src/index.js";
import * as ref from "../tests/reference.js";

const W = 1000;
const H = 1000;
const RATE = 44100;
const FRAMES = RATE * 10;
const CHANNELS = 2;

function image(): Uint8Array {
  const out = new Uint8Array(W * H * 4);
  let seed = 1;
  for (let i = 0; i < out.length; i++) {
    seed = (seed * 1103515245 + 12345) >>> 0;
    out[i] = (i >> 2) % 251 ^ (seed >>> 24);
  }
  return out;
}

function audio(): Float32Array {
  const out = new Float32Array(FRAMES * CHANNELS);
  for (let i = 0; i < out.length; i++) out[i] = Math.sin(i * 0.013) * 0.8;
  return out;
}

/** The median time of `runs` calls, in milliseconds. */
function time(fn: () => unknown, runs = 5): number {
  fn();
  const samples: number[] = [];
  for (let r = 0; r < runs; r++) {
    const start = performance.now();
    fn();
    samples.push(performance.now() - start);
  }
  return samples.sort((a, b) => a - b)[Math.floor(runs / 2)]!;
}

const k = await loadWasmKernels();
const rgba = image();
const pcm = audio();
const rows: [string, string, number, number][] = [];
const add = (name: string, unit: string, ts: () => unknown, wasm: () => unknown, runs?: number) => {
  rows.push([name, unit, time(ts, runs), time(wasm, runs)]);
};

add("AutoContrast", "1 MP", () => ref.autoContrast(rgba, W, H, 2), () => k.imageAutoContrast(rgba, W, H, 2));
add("Equalize", "1 MP", () => ref.equalize(rgba, W, H), () => k.imageEqualize(rgba, W, H));
add("AdaptiveContrast", "1 MP", () => ref.adaptiveContrast(rgba, W, H, 2, 8), () => k.imageAdaptiveContrast(rgba, W, H, 2, 8));
add("RankFilter 3", "1 MP", () => ref.rankFilter(rgba, W, H, 3, 4), () => k.imageRankFilter(rgba, W, H, 3, 4), 3);
add("RankFilter 15", "1 MP", () => ref.rankFilter(rgba, W, H, 15, 112), () => k.imageRankFilter(rgba, W, H, 15, 112), 1);
add("Reverb", "10 s stereo", () => ref.perChannel(pcm, CHANNELS, RATE, (ch, r) => ref.reverb(ch, r, 0.5, 0.5, 0.33, 0.4)),
  () => k.reverb(pcm, CHANNELS, RATE, { roomScale: 0.5, damping: 0.5, wetLevel: 0.33, dryLevel: 0.4 }));
add("Compress", "10 s stereo", () => ref.perChannel(pcm, CHANNELS, RATE, (ch, r) => ref.compress(ch, r, -20, 4, 5, 50, true)),
  () => k.compress(pcm, CHANNELS, RATE, { thresholdDb: -20, ratio: 4, attackMs: 5, releaseMs: 50, autoGain: true }));
add("Phaser", "10 s stereo", () => ref.perChannel(pcm, CHANNELS, RATE, (ch, r) => ref.phaser(ch, r, 1, 0.5, 1300, -0.5, 0.5)),
  () => k.phaser(pcm, CHANNELS, RATE, { rateHz: 1, depth: 0.5, centreFrequencyHz: 1300, feedback: -0.5, mix: 0.5 }));
const coeffs = k.biquadDesign("rbj", "lowpass", RATE, 1000, Math.SQRT1_2);
const refCoeffs = ref.biquadCoeffs("lowpass", RATE, 1000, Math.SQRT1_2);
add("Biquad", "10 s stereo", () => ref.perChannel(pcm, CHANNELS, RATE, (ch) => ref.processBiquad(refCoeffs, [0, 0, 0, 0], ch)),
  () => k.biquadProcess(coeffs, k.createBiquadState(CHANNELS), pcm, CHANNELS));

console.log("| Kernel | Input | TypeScript on V8 (ms) | WebAssembly on V8 (ms) |");
console.log("|---|---|---:|---:|");
for (const [name, unit, ts, wasm] of rows) {
  console.log(`| ${name} | ${unit} | ${ts.toFixed(1)} | ${wasm.toFixed(1)} |`);
}

const block = new Float32Array(2048).fill(0.2);
const reverbState = k.createReverbState(2, RATE);
const delayState = k.createDelayState(2, RATE, 2);
console.log("Reverb 1024 stereo frames, including backend copies (ms):", time(() => k.reverbBlock(reverbState, block, 2, RATE, { roomScale: 0.5, damping: 0.5, wetLevel: 0.33, dryLevel: 0.4 }), 101));
console.log("Delay 2 s, 1024 stereo frames, including backend copies (ms):", time(() => k.delayBlock(delayState, block, 2, RATE, { delaySeconds: 2, feedback: 0.5, mix: 0.5 }), 101));
