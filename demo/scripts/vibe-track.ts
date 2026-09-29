/**
 * Synthesizes the Vibe Race soundtrack: a 180 BPM drum-and-bass cut on the
 * same bar grid as the picture. Deterministic, no samples, no provider calls.
 *
 *   npx tsx scripts/vibe-track.ts   → public/vibe/track.wav
 */
import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { BPM, FPS, MUSIC_OFFSET_S, SECTION } from "../src/vibe/theme";

const SR = 44100;
const BEAT_S = 60 / BPM;
const BAR_S = BEAT_S * 4;
const S16 = BEAT_S / 4;
const LENGTH_S = SECTION.end * BAR_S + 1;
const N = Math.ceil(LENGTH_S * SR);

const L = new Float32Array(N);
const R = new Float32Array(N);
const send = new Float32Array(N); // reverb bus
const duck = new Float32Array(N).fill(1); // kick sidechain for bass and pads

let seed = 1234567;
const rand = (): number => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
};
const noise = (): number => rand() * 2 - 1;
const at = (bar: number, beat = 0, sixteenth = 0): number =>
  bar * BAR_S + beat * BEAT_S + sixteenth * S16;
const midi = (n: number): number => 440 * 2 ** ((n - 69) / 12);

function add(t: number, len: number, gain: number, pan: number, fx: number, fn: (s: number, i: number) => number): void {
  const start = Math.floor(t * SR);
  const n = Math.floor(len * SR);
  const gl = gain * Math.min(1, 1 - pan);
  const gr = gain * Math.min(1, 1 + pan);
  for (let i = 0; i < n; i++) {
    const k = start + i;
    if (k < 0 || k >= N) continue;
    const v = fn(i / SR, i);
    L[k] += v * gl;
    R[k] += v * gr;
    send[k] += v * gain * fx;
  }
}

// ---------- instruments ----------

function kick(t: number, gain = 1): void {
  let phase = 0;
  add(t, 0.42, gain, 0, 0.02, (s) => {
    const f = 42 + 120 * Math.exp(-s * 38);
    phase += (2 * Math.PI * f) / SR;
    const body = Math.sin(phase) * Math.exp(-s * 7.5);
    const click = s < 0.004 ? noise() * 0.6 : 0;
    return Math.tanh((body + click) * 1.6);
  });
  const start = Math.floor(t * SR);
  for (let i = 0; i < 0.22 * SR; i++) {
    const k = start + i;
    if (k < N) duck[k] = Math.min(duck[k], 0.25 + 0.75 * (i / (0.22 * SR)) ** 1.5);
  }
}

function snare(t: number, gain = 1): void {
  let hp = 0;
  let prev = 0;
  add(t, 0.3, gain, 0.05, 0.28, (s) => {
    const n = noise();
    hp = 0.82 * (hp + n - prev);
    prev = n;
    const tone = Math.sin(2 * Math.PI * 185 * s) * Math.exp(-s * 30);
    return (hp * 0.75 * Math.exp(-s * 15) + tone * 0.6) * 0.9;
  });
}

function hat(t: number, gain = 0.3, open = false, pan = 0.25): void {
  let prev = 0;
  let hp = 0;
  add(t, open ? 0.22 : 0.05, gain, pan, 0.06, (s) => {
    const n = noise();
    hp = 0.6 * (hp + n - prev);
    prev = n;
    return hp * Math.exp(-s * (open ? 14 : 70));
  });
}

/** Reese bass: two detuned saws through a one-pole low-pass, ducked by the kick. */
function bass(t: number, len: number, note: number, gain = 0.5, cutoff = 900): void {
  let p1 = 0;
  let p2 = 0;
  let lp = 0;
  const f = midi(note);
  const a = 1 - Math.exp((-2 * Math.PI * cutoff) / SR);
  const start = Math.floor(t * SR);
  add(t, len, gain, 0, 0, (s, i) => {
    p1 = (p1 + f / SR) % 1;
    p2 = (p2 + (f * 1.009) / SR) % 1;
    const saw = (p1 * 2 - 1 + (p2 * 2 - 1)) * 0.5;
    lp += a * (saw - lp);
    const sub = Math.sin(2 * Math.PI * f * 0.5 * s) * 0.6;
    const env = Math.min(1, s / 0.004) * Math.min(1, (len - s) / 0.02);
    return Math.tanh((lp + sub) * 1.8) * env * duck[start + i];
  });
}

