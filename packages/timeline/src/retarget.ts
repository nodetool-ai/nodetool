/**
 * Retargeting an approved cut to another aspect ratio.
 *
 * One 16:9 film becomes a 9:16 and a 1:1 without re-cutting anything: the
 * trims, the placements and the timing are already right, only the canvas
 * changes. {@link retargetSequence} derives that new sequence, and names every
 * clip the new frame crops so a director can decide which shots need a real
 * board of their own instead of discovering it in playback.
 *
 * ## The model
 *
 * A clip's `transform.scale` multiplies the compositor's **contain-fit** base:
 * 1 means "fit the canvas", whatever the canvas is. So a clip that filled a
 * 16:9 frame at scale 1 still fits — letterboxed — in a 9:16 frame at scale 1
 * with nothing else done. That is exactly `fit: "contain"`, which is why the
 * contain path leaves scale alone.
 *
 * `fit: "cover"` has to close the gap between contain-fit and cover-fit. For
 * media whose aspect is the source canvas's — which is what a shot rendered for
 * that board holds — that gap is `max(sx, sy) / min(sx, sy)`, where `sx`/`sy`
 * are the canvas dimension ratios. Media of another aspect (an imported logo,
 * say) is scaled by the same factor rather than measured, because a document
 * carries no reliable source size; the crop report is computed from the same
 * assumption and says so. Text, shape and group layers are rasterized at the
 * frame's own size, so the cover multiplier skips them — a title follows the
 * canvas through its font size instead.
 *
 * Positions are canvas pixels from the canvas centre, so they scale with their
 * own axis (`x * sx`, `y * sy`): the clip keeps its place in the frame while
 * its content scales uniformly about its own centre. `anchor` is normalized and
 * `rotation` is radians, so both ride through untouched.
 *
 * Keyframes are rescaled the same way as the base transform (R5): a curve on
 * `offsetX`/`positionX` is canvas pixels and moves with `sx`, one on
 * `scale`/`opacity` is a multiplier around 1 and does not. Rescaling only the
 * base would leave an animated clip drifting off the new frame mid-move.
 */

import { findKeyframeAnimation } from "./keyframes.js";
import { frameSizeForAspect } from "./storyboard.js";
import { createTimeOrderedUuid } from "./defaults.js";
import type { ClipAnimation } from "./animation/types.js";
import type {
  ClipTransform,
  TimelineClip,
  TimelineSequence
} from "./types.js";

/** Media types that draw a picture, and can therefore be cropped by the frame. */
const VISUAL_MEDIA = new Set(["video", "image", "overlay", "text", "shape", "group"]);

/**
 * Layers rasterized at the frame's own size rather than from media: authored
 * text (drawn into a canvas-sized raster), shapes (normalized 0..1 canvas
 * coordinates) and a precomposed group (a frame-sized surface). They already
 * follow the canvas, so the cover multiplier must not touch them — a text clip
 * scaled to "fill" would be drawn at 3x on top of its rescaled font size.
 */
const FRAME_NATIVE_MEDIA = new Set(["text", "shape", "group"]);

/** Curves in canvas pixels along x, and along y. Everything else is unitless. */
const X_PIXEL_PROPERTIES = new Set(["offsetX", "positionX"]);
const Y_PIXEL_PROPERTIES = new Set(["offsetY", "positionY"]);

/** Half a pixel of slack, so a clip that lands exactly on the edge is not cropped. */
const CROP_EPSILON = 0.5;

const IDENTITY_TRANSFORM: ClipTransform = {
  position: { x: 0, y: 0 },
  scale: { x: 1, y: 1 },
  rotation: 0,
  anchor: { x: 0.5, y: 0.5 }
};

export interface RetargetResult {
  /** A new sequence; the input is never mutated. */
  sequence: TimelineSequence;
  /** Clips whose picture no longer fits inside the frame, in document order. */
  croppedClipIds: string[];
}

/** How the canvas changed, and what that means for scale and font size. */
interface Rescale {
  /** Width and height ratios, new over old. */
  sx: number;
  sy: number;
  /** Multiplier applied to every clip's scale. */
  scale: number;
  /** Short-edge ratio — what a font size follows. */
  shortEdge: number;
}

function rescaleFor(
  from: { width: number; height: number },
  to: { width: number; height: number },
  fit: "cover" | "contain"
): Rescale {
  const sx = to.width / from.width;
  const sy = to.height / from.height;
  const spread = Math.max(sx, sy) / Math.min(sx, sy);
  return {
    sx,
    sy,
    scale: fit === "cover" ? spread : 1,
    shortEdge: Math.min(to.width, to.height) / Math.min(from.width, from.height)
  };
}

