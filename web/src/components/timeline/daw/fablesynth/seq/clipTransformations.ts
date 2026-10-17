import type { RuntimeClipLibraryEntry } from './clipLibrary';
import {
  bytesPerBar, dr1Idx, DR1_PADS, MAX_BARS, NOTE_STRIDE, noteIdx, STEPS_PER_BAR,
  WT_POLY_LANES, wtNoteIdx,
} from './protocol';
import { transposeNotePattern } from './clipLibraryActions';

export type ClipTransform =
  | { kind: 'transpose'; semitones: number }
  | { kind: 'rotate'; steps: number }
  | { kind: 'reverse' }
  | { kind: 'density'; factor: 0.5 | 2 }
  | { kind: 'accent-shift'; steps: number }
  | { kind: 'humanize'; seed: number; amount?: number }
  | { kind: 'extract-bar'; bar: number }
  | { kind: 'repeat'; bars: number }
  | { kind: 'dr-lane-remap'; lanes: readonly number[] };

const mod = (n: number, d: number) => ((n % d) + d) % d;

function assertInt(value: number, label: string): void {
  if (!Number.isInteger(value)) throw new RangeError(`${label} must be an integer`);
}

function stepOffset(entry: RuntimeClipLibraryEntry, step: number, lane = 0): number {
  const bar = Math.floor(step / STEPS_PER_BAR);
  const local = step % STEPS_PER_BAR;
  return entry.machine === 'DR1' ? dr1Idx(bar, lane, local)
    : entry.machine === 'WT1' ? wtNoteIdx(bar, local, lane) : noteIdx(bar, local);
}

const laneCount = (entry: RuntimeClipLibraryEntry): number =>
  entry.machine === 'DR1' ? DR1_PADS : entry.machine === 'WT1' ? WT_POLY_LANES : 1;

function rotate(entry: RuntimeClipLibraryEntry, steps: number): Uint8Array {
  assertInt(steps, 'rotation');
  const total = entry.bars * STEPS_PER_BAR;
  const out = new Uint8Array(entry.pattern.length);
  const lanes = laneCount(entry);
  const stride = entry.machine === 'DR1' ? 1 : NOTE_STRIDE;
  for (let lane = 0; lane < lanes; lane++) for (let src = 0; src < total; src++) {
    const from = stepOffset(entry, src, lane), to = stepOffset(entry, mod(src + steps, total), lane);
    out.set(entry.pattern.subarray(from, from + stride), to);
  }
  return out;
}

function reverse(entry: RuntimeClipLibraryEntry): Uint8Array {
  const total = entry.bars * STEPS_PER_BAR;
  const out = new Uint8Array(entry.pattern.length);
  const lanes = laneCount(entry);
  const stride = entry.machine === 'DR1' ? 1 : NOTE_STRIDE;
  for (let lane = 0; lane < lanes; lane++) for (let src = 0; src < total; src++) {
    const from = stepOffset(entry, src, lane), to = stepOffset(entry, total - 1 - src, lane);
    out.set(entry.pattern.subarray(from, from + stride), to);
  }
  return out;
}

function density(entry: RuntimeClipLibraryEntry, factor: 0.5 | 2): Uint8Array {
  const out = entry.pattern.slice(), total = entry.bars * STEPS_PER_BAR;
  const lanes = laneCount(entry);
  const stride = entry.machine === 'DR1' ? 1 : NOTE_STRIDE;
  for (let lane = 0; lane < lanes; lane++) {
    let activeIndex = 0;
    if (factor === 0.5) {
      for (let step = 0; step < total; step++) {
        const o = stepOffset(entry, step, lane), on = entry.machine === 'DR1' ? out[o] !== 0 : (out[o] & 1) !== 0;
        if (on && activeIndex++ % 2 === 1) {
          if (entry.machine === 'DR1') out[o] = 0;
          else out[o] &= ~1;
        }
      }
    } else {
      const original = entry.pattern;
      for (let step = 0; step < total; step++) {
        const o = stepOffset(entry, step, lane), on = entry.machine === 'DR1' ? original[o] !== 0 : (original[o] & 1) !== 0;
        const next = stepOffset(entry, mod(step + 1, total), lane);
        const nextOn = entry.machine === 'DR1' ? original[next] !== 0 : (original[next] & 1) !== 0;
        if (on && !nextOn) out.set(original.subarray(o, o + stride), next);
      }
    }
  }
  return out;
}