/** Square-wave arp stab. */
function stab(t: number, note: number, gain = 0.12, pan = 0): void {
  const f = midi(note);
  add(t, 0.14, gain, pan, 0.35, (s) => {
    const sq = Math.sign(Math.sin(2 * Math.PI * f * s)) * 0.5 + Math.sin(2 * Math.PI * f * 2 * s) * 0.3;
    return sq * Math.exp(-s * 22);
  });
}

/** Warm pad chord, slow attack, ducked. */
function pad(t: number, len: number, notes: number[], gain = 0.08): void {
  const start = Math.floor(t * SR);
  add(t, len, gain, 0, 0.6, (s, i) => {
    let v = 0;
    for (const n of notes) {
      const f = midi(n);
      v += Math.sin(2 * Math.PI * f * s) + 0.35 * Math.sin(2 * Math.PI * f * 1.003 * s + 1);
    }
    const env = Math.min(1, s / 0.35) * Math.min(1, (len - s) / 0.6);
    return (v / notes.length) * env * (0.5 + 0.5 * duck[start + i]);
  });
}

/** White-noise riser with a climbing band and a rising saw. */
function riser(t: number, len: number, gain = 0.35): void {
  let lp = 0;
  let prev = 0;
  let hp = 0;
  let ph = 0;
  add(t, len, gain, 0, 0.3, (s) => {
    const x = s / len;
    const n = noise();
    hp = (0.98 - 0.5 * x) * (hp + n - prev);
    prev = n;
    lp += (0.05 + 0.6 * x) * (hp - lp);
    ph = (ph + (80 + 900 * x * x) / SR) % 1;
    return (lp * 0.9 + (ph * 2 - 1) * 0.12 * x) * x ** 1.6;
  });
}

/** Down-swept boom for drops. */
function impact(t: number, gain = 0.9): void {
  let ph = 0;
  let lp = 0;
  add(t, 2.2, gain, 0, 0.5, (s) => {
    const f = 30 + 90 * Math.exp(-s * 6);
    ph += (2 * Math.PI * f) / SR;
    lp += 0.08 * (noise() - lp);
    return (Math.sin(ph) * 0.9 + lp * 1.4) * Math.exp(-s * 2.2);
  });
}

/** Engine rev: a gritty saw sweeping between two pitches, like an upshift. */
function rev(t: number, len: number, f0: number, f1: number, gain = 0.16): void {
  let ph = 0;
  let lp = 0;
  add(t, len, gain, -0.1, 0.12, (s) => {
    const x = s / len;
    const f = f0 + (f1 - f0) * Math.sin((x * Math.PI) / 2);
    ph = (ph + f / SR) % 1;
    const raw = (ph * 2 - 1) + 0.4 * Math.sign(Math.sin(2 * Math.PI * f * 0.5 * s));
    lp += 0.25 * (raw - lp);
    const env = Math.min(1, s / 0.02) * Math.min(1, (len - s) / 0.08);
    return Math.tanh(lp * 2.2) * env;
  });
}

function beep(t: number, f: number, gain = 0.18): void {
  add(t, 0.22, gain, 0, 0.2, (s) => Math.sign(Math.sin(2 * Math.PI * f * s)) * 0.4 * Math.min(1, (0.22 - s) / 0.03));
}

function whoosh(t: number, len = 0.33, gain = 0.25): void {
  let lp = 0;
  add(t - len * 0.7, len, gain, 0, 0.15, (s) => {
    const x = s / len;
    lp += (0.02 + 0.3 * Math.sin(Math.PI * x)) * (noise() - lp);
    return lp * Math.sin(Math.PI * x) * 2.2;
  });
}

