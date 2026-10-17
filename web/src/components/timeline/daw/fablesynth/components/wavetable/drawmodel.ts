// Pure helpers for the draw pad: seed shapes, snap quantization, and the
// smooth brush. DRAW_N points in [-1, 1], one cycle left->right.
export const DRAW_N = 256;
export type Seed = 'sine' | 'saw' | 'square' | 'tri';
export type Brush = 'pen' | 'smooth';

export function seedShape(kind: Seed): number[] {
  const out = new Array(DRAW_N).fill(0);
  for (let i = 0; i < DRAW_N; i++) {
    const x = i / DRAW_N;
    if (kind === 'sine') out[i] = Math.sin(2 * Math.PI * x);
    else if (kind === 'saw') out[i] = 2 * x - 1;
    else if (kind === 'square') out[i] = x < 0.5 ? 0.9 : -0.9;
    else out[i] = 1 - 4 * Math.abs(x - 0.5); // tri
  }
  return out;
}

// Quantize a value in [-1, 1] to the nearest 1/8 step when snap is on.
export function snapValue(v: number, snap: boolean): number {
  return snap ? Math.round(v * 8) / 8 : v;
}

// 5-tap moving average around `idx` (radius `rad`), mutating `pts` in place.
export function smoothAround(pts: number[], idx: number, rad = 7): void {
  const src = pts.slice();
  const n = pts.length;
  for (let i = Math.max(0, idx - rad); i <= Math.min(n - 1, idx + rad); i++) {
    let s = 0, cnt = 0;
    for (let j = -2; j <= 2; j++) {
      const k = i + j;
      if (k >= 0 && k < n) { s += src[k]; cnt++; }
    }
    pts[i] = s / cnt;
  }
}
