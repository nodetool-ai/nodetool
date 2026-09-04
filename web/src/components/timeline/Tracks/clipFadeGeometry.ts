import type { TimelineClip } from "@nodetool-ai/timeline";

interface FadeMarker {
  widthPx: number;
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

/**
 * Pixel geometry for a clip's fade ramps and incoming transition at the
 * current zoom. Each width is `ms / msPerPx` clamped to the clip; when the two
 * fades together would exceed the clip, each is clamped to half so they meet
 * in the middle rather than cross.
 */
export function deriveClipFadeMarkers(
  clip: Pick<TimelineClip, "fadeInMs" | "fadeOutMs" | "transitionIn">,
  msPerPx: number,
  clipWidthPx: number
): ClipFadeMarkers {
  const toPx = (ms: number): number =>
    Math.min(clipWidthPx, Math.max(0, ms / msPerPx));

  let fadeInPx = toPx(clip.fadeInMs ?? 0);
  let fadeOutPx = toPx(clip.fadeOutMs ?? 0);
  if (fadeInPx + fadeOutPx > clipWidthPx) {
    const half = clipWidthPx / 2;
    fadeInPx = Math.min(fadeInPx, half);
    fadeOutPx = Math.min(fadeOutPx, half);
  }

  const transitionPx = toPx(clip.transitionIn?.durationMs ?? 0);

  return {
    fadeIn: fadeInPx >= MIN_MARKER_WIDTH_PX ? { widthPx: fadeInPx } : undefined,
    fadeOut:
      fadeOutPx >= MIN_MARKER_WIDTH_PX ? { widthPx: fadeOutPx } : undefined,
    transitionIn:
      clip.transitionIn && transitionPx >= MIN_MARKER_WIDTH_PX
        ? { widthPx: transitionPx, type: clip.transitionIn.type }
        : undefined
  };
}