// ---------- arrangement ----------

const riff = [40, 40, 43, 38]; // E, E, G, D (bass, per half bar pairs)
const arpNotes = [64, 67, 71, 74, 76, 74, 71, 67];

function drumBar(bar: number, opts: { fill?: boolean; halftime?: boolean; ghost?: boolean } = {}): void {
  if (opts.halftime) {
    kick(at(bar, 0));
    snare(at(bar, 2));
    kick(at(bar, 3, 2), 0.8);
  } else {
    kick(at(bar, 0));
    kick(at(bar, 2, 2), 0.9);
    snare(at(bar, 1));
    snare(at(bar, 3));
    if (opts.ghost) {
      snare(at(bar, 1, 3), 0.25);
      snare(at(bar, 3, 1), 0.2);
    }
  }
  for (let i = 0; i < 16; i++) {
    const accent = i % 2 === 0 ? 0.28 : 0.14;
    hat(at(bar, 0, i), accent, i % 4 === 2, i % 2 === 0 ? 0.25 : -0.25);
  }
  if (opts.fill) {
    for (let i = 8; i < 16; i++) snare(at(bar, 0, i), 0.25 + (i - 8) * 0.08);
  }
}

function bassBar(bar: number, cutoff = 900): void {
  const n = riff[bar % riff.length];
  bass(at(bar, 0), BEAT_S * 1.5, n, 0.55, cutoff);
  bass(at(bar, 1, 2), BEAT_S * 0.5, n + 12, 0.35, cutoff * 1.6);
  bass(at(bar, 2, 2), BEAT_S * 1.5, n, 0.55, cutoff);
}

function arpBar(bar: number, gain = 0.1): void {
  for (let i = 0; i < 16; i++) {
    stab(at(bar, 0, i), arpNotes[(i + bar * 3) % arpNotes.length], gain, i % 2 ? 0.35 : -0.35);
  }
}

// Bars 0-1: idle engine, start-light beeps, riser, rev.
rev(at(0), BAR_S * 1.2, 38, 46, 0.12);
for (let b = 0; b < 4; b++) beep(at(1, b), 660, 0.14);
riser(at(1), BAR_S, 0.4);
rev(at(1, 2), BEAT_S * 2, 60, 240, 0.2);

// Bar 2: drop.
impact(at(SECTION.drop), 0.9);
beep(at(SECTION.drop), 1320, 0.2);

for (let bar = SECTION.drop; bar < SECTION.music; bar++) {
  const beforeBreak = bar === SECTION.music - 1;
  drumBar(bar, { fill: beforeBreak || bar === SECTION.backgrounds - 1, ghost: bar >= SECTION.backgrounds });
  bassBar(bar, bar >= SECTION.parallax ? 1400 : 900);
  if (bar >= SECTION.props) arpBar(bar, bar >= SECTION.parallax ? 0.11 : 0.07);
}

// Bars 11-13: breakdown under the game's own music.
for (let bar = SECTION.music; bar < SECTION.sfx; bar++) {
  for (let i = 0; i < 16; i += 2) hat(at(bar, 0, i), 0.07, false);
}
pad(at(SECTION.music), BAR_S * 3, [52, 55, 59], 0.035);
riser(at(SECTION.sfx - 1), BAR_S, 0.4);
for (let i = 8; i < 16; i++) snare(at(SECTION.sfx - 1, 0, i), 0.15 + (i - 8) * 0.07);
rev(at(SECTION.sfx - 1, 2), BEAT_S * 2, 70, 300, 0.18);

// Bars 14-15: half-time pocket for the sound effects.
impact(at(SECTION.sfx), 0.6);
for (let bar = SECTION.sfx; bar < SECTION.build; bar++) {
  drumBar(bar, { halftime: true, fill: bar === SECTION.build - 1 });
  bass(at(bar, 0), BAR_S * 0.9, riff[bar % 4], 0.45, 600);
}

