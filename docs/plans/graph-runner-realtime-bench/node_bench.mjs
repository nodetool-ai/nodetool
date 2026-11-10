import { readFileSync } from "node:fs";
await import(new URL("./kernel.js", import.meta.url));
const { FRAMES, NB, BLOCKS, WARMUP, input, coef, report, runJs } = globalThis.__bench;
runJs("V8 JS");
const { instance } = await WebAssembly.instantiate(readFileSync(process.argv[2]));
const mem = new Float32Array(instance.exports.memory.buffer), BUF = 0, COEF = 8192, STATE = 9216;
mem.set(coef, COEF / 4);
const d = new Float64Array(BLOCKS - WARMUP);
for (let b = 0; b < BLOCKS; b++) {
  const t0 = performance.now(); mem.set(input, BUF / 4); instance.exports.process(BUF, FRAMES, NB, COEF, STATE);
  const dt = (performance.now() - t0) * 1000; if (b >= WARMUP) d[b - WARMUP] = dt;
}
let cs = 0; for (let i = 0; i < FRAMES * 2; i++) cs += mem[BUF / 4 + i];
report("V8 wasm biquad", d, cs, FRAMES * 2 * NB);
const MD = 16384, MA = 20480, MB = 24576, MIXN = 1024, MIXES = 16;
for (let i = 0; i < MIXN; i++) { mem[MA / 4 + i] = input[i]; mem[MB / 4 + i] = input[MIXN - 1 - i]; }
for (const name of ["mix", "mix_simd"]) {
  const fn = instance.exports[name];
  for (let b = 0; b < BLOCKS; b++) {
    const t0 = performance.now(); for (let m = 0; m < MIXES; m++) fn(MD, MA, MB, MIXN, 0.7, 0.3);
    const dt = (performance.now() - t0) * 1000; if (b >= WARMUP) d[b - WARMUP] = dt;
  }
  cs = 0; for (let i = 0; i < MIXN; i++) cs += mem[MD / 4 + i];
  report("V8 wasm " + name, d, cs, MIXN * MIXES);
}
const t0 = performance.now(); for (let i = 0; i < 1e6; i++) instance.exports.process(BUF, 0, 0, COEF, STATE);
console.log("V8 wasm empty call: " + ((performance.now() - t0) * 1e6 / 1e6).toFixed(1) + " ns");
