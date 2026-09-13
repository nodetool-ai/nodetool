import {
  fadeShapeGain,
  resolveClipFades,
  type ClipFadeShape,
  type TimelineClip
} from "@nodetool-ai/timeline";

interface FadeMarker {
  widthPx: number;
  shape: ClipFadeShape;
  /** The ramp itself, as an SVG path in the overlay's 0..1 unit space. */
  rampPath: string;
  /** The ramp closed against the top of the clip — the signal it removes. */
  fillPath: string;
}

interface TransitionMarker {
  widthPx: number;
  type: string;
}

export interface ClipFadeMarkers {
  fadeIn?: FadeMarker;
  fadeOut?: FadeMarker;
  transitionIn?: TransitionMarker;
}

/** Below this the ramp is sub-pixel noise; leave it out. */
const MIN_MARKER_WIDTH_PX = 2;

/** Points along a curved ramp. A straight one needs only its two ends. */
const CURVE_SAMPLES = 24;

/**
 * The ramp as a path in unit space: x runs across the fade, y is 1 at silence
 * and 0 at full volume, so the drawn line sits where the signal's ceiling is.
 * A fade-out reads the same curve backwards, which is how it sounds and how
 * the export renders it.
 */
function rampPath(shape: ClipFadeShape, edge: "in" | "out"): string {
  const samples = shape === "linear" ? 1 : CURVE_SAMPLES;
  const points: string[] = [];
  for (let i = 0; i <= samples; i += 1) {
    const x = i / samples;
    const gain = fadeShapeGain(shape, edge === "in" ? x : 1 - x);
    points.push(`${x.toFixed(4)},${(1 - gain).toFixed(4)}`);
  }
  return `M ${points.join(" L ")}`;
}

/**
 * Pixel geometry for a clip's fade ramps and incoming transition at the
 * current zoom. Fade lengths come from `resolveClipFades`, so the picture
 * clamps two crossing fades exactly where the preview and the export do.
 */
export function deriveClipFadeMarkers(
  clip: Pick<
    TimelineClip,
    "fadeInMs" | "fadeOutMs" | "fadeInShape" | "fadeOutShape" | "transitionIn"
  >,
  msPerPx: number,
  clipWidthPx: number
): ClipFadeMarkers {
  const toPx = (ms: number): number =>
    Math.min(clipWidthPx, Math.max(0, ms / msPerPx));

  // The clip's own duration in the same units the caller measured its width
  // in, so the resolver clamps against what is on screen.
  const fades = resolveClipFades(clip, clipWidthPx * msPerPx);
  const fadeInPx = toPx(fades.fadeInMs);
  const fadeOutPx = toPx(fades.fadeOutMs);
  const transitionPx = toPx(clip.transitionIn?.durationMs ?? 0);

  const marker = (widthPx: number, edge: "in" | "out"): FadeMarker | undefined => {
    if (widthPx < MIN_MARKER_WIDTH_PX) return undefined;
    const shape = edge === "in" ? fades.fadeInShape : fades.fadeOutShape;
    const ramp = rampPath(shape, edge);
    return { widthPx, shape, rampPath: ramp, fillPath: `${ramp} L 1,0 L 0,0 Z` };
  };

  return {
    fadeIn: marker(fadeInPx, "in"),
    fadeOut: marker(fadeOutPx, "out"),
    transitionIn:
      clip.transitionIn && transitionPx >= MIN_MARKER_WIDTH_PX
        ? { widthPx: transitionPx, type: clip.transitionIn.type }
        : undefined
  };
}