// Bars 16-21: full throttle.
impact(at(SECTION.build), 0.7);
for (let bar = SECTION.build; bar < SECTION.finish; bar++) {
  drumBar(bar, { ghost: true, fill: bar === SECTION.run - 1 || bar === SECTION.finish - 1 });
  bassBar(bar, 1600);
  arpBar(bar, 0.12);
  if (bar >= SECTION.run) pad(at(bar), BAR_S, [64, 67, 71], 0.03);
}
riser(at(SECTION.finish - 1), BAR_S, 0.45);

// Upshifts on section changes.
for (const bar of [SECTION.sprites, SECTION.backgrounds, SECTION.parallax, SECTION.build, SECTION.run]) {
  whoosh(at(bar), 0.4, 0.3);
  rev(at(bar) - BEAT_S, BEAT_S, 110, 420, 0.1);
}

// Bar 22: finish impact, then the tail and the end card.
impact(at(SECTION.finish), 1);
kick(at(SECTION.finish), 1.1);
pad(at(SECTION.finish), BAR_S * 2.2, [52, 59, 64, 67], 0.06);
for (let bar = SECTION.finish; bar < SECTION.endCard; bar++) {
  for (let i = 0; i < 16; i += 2) hat(at(bar, 0, i), 0.08 * (1 - (bar - SECTION.finish) * 0.3), false);
}
impact(at(SECTION.endCard), 0.6);
kick(at(SECTION.endCard), 0.9);
pad(at(SECTION.endCard), BAR_S * 3, [52, 59, 63, 66], 0.07);
beep(at(SECTION.endCard), 1320, 0.1);

// ---------- reverb (Schroeder) ----------

function reverb(input: Float32Array, spread: number): Float32Array {
  const out = new Float32Array(N);
  const combs = [1557, 1617, 1491, 1422].map((d) => d + spread);
  for (const d of combs) {
    const buf = new Float32Array(d);
    let idx = 0;
    let lp = 0;
    for (let i = 0; i < N; i++) {
      const y = buf[idx];
      lp = y * 0.7 + lp * 0.3;
      buf[idx] = input[i] + lp * 0.8;
      idx = (idx + 1) % d;
      out[i] += y * 0.25;
    }
  }
  for (const d of [225 + spread, 556 + spread]) {
    const buf = new Float32Array(d);
    let idx = 0;
    for (let i = 0; i < N; i++) {
      const b = buf[idx];
      const y = -out[i] + b;
      buf[idx] = out[i] + b * 0.5;
      out[i] = y;
      idx = (idx + 1) % d;
    }
  }
  return out;
}

const wetL = reverb(send, 0);
const wetR = reverb(send, 23);

// ---------- master ----------

const fadeStart = (SECTION.end - 0.6) * BAR_S;
let peak = 0;
for (let i = 0; i < N; i++) {
  const t = i / SR;
  const fade = t > fadeStart ? Math.max(0, 1 - (t - fadeStart) / (LENGTH_S - 1 - fadeStart)) : 1;
  L[i] = Math.tanh((L[i] + wetL[i] * 0.35) * 1.1) * fade;
  R[i] = Math.tanh((R[i] + wetR[i] * 0.35) * 1.1) * fade;
  peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
}
const norm = 0.89 / peak;

const data = Buffer.alloc(44 + N * 4);
data.write("RIFF", 0);
data.writeUInt32LE(36 + N * 4, 4);
data.write("WAVE", 8);
data.write("fmt ", 12);
data.writeUInt32LE(16, 16);
data.writeUInt16LE(1, 20);
data.writeUInt16LE(2, 22);
data.writeUInt32LE(SR, 24);
data.writeUInt32LE(SR * 4, 28);
data.writeUInt16LE(4, 32);
data.writeUInt16LE(16, 34);
data.write("data", 36);
data.writeUInt32LE(N * 4, 40);
for (let i = 0; i < N; i++) {
  data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, L[i] * norm)) * 32767), 44 + i * 4);
  data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, R[i] * norm)) * 32767), 46 + i * 4);
}
const outPath = fileURLToPath(new URL("../public/vibe/track.wav", import.meta.url));
writeFileSync(outPath, data);
console.log(`wrote ${outPath} (${LENGTH_S.toFixed(1)} s)`);

