/**
 * crop — the source rectangle a clip keeps, in one place.
 *
 * A crop is stored as four normalized insets ({@link ClipCrop}) and every
 * surface needs the same thing from them: the pixel rectangle to read, and
 * whether there is anything to do at all. Both compositors, the scene model
 * and the validator go through here, so a crop cannot round one way in the
 * preview and another in the export.
 *
 * **The kept rectangle becomes the clip's picture.** Cropping is applied to the
 * source before anything else looks at it — the contain fit is computed from
 * the cropped size, the transform places the cropped frame, the border radius
 * rounds its corners, and the masks and effects run on its pixels. That is what
 * separates a crop from a rect {@link ClipMask}, which hides part of a layer
 * that stays exactly where it was.
 */

import type { ClipCrop } from "./types.js";

/** A source rectangle in pixels, as {@link cropRectPx} resolves one. */
export interface CropRectPx {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Insets below this are rounding noise from a drag, not an edit. */
const CROP_EPSILON = 1e-4;

/**
 * Whether these insets ask for anything. Absent, all-zero, and degenerate
 * insets all answer false — a crop that keeps nothing is treated as no crop
 * rather than as a blank frame, which is the same call `cropRectPx` makes.
 */
export function hasCrop(crop: ClipCrop | undefined): crop is ClipCrop {
  if (!crop) return false;
  if (!isCropUsable(crop)) return false;
  return (
    crop.left > CROP_EPSILON ||
    crop.right > CROP_EPSILON ||
    crop.top > CROP_EPSILON ||
    crop.bottom > CROP_EPSILON
  );
}

/**
 * Whether the insets leave a picture. `left + right >= 1` on either axis keeps
 * nothing; the validator reports that as `crop_degenerate` and the renderers
 * fall back to the whole source, so a slider dragged to the end shows the
 * uncropped shot rather than a hole in the timeline.
 */
export function isCropUsable(crop: ClipCrop | undefined): boolean {
  if (!crop) return false;
  const { left, right, top, bottom } = crop;
  if (![left, right, top, bottom].every((v) => Number.isFinite(v) && v >= 0)) {
    return false;
  }
  return left + right < 1 - CROP_EPSILON && top + bottom < 1 - CROP_EPSILON;
}

/**
 * The source rectangle to read, in pixels, for a source of this size.
 *
 * The rectangle is snapped to whole pixels and is always at least 1×1 inside
 * the source: a GPU copy and a `drawImage` both reject a zero-sized or
 * out-of-bounds region, and a crop that rounds to nothing is an edit the user
 * cannot see anyway. Returns the whole source when there is no usable crop, so
 * a caller can hand the result straight to a draw without branching.
 */
export function cropRectPx(
  crop: ClipCrop | undefined,
  sourceWidth: number,
  sourceHeight: number
): CropRectPx {
  const full = { x: 0, y: 0, width: sourceWidth, height: sourceHeight };
  if (sourceWidth <= 0 || sourceHeight <= 0) return full;
  if (!hasCrop(crop)) return full;

  const x = Math.floor(crop.left * sourceWidth);
  const y = Math.floor(crop.top * sourceHeight);
  const width = Math.round((1 - crop.left - crop.right) * sourceWidth);
  const height = Math.round((1 - crop.top - crop.bottom) * sourceHeight);

  return {
    x: Math.min(x, sourceWidth - 1),
    y: Math.min(y, sourceHeight - 1),
    width: Math.max(1, Math.min(width, sourceWidth - x)),
    height: Math.max(1, Math.min(height, sourceHeight - y))
  };
}
