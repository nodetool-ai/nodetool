// Pure helpers for the editor's frame list. Frames are stored at the canonical
// SIZE (2048 samples each); the draw pad works at DRAW_N (256). Sampling between
// the two is only needed to display a frame in the pad / thumbnails and to write
// a *drawn* frame back. Untouched frames keep their exact SIZE samples (lossless
// select / reorder / assign).
import { SIZE } from '../../engine/wavetables';
import { MAX_FRAMES } from '../../engine/usertables';
import { DRAW_N } from './drawmodel';

// Sample `n` points out of a SIZE-sample frame for the pad / a thumbnail.
export function framePoints(frame: Float32Array, n: number = DRAW_N): number[] {
  const out = new Array(n).fill(0);
  const step = frame.length / n;
  for (let i = 0; i < n; i++) out[i] = frame[Math.floor(i * step)] || 0;
  return out;
}

// Insert a copy of frame `i` right after it; returns a new array. No-op at cap.
export function duplicateAt(frames: Float32Array[], i: number): Float32Array[] {
  if (i < 0 || i >= frames.length || frames.length >= MAX_FRAMES) return frames;
  const next = frames.slice();
  next.splice(i + 1, 0, frames[i].slice());
  return next;
}

// Remove frame `i`; returns a new array. Refuses to drop the last frame.
export function deleteAt(frames: Float32Array[], i: number): Float32Array[] {
  if (frames.length <= 1 || i < 0 || i >= frames.length) return frames;
  const next = frames.slice();
  next.splice(i, 1);
  return next;
}

// Move frame from `from` to index `to` (clamped); returns a new array.
export function moveFrame(frames: Float32Array[], from: number, to: number): Float32Array[] {
  if (from < 0 || from >= frames.length) return frames;
  const dest = Math.max(0, Math.min(frames.length - 1, to));
  if (dest === from) return frames;
  const next = frames.slice();
  const [f] = next.splice(from, 1);
  next.splice(dest, 0, f);
  return next;
}

// Split a packed user-table wave (frames*SIZE) into independent SIZE frames.
export function framesFromWave(wave: Float32Array, frameCount: number): Float32Array[] {
  const out: Float32Array[] = [];
  for (let f = 0; f < frameCount; f++) out.push(wave.slice(f * SIZE, (f + 1) * SIZE));
  return out;
}
