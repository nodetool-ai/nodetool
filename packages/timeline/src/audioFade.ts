/**
 * Clip fade envelopes.
 *
 * A clip's `fadeInMs`/`fadeOutMs` ramp its audio up from silence and back down
 * again, and `fadeInShape`/`fadeOutShape` say along which curve. The four
 * shapes are Final Cut's, and each one is exactly an ffmpeg `afade` curve, so
 * the browser preview and the rendered export hold the same gain at the same
 * millisecond rather than agreeing only in spirit.
 *
 * Progress `t` runs 0 (silence) to 1 (full clip volume) for both edges: a
 * fade-out reads the same curve backwards, which is what ffmpeg does too.
 */

export const CLIP_FADE_SHAPES = [
  "linear",
  "sCurve",
  "plus3dB",
  "minus3dB"
] as const;

export type ClipFadeShape = (typeof CLIP_FADE_SHAPES)[number];

/** The shape a clip with no authored one fades along. */
export const DEFAULT_CLIP_FADE_SHAPE: ClipFadeShape = "linear";

/** Fade length the "apply fades" command and a fresh handle drag author. */
export const DEFAULT_CLIP_FADE_MS = 500;

export function isClipFadeShape(value: unknown): value is ClipFadeShape {
  return (CLIP_FADE_SHAPES as readonly unknown[]).includes(value);
}

export function parseClipFadeShape(value: unknown): ClipFadeShape {
  return isClipFadeShape(value) ? value : DEFAULT_CLIP_FADE_SHAPE;
}

/**
 * Media whose clip has sound for a fade to ramp. A fade is an audio envelope:
 * the compositor draws nothing from it, so a clip with no audible signal
 * carries no fade.
 */
export const FADEABLE_MEDIA_TYPES = ["audio", "video", "midi"] as const;

export function canClipFade(mediaType: string): boolean {
  return (FADEABLE_MEDIA_TYPES as readonly string[]).includes(mediaType);
}

const clamp01 = (t: number): number =>
  t <= 0 || Number.isNaN(t) ? 0 : t >= 1 ? 1 : t;

/**
 * Gain multiplier at progress `t` through a fade, in [0, 1].
 *
 * - `linear` holds the midpoint 6 dB down, the straight ramp.
 * - `sCurve` eases both ends and crosses the midpoint where linear does.
 * - `plus3dB` is the equal-power quarter sine: 3 dB above linear at the
 *   midpoint, so a fade against a crossing one keeps a constant level.
 * - `minus3dB` is that curve's inverse, holding the midpoint below linear, so
 *   the quiet part of a fade lasts longer.
 */
export function fadeShapeGain(shape: ClipFadeShape, t: number): number {
  const x = clamp01(t);
  switch (shape) {
    case "sCurve":
      return (1 - Math.cos(x * Math.PI)) / 2;
    case "plus3dB":
      return Math.sin((x * Math.PI) / 2);
    case "minus3dB":
      return (2 / Math.PI) * Math.asin(x);
    case "linear":
    default:
      return x;
  }
}

/**
 * `steps + 1` gain values across `[from, to]` of the curve, for WebAudio's
 * `setValueCurveAtTime`. A fade resumed mid-way passes the progress it has
 * already covered as `from`, so the ramp continues the curve instead of
 * restarting it.
 */
export function sampleFadeShape(
  shape: ClipFadeShape,
  from: number,
  to: number,
  steps: number
): Float32Array {
  const count = Math.max(1, Math.floor(steps)) + 1;
  const start = clamp01(from);
  const end = clamp01(to);
  const curve = new Float32Array(count);
  for (let i = 0; i < count; i += 1) {
    curve[i] = fadeShapeGain(shape, start + ((end - start) * i) / (count - 1));
  }
  return curve;
}

/** The `afade` curve whose gain function matches `shape` exactly. */
export function ffmpegFadeCurve(shape: ClipFadeShape): string {
  switch (shape) {
    case "sCurve":
      return "hsin";
    case "plus3dB":
      return "qsin";
    case "minus3dB":
      return "iqsin";
    case "linear":
    default:
      return "tri";
  }
}

export interface ResolvedClipFades {
  fadeInMs: number;
  fadeOutMs: number;
  fadeInShape: ClipFadeShape;
  fadeOutShape: ClipFadeShape;
}

interface FadeFields {
  fadeInMs?: number;
  fadeOutMs?: number;
  fadeInShape?: string;
  fadeOutShape?: string;
}

/**
 * A clip's two fades as lengths that fit inside it: each is capped at the
 * clip, and two that would cross are each capped at half so they meet in the
 * middle instead. Every surface that draws or sounds a fade resolves it here,
 * so the overlay, the preview and the export clamp identically.
 */
export function resolveClipFades(
  clip: FadeFields,
  durationMs: number
): ResolvedClipFades {
  const span = Math.max(0, durationMs);
  const cap = (ms: number | undefined): number =>
    Math.min(span, Math.max(0, Number.isFinite(ms) ? (ms as number) : 0));

  let fadeInMs = cap(clip.fadeInMs);
  let fadeOutMs = cap(clip.fadeOutMs);
  if (fadeInMs + fadeOutMs > span) {
    const half = span / 2;
    fadeInMs = Math.min(fadeInMs, half);
    fadeOutMs = Math.min(fadeOutMs, half);
  }

  return {
    fadeInMs,
    fadeOutMs,
    fadeInShape: parseClipFadeShape(clip.fadeInShape),
    fadeOutShape: parseClipFadeShape(clip.fadeOutShape)
  };
}

/**
 * Envelope gain `msIntoClip` into a clip, in [0, 1]: the fade-in ramp, the
 * fade-out ramp, or 1 in the sustain between them. Outside the clip it is 0.
 */
export function clipFadeGain(
  clip: FadeFields,
  durationMs: number,
  msIntoClip: number
): number {
  if (msIntoClip < 0 || msIntoClip > durationMs) return 0;
  const fades = resolveClipFades(clip, durationMs);
  let gain = 1;
  if (fades.fadeInMs > 0 && msIntoClip < fades.fadeInMs) {
    gain = Math.min(
      gain,
      fadeShapeGain(fades.fadeInShape, msIntoClip / fades.fadeInMs)
    );
  }
  const fadeOutStartMs = durationMs - fades.fadeOutMs;
  if (fades.fadeOutMs > 0 && msIntoClip > fadeOutStartMs) {
    gain = Math.min(
      gain,
      fadeShapeGain(
        fades.fadeOutShape,
        (durationMs - msIntoClip) / fades.fadeOutMs
      )
    );
  }
  return gain;
}