function retargetTransform(
  transform: ClipTransform,
  rescale: Rescale,
  frameNative: boolean
): ClipTransform {
  const factor = frameNative ? 1 : rescale.scale;
  return {
    ...transform,
    position: {
      x: transform.position.x * rescale.sx,
      y: transform.position.y * rescale.sy
    },
    scale: {
      x: transform.scale.x * factor,
      y: transform.scale.y * factor
    }
  };
}

/** The keyframe animation with its pixel-valued curves moved to the new canvas. */
function retargetKeyframes(
  animations: ClipAnimation[],
  keyframed: ClipAnimation,
  rescale: Rescale
): ClipAnimation[] {
  const custom = keyframed.custom;
  if (!custom) return animations;
  const curves = custom.curves.map((curve) => {
    const factor = X_PIXEL_PROPERTIES.has(curve.property)
      ? rescale.sx
      : Y_PIXEL_PROPERTIES.has(curve.property)
        ? rescale.sy
        : null;
    if (factor === null) return curve;
    return {
      ...curve,
      keyframes: curve.keyframes.map((kf) => ({ ...kf, value: kf.value * factor }))
    };
  });
  const next: ClipAnimation = {
    ...keyframed,
    custom: { ...custom, curves }
  };
  return animations.map((animation) =>
    animation === keyframed ? next : animation
  );
}

/**
 * Whether the clip's picture reaches past the new frame.
 *
 * A frame-native layer's box is the frame itself, times its scale. A media
 * layer's is the contain-fit of media with the *source* canvas's aspect into
 * the new canvas, times its scale — the same assumption the cover factor is
 * derived from. Media of some other shape is measured by that rule too, which
 * is the honest answer a document carrying no source size allows.
 */
function crops(
  transform: ClipTransform,
  frameNative: boolean,
  from: { width: number; height: number },
  to: { width: number; height: number }
): boolean {
  const fit = frameNative
    ? { width: to.width, height: to.height }
    : (() => {
        const containFit = Math.min(
          to.width / from.width,
          to.height / from.height
        );
        return {
          width: from.width * containFit,
          height: from.height * containFit
        };
      })();
  const width = fit.width * transform.scale.x;
  const height = fit.height * transform.scale.y;
  const centerX = to.width / 2 + transform.position.x;
  const centerY = to.height / 2 + transform.position.y;
  return (
    centerX - width / 2 < -CROP_EPSILON ||
    centerX + width / 2 > to.width + CROP_EPSILON ||
    centerY - height / 2 < -CROP_EPSILON ||
    centerY + height / 2 > to.height + CROP_EPSILON
  );
}

/**
 * A copy of `seq` on the canvas `aspectRatio` names.
 *
 * `cover` scales every clip to fill the new frame and reports what that crops;
 * `contain` letterboxes and reports only a clip that already reached past the
 * frame. Text clips rescale their font size with the short edge, so a title
 * keeps its weight against the picture instead of shrinking with the width.
 * The copy takes a fresh id and stamps `templateId` with the source's.
 */
export function retargetSequence(
  seq: TimelineSequence,
  aspectRatio: string,
  fit: "cover" | "contain"
): RetargetResult {
  const from = { width: seq.width, height: seq.height };
  const to = frameSizeForAspect(aspectRatio);
  const rescale = rescaleFor(from, to, fit);
  const croppedClipIds: string[] = [];

  const clips = seq.clips.map((clip) => {
    const frameNative = FRAME_NATIVE_MEDIA.has(clip.mediaType);
    const transform = retargetTransform(
      clip.transform ?? IDENTITY_TRANSFORM,
      rescale,
      frameNative
    );
    const next: TimelineClip = { ...clip, transform };

    const keyframed = clip.animations
      ? findKeyframeAnimation(clip)
      : undefined;
    if (clip.animations && keyframed) {
      next.animations = retargetKeyframes(clip.animations, keyframed, rescale);
    }

    if (clip.textStyle) {
      next.textStyle = {
        ...clip.textStyle,
        fontSizePx: clip.textStyle.fontSizePx * rescale.shortEdge
      };
    }

    if (
      VISUAL_MEDIA.has(clip.mediaType) &&
      crops(transform, frameNative, from, to)
    ) {
      croppedClipIds.push(clip.id);
    }
    return next;
  });

  const now = new Date().toISOString();
  return {
    sequence: {
      ...seq,
      id: createTimeOrderedUuid(),
      templateId: seq.id,
      width: to.width,
      height: to.height,
      clips,
      createdAt: now,
      updatedAt: now
    },
    croppedClipIds
  };
}
