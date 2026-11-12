// The same kernel in JavaScript. Runs in Node (V8) and in qjs (QuickJS-ng).
const FRAMES = 512, NB = 8;
const BLOCKS = (typeof BLOCKS_OVERRIDE === "number") ? BLOCKS_OVERRIDE : 22000, WARMUP = Math.floor(BLOCKS / 11);
const input = new Float32Array(FRAMES * 2), buf = new Float32Array(FRAMES * 2);
const coef = new Float32Array(NB * 5), state = new Float32Array(2 * NB * 2);
let s = 12345;
for (let i = 0; i < FRAMES * 2; i++) { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; input[i] = (s >>> 8) / 8388608.0 - 1.0; }
{
  const w0 = 2 * Math.PI * 1000 / 44100, alpha = Math.sin(w0) / (2 * 0.7071), cw = Math.cos(w0), a0 = 1 + alpha;
  for (let k = 0; k < NB; k++) {
    coef[k*5] = ((1 - cw) / 2) / a0; coef[k*5+1] = (1 - cw) / a0; coef[k*5+2] = coef[k*5];
    coef[k*5+3] = (-2 * cw) / a0; coef[k*5+4] = (1 - alpha) / a0;
  }
}
function process(buf, frames, nb, coef, state) {
  for (let ch = 0; ch < 2; ch++) for (let k = 0; k < nb; k++) {
    const c = k * 5, b0 = coef[c], b1 = coef[c+1], b2 = coef[c+2], a1 = coef[c+3], a2 = coef[c+4];
    const sp = (ch * nb + k) * 2; let z1 = state[sp], z2 = state[sp+1];
    const end = frames * 2;
    for (let p = ch; p < end; p += 2) { const x = buf[p], y = b0 * x + z1; z1 = b1 * x - a1 * y + z2; z2 = b2 * x - a2 * y; buf[p] = y; }
    state[sp] = z1; state[sp+1] = z2;
  }
}
function report(name, d, checksum, per) {
  let sum = 0; for (let i = 0; i < d.length; i++) sum += d[i];
  const sorted = Array.from(d).sort((a, b) => a - b), n = sorted.length, f = (v) => v.toFixed(2).padStart(9);
  console.log(name.padEnd(16) + " mean " + f(sum / n) + " us  p50 " + f(sorted[n >> 1]) + "  p99 " + f(sorted[Math.floor(n * 0.99)]) +
    "  max " + f(sorted[n - 1]) + "  ns/sample " + ((sum / n) * 1000 / per).toFixed(3).padStart(7) + "  checksum " + checksum.toFixed(6));
}
function runJs(name) {
  const d = new Float64Array(BLOCKS - WARMUP);
  for (let b = 0; b < BLOCKS; b++) {
    const t0 = performance.now(); buf.set(input); process(buf, FRAMES, NB, coef, state);
    const dt = (performance.now() - t0) * 1000; if (b >= WARMUP) d[b - WARMUP] = dt;
  }
  let cs = 0; for (let i = 0; i < FRAMES * 2; i++) cs += buf[i];
  report(name + " biquad", d, cs, FRAMES * 2 * NB);
  const MIXN = 1024, MIXES = 16, ma = new Float32Array(MIXN), mb = new Float32Array(MIXN), md = new Float32Array(MIXN);
  for (let i = 0; i < MIXN; i++) { ma[i] = input[i]; mb[i] = input[MIXN - 1 - i]; }
  function mix(dst, a, b, n, ga, gb) { for (let i = 0; i < n; i++) dst[i] = a[i] * ga + b[i] * gb; }
  for (let b = 0; b < BLOCKS; b++) {
    const t0 = performance.now(); for (let m = 0; m < MIXES; m++) mix(md, ma, mb, MIXN, 0.7, 0.3);
    const dt = (performance.now() - t0) * 1000; if (b >= WARMUP) d[b - WARMUP] = dt;
  }
  cs = 0; for (let i = 0; i < MIXN; i++) cs += md[i];
  report(name + " mix", d, cs, MIXN * MIXES);
}
globalThis.__bench = { FRAMES, NB, BLOCKS, WARMUP, input, coef, report, runJs };
