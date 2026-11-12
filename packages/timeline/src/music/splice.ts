/**
 * Splice a regenerated region into its parent take (MUSIC-MODE.md section 11,
 * GN-2).
 *
 * The backend's repaint output is close to the source outside the region and
 * not identical (MF5), so the new take is built here: a copy of the parent's
 * PCM with `[startFrame, endFrame)` replaced by the generated region. The
 * first and last 960 frames of that span (20 ms at 48 kHz) are equal-power
 * crossfades whose two gains square-sum to 1. Every sample outside the span is
 * copied from the parent without arithmetic, so it is bit-identical.
 *
 * PCM is interleaved stereo at 48 kHz, as in {@link cutFrames}.
 */

import { MUSIC_CHANNELS, pcmFrames } from "./cut.js";

/** Crossfade length at each end of a splice: 20 ms at 48 kHz. */
export const SPLICE_CROSSFADE_FRAMES = 960;

/**
 * The equal-power gain pair at frame `index` of an `length`-frame crossfade.
 * `fadeIn` rises from near 0 to near 1, `fadeOut` falls, and
 * `fadeIn² + fadeOut² = 1` at every frame. Sampling at frame centres keeps the
 * curve symmetric, so the fade-out end of a splice mirrors its fade-in end.
 */
export function equalPowerGains(
  index: number,
  length: number
): { fadeIn: number; fadeOut: number } {
  const angle = (Math.PI / 2) * ((index + 0.5) / length);
  return { fadeIn: Math.sin(angle), fadeOut: Math.cos(angle) };
}

export interface SpliceResult {
  /** The new take, as long as the parent. */
  samples: Float32Array;
  /** Frames of each of the two crossfades. */
  crossfadeFrames: number;
}

/**
 * Replace `[startFrame, endFrame)` of `parent` with `region`. A span shorter
 * than two full crossfades gets two crossfades of half the span each.
 */
export function spliceRegion(
  parent: Float32Array,
  region: Float32Array,
  startFrame: number,
  endFrame: number,
  crossfadeFrames = SPLICE_CROSSFADE_FRAMES
): SpliceResult {
  const parentFrames = pcmFrames(parent);
  const regionFrames = pcmFrames(region);
  if (
    !Number.isInteger(startFrame) ||
    !Number.isInteger(endFrame) ||
    startFrame < 0 ||
    endFrame > parentFrames ||
    endFrame <= startFrame
  ) {
    throw new Error(
      `Splice span ${startFrame}..${endFrame} does not lie inside a ${parentFrames}-frame parent`
    );
  }
  const span = endFrame - startFrame;
  if (regionFrames !== span) {
    throw new Error(
      `Splice region has ${regionFrames} frames for a ${span}-frame span`
    );
  }
  const fade = Math.min(Math.max(0, Math.floor(crossfadeFrames)), Math.floor(span / 2));
  const out = new Float32Array(parent);
  const base = startFrame * MUSIC_CHANNELS;
  out.set(region, base);
  for (let index = 0; index < fade; index += 1) {
    const { fadeIn, fadeOut } = equalPowerGains(index, fade);
    // Head: the parent fades out while the region fades in.
    const head = base + index * MUSIC_CHANNELS;
    // Tail: the region fades out while the parent fades back in.
    const tail = (endFrame - fade + index) * MUSIC_CHANNELS;
    const tailRegion = (span - fade + index) * MUSIC_CHANNELS;
    for (let channel = 0; channel < MUSIC_CHANNELS; channel += 1) {
      out[head + channel] =
        (parent[head + channel] ?? 0) * fadeOut +
        (region[index * MUSIC_CHANNELS + channel] ?? 0) * fadeIn;
      out[tail + channel] =
        (region[tailRegion + channel] ?? 0) * fadeOut +
        (parent[tail + channel] ?? 0) * fadeIn;
    }
  }
  return { samples: out, crossfadeFrames: fade };
}
