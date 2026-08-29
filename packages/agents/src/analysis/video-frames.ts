/**
 * Video analysis math — pure functions over RGBA pixels, no decoder.
 *
 * A decoded frame arrives as `Uint8Array` in RGBA order; everything here reads
 * one or two of those and returns numbers. Decoding and frame sampling live in
 * `media-decode.ts`, so these can be tested on pixel buffers built by hand.
 *
 * Two decisions worth stating. Luma is Rec. 709 (`0.2126/0.7152/0.0722`),
 * matching what every HD codec and NLE calls brightness. And a cut is decided
 * from a *histogram* distance rather than a pixel difference: a whip pan
 * changes every pixel without changing the shot, while a cut changes the
 * distribution. The per-pixel difference is still reported next to it as the
 * motion score, which is the question the histogram cannot answer.
 */

/** Analysis is done on a downscaled frame this many pixels wide. */
export const ANALYSIS_WIDTH = 64;

/** Analysis is done on a downscaled frame this many pixels tall. */
export const ANALYSIS_HEIGHT = 36;

/** Bins in the luma histogram a scene cut is decided from. */
export const HISTOGRAM_BINS = 64;

/** Rec. 709 luma of one 8-bit RGB triple, 0..1. */
export function luma(red: number, green: number, blue: number): number {
  return (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255;
}

/** What one frame looks like, before anything is compared to anything. */
export interface FrameStats {
  /** Mean Rec. 709 luma, 0..1. */
  readonly brightness: number;
  /** Standard deviation of luma — flat grey is 0, high key/low key is high. */
  readonly contrast: number;
  /** Mean HSV saturation, 0..1. */
  readonly saturation: number;
  /** Mean channel values, 0..255. */
  readonly meanRgb: readonly [number, number, number];
  /** Share of pixels whose luma is at or above 0.98. */
  readonly clippedHighlights: number;
  /** Share of pixels whose luma is at or below 0.02. */
  readonly crushedShadows: number;
}

/** Brightness, contrast, saturation and clipping of one RGBA frame. */
export function frameStats(
  rgba: Uint8Array,
  width: number,
  height: number
): FrameStats {
  const pixels = width * height;
  if (pixels <= 0) {
    return {
      brightness: 0,
      contrast: 0,
      saturation: 0,
      meanRgb: [0, 0, 0],
      clippedHighlights: 0,
      crushedShadows: 0
    };
  }
  let sumLuma = 0;
  let sumLumaSquared = 0;
  let sumSaturation = 0;
  let sumRed = 0;
  let sumGreen = 0;
  let sumBlue = 0;
  let bright = 0;
  let dark = 0;
  for (let index = 0; index < pixels; index += 1) {
    const offset = index * 4;
    const red = rgba[offset] ?? 0;
    const green = rgba[offset + 1] ?? 0;
    const blue = rgba[offset + 2] ?? 0;
    const value = luma(red, green, blue);
    sumLuma += value;
    sumLumaSquared += value * value;
    sumRed += red;
    sumGreen += green;
    sumBlue += blue;
    const max = Math.max(red, green, blue);
    const min = Math.min(red, green, blue);
    sumSaturation += max > 0 ? (max - min) / max : 0;
    if (value >= 0.98) bright += 1;
    else if (value <= 0.02) dark += 1;
  }
  const meanLuma = sumLuma / pixels;
  return {
    brightness: meanLuma,
    contrast: Math.sqrt(
      Math.max(0, sumLumaSquared / pixels - meanLuma * meanLuma)
    ),
    saturation: sumSaturation / pixels,
    meanRgb: [sumRed / pixels, sumGreen / pixels, sumBlue / pixels],
    clippedHighlights: bright / pixels,
    crushedShadows: dark / pixels
  };
}

/**
 * Box-filter an RGBA frame down to `targetWidth` × `targetHeight` luma values.
 *
 * The comparisons that follow run on this, not on the full frame: a 1080p
 * difference is dominated by sensor noise and costs two megapixels of work per
 * pair, while 64×36 keeps the structure a cut destroys and none of the grain.
 */
export function downscaleLuma(
  rgba: Uint8Array,
  width: number,
  height: number,
  targetWidth = ANALYSIS_WIDTH,
  targetHeight = ANALYSIS_HEIGHT
): Float32Array {
  const out = new Float32Array(targetWidth * targetHeight);
  if (width <= 0 || height <= 0) return out;
  for (let ty = 0; ty < targetHeight; ty += 1) {
    const y0 = Math.floor((ty * height) / targetHeight);
    const y1 = Math.max(y0 + 1, Math.floor(((ty + 1) * height) / targetHeight));
    for (let tx = 0; tx < targetWidth; tx += 1) {
      const x0 = Math.floor((tx * width) / targetWidth);
      const x1 = Math.max(x0 + 1, Math.floor(((tx + 1) * width) / targetWidth));
      let sum = 0;
      let count = 0;
      for (let y = y0; y < Math.min(y1, height); y += 1) {
        for (let x = x0; x < Math.min(x1, width); x += 1) {
          const offset = (y * width + x) * 4;
          sum += luma(
            rgba[offset] ?? 0,
            rgba[offset + 1] ?? 0,
            rgba[offset + 2] ?? 0
          );
          count += 1;
        }
      }
      out[ty * targetWidth + tx] = count > 0 ? sum / count : 0;
    }
  }
  return out;
}

/** A normalized luma histogram of a downscaled frame. */
export function lumaHistogram(
  values: Float32Array,
  bins = HISTOGRAM_BINS
): Float32Array {
  const histogram = new Float32Array(bins);
  if (values.length === 0) return histogram;
  for (let index = 0; index < values.length; index += 1) {
    const bin = Math.min(
      bins - 1,
      Math.max(0, Math.floor((values[index] ?? 0) * bins))
    );
    histogram[bin] += 1;
  }
  for (let bin = 0; bin < bins; bin += 1) histogram[bin] /= values.length;
  return histogram;
}

/**
 * Total-variation distance between two normalized histograms, 0..1.
 *
 * 0 means identical distributions; 1 means they share no bin. A hard cut
 * typically lands above 0.3, a dissolve climbs gradually, and camera movement
 * inside one shot stays low — which is why this and not a pixel difference
 * decides a cut.
 */
export function histogramDistance(a: Float32Array, b: Float32Array): number {
  const bins = Math.min(a.length, b.length);
  let sum = 0;
  for (let bin = 0; bin < bins; bin += 1) {
    sum += Math.abs((a[bin] ?? 0) - (b[bin] ?? 0));
  }
  return sum / 2;
}

/** Mean absolute luma difference between two downscaled frames, 0..1. */
export function motionScore(a: Float32Array, b: Float32Array): number {
  const count = Math.min(a.length, b.length);
  if (count === 0) return 0;
  let sum = 0;
  for (let index = 0; index < count; index += 1) {
    sum += Math.abs((a[index] ?? 0) - (b[index] ?? 0));
  }
  return sum / count;
}

/** One colour in the palette, with the share of the frame it covers. */
export interface PaletteEntry {
  readonly hex: string;
  readonly share: number;
  readonly rgb: readonly [number, number, number];
}

/** `#rrggbb` for an 8-bit triple. */
function toHex(red: number, green: number, blue: number): string {
  const channel = (value: number): string =>
    Math.max(0, Math.min(255, Math.round(value)))
      .toString(16)
      .padStart(2, "0");
  return `#${channel(red)}${channel(green)}${channel(blue)}`;
}

/**
 * The `count` most common colours in a frame, by 4×4×4-bit quantization.
 *
 * Quantizing to 4 bits per channel (4096 buckets) and reporting each winning
 * bucket's *mean* colour is what makes the answer stable: naming the exact
 * modal pixel would return a different hex on every frame of the same shot.
 */
export function dominantColors(
  rgba: Uint8Array,
  width: number,
  height: number,
  count = 5
): PaletteEntry[] {
  const pixels = width * height;
  if (pixels <= 0) return [];
  const totals = new Map<
    number,
    { red: number; green: number; blue: number; n: number }
  >();
  for (let index = 0; index < pixels; index += 1) {
    const offset = index * 4;
    const red = rgba[offset] ?? 0;
    const green = rgba[offset + 1] ?? 0;
    const blue = rgba[offset + 2] ?? 0;
    const key = ((red >> 4) << 8) | ((green >> 4) << 4) | (blue >> 4);
    const bucket = totals.get(key);
    if (bucket) {
      bucket.red += red;
      bucket.green += green;
      bucket.blue += blue;
      bucket.n += 1;
    } else {
      totals.set(key, { red, green, blue, n: 1 });
    }
  }
  return [...totals.values()]
    .sort((a, b) => b.n - a.n)
    .slice(0, count)
    .map((bucket) => {
      const rgb: [number, number, number] = [
        bucket.red / bucket.n,
        bucket.green / bucket.n,
        bucket.blue / bucket.n
      ];
      return {
        hex: toHex(rgb[0], rgb[1], rgb[2]),
        share: bucket.n / pixels,
        rgb
      };
    });
}

/** One sampled frame after analysis, before it is compared with its neighbour. */
export interface AnalyzedFrame {
  readonly time: number;
  readonly stats: FrameStats;
  readonly luma: Float32Array;
  readonly histogram: Float32Array;
}

/** What changed between two consecutive sampled frames. */
export interface FrameTransition {
  readonly time: number;
  readonly motion: number;
  readonly histogramDistance: number;
}

/** The motion and histogram series over a sampled sequence. */
export function frameTransitions(
  frames: readonly AnalyzedFrame[]
): FrameTransition[] {
  const transitions: FrameTransition[] = [];
  for (let index = 1; index < frames.length; index += 1) {
    const previous = frames[index - 1];
    const current = frames[index];
    transitions.push({
      time: current.time,
      motion: motionScore(previous.luma, current.luma),
      histogramDistance: histogramDistance(
        previous.histogram,
        current.histogram
      )
    });
  }
  return transitions;
}

/** One detected shot: a span between two cuts. */
export interface Shot {
  readonly index: number;
  readonly start: number;
  readonly end: number;
  readonly duration: number;
  /** Mean brightness across the sampled frames inside the shot. */
  readonly brightness: number;
  /** Mean motion across the shot — a static lockoff is near zero. */
  readonly motion: number;
}

/**
 * Cut times: transitions whose histogram distance clears `threshold`.
 *
 * The sampling rate bounds the accuracy — a cut is placed at the first sampled
 * frame that belongs to the new shot, so at 4 fps a reported time is within
 * 250 ms of the real one. `minShotSeconds` suppresses a second cut inside one
 * dissolve, which otherwise reports a fade as a burst of shots.
 */
export function detectCuts(
  transitions: readonly FrameTransition[],
  threshold = 0.3,
  minShotSeconds = 0.4
): number[] {
  const cuts: number[] = [];
  let lastCut = Number.NEGATIVE_INFINITY;
  for (const transition of transitions) {
    if (transition.histogramDistance < threshold) continue;
    if (transition.time - lastCut < minShotSeconds) continue;
    cuts.push(transition.time);
    lastCut = transition.time;
  }
  return cuts;
}

/** Group sampled frames into shots at the given cut times. */
export function shotsFromCuts(
  frames: readonly AnalyzedFrame[],
  transitions: readonly FrameTransition[],
  cuts: readonly number[],
  duration: number
): Shot[] {
  if (frames.length === 0) return [];
  const bounds = [0, ...cuts, duration];
  const shots: Shot[] = [];
  for (let index = 0; index + 1 < bounds.length; index += 1) {
    const start = bounds[index];
    const end = bounds[index + 1];
    if (end <= start) continue;
    const inside = frames.filter(
      (frame) => frame.time >= start && frame.time < end
    );
    const moving = transitions.filter(
      (transition) => transition.time > start && transition.time < end
    );
    shots.push({
      index: shots.length,
      start,
      end,
      duration: end - start,
      brightness:
        inside.length > 0
          ? inside.reduce((sum, frame) => sum + frame.stats.brightness, 0) /
            inside.length
          : 0,
      motion:
        moving.length > 0
          ? moving.reduce((sum, transition) => sum + transition.motion, 0) /
            moving.length
          : 0
    });
  }
  return shots;
}

/** A run of frames sharing a property — all black, or all identical. */
export interface FrameRun {
  readonly start: number;
  readonly end: number;
  readonly duration: number;
}

/** Runs of consecutive frames for which `predicate` holds, by frame index. */
export function runsOf(
  frames: readonly AnalyzedFrame[],
  predicate: (index: number) => boolean,
  frameDuration: number,
  minSeconds: number
): FrameRun[] {
  const runs: FrameRun[] = [];
  let start: number | null = null;
  const close = (endTime: number): void => {
    if (start === null) return;
    const duration = endTime - start;
    if (duration >= minSeconds) runs.push({ start, end: endTime, duration });
    start = null;
  };
  for (let index = 0; index < frames.length; index += 1) {
    if (predicate(index)) {
      start ??= frames[index].time;
    } else {
      close(frames[index].time);
    }
  }
  const last = frames.at(-1);
  if (last) close(last.time + frameDuration);
  return runs;
}
