// DR-1 procedural drum tables. Each spec renders FRAMES time-domain single
// cycles which buildUserTable runs through the shared FFT band-limit + mip
// pipeline — so drum tables anti-alias exactly like every other table.

import { buildUserTable, FRAMES, SIZE, type GeneratedTable } from '../../engine/wavetables';

type FrameFn = (t: number, out: Float32Array) => void;

const thud: FrameFn = (t, out) => {
  for (let i = 0; i < SIZE; i++) {
    const x = i / SIZE;
    let s = Math.sin(2 * Math.PI * x);
    s += t * 0.6 * Math.sin(2 * Math.PI * 2 * x + 0.6);
    s += t * t * 0.45 * Math.sin(2 * Math.PI * 3 * x + 1.2);
    out[i] = Math.tanh(s * (1 + t * 1.8));
  }
};

const crack: FrameFn = (t, out) => {
  for (let i = 0; i < SIZE; i++) {
    const x = i / SIZE;
    let s = 0;
    for (let k = 1; k <= 31; k += 2) {
      const comb = 0.5 + 0.5 * Math.cos(k * 0.9 + t * 5.2);
      const roll = Math.exp(-Math.pow((k - 5 - t * 10) / 7, 2));
      s += comb * roll * Math.sin(2 * Math.PI * k * x + Math.sin(k * 7.31) * 1.4);
    }
    out[i] = s;
  }
};

const TINE_K = [1, 4, 7, 11, 16, 22];
const tine: FrameFn = (t, out) => {
  for (let i = 0; i < SIZE; i++) {
    const x = i / SIZE;
    let s = 0;
    for (let j = 0; j < TINE_K.length; j++) {
      const a = Math.pow(Math.max(t, 0.001), 0.3 * j) / (j + 1);
      s += a * Math.sin(2 * Math.PI * TINE_K[j] * x + j * j * 1.7);
    }
    out[i] = s;
  }
};

const grit: FrameFn = (t, out) => {
  const hold = 2 + Math.round(30 * t);
  let held = 0;
  for (let i = 0; i < SIZE; i++) {
    if (i % hold === 0) {
      const r = Math.sin((i + 1) * 127.1) * 43758.5453;
      held = (r - Math.floor(r)) * 2 - 1;
    }
    // blend toward a sine at t=0 so frame 0 is tonal, not static
    const x = i / SIZE;
    out[i] = held * t + Math.sin(2 * Math.PI * x) * (1 - t);
  }
};

const SPECS: { name: string; fn: FrameFn }[] = [
  { name: 'THUD', fn: thud },
  { name: 'CRACK', fn: crack },
  { name: 'TINE', fn: tine },
  { name: 'GRIT', fn: grit },
];

export function generateDrumTables(): GeneratedTable[] {
  return SPECS.map((spec) => {
    const frames: Float32Array[] = [];
    for (let f = 0; f < FRAMES; f++) {
      const buf = new Float32Array(SIZE);
      spec.fn(f / (FRAMES - 1), buf);
      frames.push(buf);
    }
    return buildUserTable(spec.name, frames);
  });
}