function accentShift(entry: RuntimeClipLibraryEntry, steps: number): Uint8Array {
  assertInt(steps, 'accent shift');
  const out = entry.pattern.slice(), total = entry.bars * STEPS_PER_BAR;
  const lanes = laneCount(entry);
  for (let lane = 0; lane < lanes; lane++) {
    const accents: number[] = [];
    for (let step = 0; step < total; step++) {
      const o = stepOffset(entry, step, lane);
      if (entry.machine === 'DR1' ? entry.pattern[o] === 2 : (entry.pattern[o] & 2) !== 0) accents.push(step);
      if (entry.machine === 'DR1') { if (out[o] === 2) out[o] = 1; } else out[o] &= ~2;
    }
    for (const source of accents) {
      // Move to the nearest active event at or after the shifted grid position.
      const target = mod(source + steps, total);
      for (let n = 0; n < total; n++) {
        const o = stepOffset(entry, mod(target + n, total), lane);
        const on = entry.machine === 'DR1' ? out[o] !== 0 : (out[o] & 1) !== 0;
        if (on) { if (entry.machine === 'DR1') out[o] = 2; else out[o] |= 2; break; }
      }
    }
  }
  return out;
}

function random01(seed: number, index: number): number {
  let x = (seed | 0) ^ Math.imul(index + 1, 0x9e3779b1);
  x ^= x >>> 16; x = Math.imul(x, 0x7feb352d); x ^= x >>> 15; x = Math.imul(x, 0x846ca68b); x ^= x >>> 16;
  return (x >>> 0) / 0x100000000;
}

function humanize(entry: RuntimeClipLibraryEntry, seed: number, amount = 0.25): Uint8Array {
  assertInt(seed, 'humanize seed');
  if (!(amount >= 0 && amount <= 1)) throw new RangeError('humanize amount must be from 0 to 1');
  const out = entry.pattern.slice();
  if (entry.machine === 'DR1') {
    for (let i = 0; i < out.length; i++) if (out[i] && random01(seed, i) < amount) out[i] = out[i] === 2 ? 1 : 2;
  } else {
    for (let i = 0; i < out.length; i += NOTE_STRIDE) if ((out[i] & 1) && random01(seed, i) < amount) out[i] ^= 2;
  }
  return out;
}

function remapDr(entry: RuntimeClipLibraryEntry, lanes: readonly number[]): Uint8Array {
  if (entry.machine !== 'DR1') throw new Error('lane remap is only available for DR1 clips');
  if (lanes.length !== DR1_PADS || lanes.some((lane) => !Number.isInteger(lane) || lane < 0 || lane >= DR1_PADS)) {
    throw new RangeError('lane map must contain 16 valid destination lanes');
  }
  const out = new Uint8Array(entry.pattern.length);
  for (let bar = 0; bar < entry.bars; bar++) for (let lane = 0; lane < DR1_PADS; lane++) {
    for (let step = 0; step < STEPS_PER_BAR; step++) out[dr1Idx(bar, lanes[lane], step)] = entry.pattern[dr1Idx(bar, lane, step)];
  }
  return out;
}

/** Apply a transformation to a fresh byte buffer. The source entry is never mutated. */
export function transformClip(entry: RuntimeClipLibraryEntry, transform: ClipTransform): RuntimeClipLibraryEntry {
  let pattern: Uint8Array, bars = entry.bars, root = entry.root;
  switch (transform.kind) {
    case 'transpose':
      if (entry.machine === 'DR1') throw new Error('transpose is only available for note clips');
      pattern = transposeNotePattern(entry.pattern, transform.semitones);
      if (root !== undefined) root = mod(root + transform.semitones, 12);
      break;
    case 'rotate': pattern = rotate(entry, transform.steps); break;
    case 'reverse': pattern = reverse(entry); break;
    case 'density': pattern = density(entry, transform.factor); break;
    case 'accent-shift': pattern = accentShift(entry, transform.steps); break;
    case 'humanize': pattern = humanize(entry, transform.seed, transform.amount); break;
    case 'extract-bar': {
      assertInt(transform.bar, 'bar');
      if (transform.bar < 0 || transform.bar >= entry.bars) throw new RangeError('bar is out of range');
      const size = bytesPerBar(entry.machine);
      pattern = entry.pattern.slice(transform.bar * size, (transform.bar + 1) * size); bars = 1; break;
    }
    case 'repeat': {
      assertInt(transform.bars, 'bars');
      if (transform.bars < 1 || transform.bars > MAX_BARS) throw new RangeError(`bars must be from 1 to ${MAX_BARS}`);
      const size = bytesPerBar(entry.machine), out = new Uint8Array(transform.bars * size);
      for (let bar = 0; bar < transform.bars; bar++) {
        const sourceBar = bar % entry.bars;
        out.set(entry.pattern.subarray(sourceBar * size, (sourceBar + 1) * size), bar * size);
      }
      pattern = out; bars = transform.bars; break;
    }
    case 'dr-lane-remap': pattern = remapDr(entry, transform.lanes); break;
  }
  const result = { ...entry, bars, pattern, tags: [...entry.tags] };
  return transform.kind === 'transpose' && root !== undefined ? { ...result, root } : result;
}

/** Common semantic conversion: swap kick/snare and closed/open-hat pairs. */
export const DR_REMAP_ALTERNATE_KIT = [1, 0, 3, 2, 5, 4, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15] as const;