// ---------- spectrum of the game's own music, for the visualizer ----------


const MUSIC_FRAMES = 300;
const BANDS = 48;
const musicPath = fileURLToPath(new URL("../public/vibe/kindle-music.mp3", import.meta.url));
const pcm = spawnSync("ffmpeg", ["-v", "error", "-ss", String(MUSIC_OFFSET_S), "-i", musicPath, "-t", String(MUSIC_FRAMES / FPS + 0.2), "-ac", "1", "-ar", String(SR), "-f", "f32le", "-"], {
  maxBuffer: 1 << 28,
});
if (pcm.status !== 0) throw new Error(`ffmpeg failed: ${pcm.stderr.toString()}`);
const samples = new Float32Array(pcm.stdout.buffer, pcm.stdout.byteOffset, pcm.stdout.byteLength / 4);
const win = 2048;
const edges = Array.from({ length: BANDS + 1 }, (_, i) => 40 * (10000 / 40) ** (i / BANDS));

/** In-place radix-2 FFT. */
function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    for (let i = 0; i < n; i += len) {
      for (let k = 0; k < len / 2; k++) {
        const wr = Math.cos(ang * k);
        const wi = Math.sin(ang * k);
        const ur = re[i + k];
        const ui = im[i + k];
        const vr = re[i + k + len / 2] * wr - im[i + k + len / 2] * wi;
        const vi = re[i + k + len / 2] * wi + im[i + k + len / 2] * wr;
        re[i + k] = ur + vr;
        im[i + k] = ui + vi;
        re[i + k + len / 2] = ur - vr;
        im[i + k + len / 2] = ui - vi;
      }
    }
  }
}

const bands: number[][] = [];
for (let f = 0; f < MUSIC_FRAMES; f++) {
  const start = Math.floor((f / FPS) * SR);
  const re = new Float64Array(win);
  const im = new Float64Array(win);
  for (let i = 0; i < win; i++) {
    re[i] = (samples[start + i] ?? 0) * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (win - 1)));
  }
  fft(re, im);
  const row: number[] = [];
  for (let b = 0; b < BANDS; b++) {
    const lo = Math.max(1, Math.floor((edges[b] * win) / SR));
    const hi = Math.max(lo + 1, Math.ceil((edges[b + 1] * win) / SR));
    let power = 0;
    for (let k = lo; k < hi; k++) power += re[k] * re[k] + im[k] * im[k];
    // Tilt up the highs so the ring does not collapse to the bass.
    row.push(Math.sqrt(power / (hi - lo)) * (1 + b / 12));
  }
  bands.push(row);
}
// Normalize each band to its own 98th percentile over time, then map
// -30 dB..0 dB to 0..1, so every band moves with the music.
const bandPeak = Array.from({ length: BANDS }, (_, b) => {
  const sorted = bands.map((row) => row[b]).sort((x, y) => x - y);
  return Math.max(1e-9, sorted[Math.floor(sorted.length * 0.98)]);
});
const normalized = bands.map((row) =>
  row.map((v, b) => Number(Math.min(1, Math.max(0, 1 + (20 * Math.log10(Math.max(v, 1e-9) / bandPeak[b])) / 30)).toFixed(3))),
);
const bandsPath = fileURLToPath(new URL("../public/vibe/music-bands.json", import.meta.url));
writeFileSync(bandsPath, JSON.stringify(normalized));
console.log(`wrote ${bandsPath} (${MUSIC_FRAMES} frames × ${BANDS} bands)`);
