/**
 * Geometry for "keep aspect ratio" node resizing.
 *
 * A node that previews media (image / video / canvas) is more than the media:
 * it also has a header, and — depending on the node — sliders, dropdowns and
 * output handles stacked above or below the preview. Locking the *whole node*
 * box ratio (React Flow's built-in `keepAspectRatio`) scales that fixed chrome
 * along with the media and letterboxes the image.
 *
 * Instead we keep the *media box's* ratio and treat the chrome as a fixed
 * offset measured from the live DOM (see `measureNodeMedia`):
 *
 *   nodeWidth  = mediaWidth  + sidePad   (left/right padding around the media)
 *   nodeHeight = mediaHeight + chrome    (header + controls + output handles)
 *
 * so the relationship the resize preserves is
 *
 *   (nodeWidth - sidePad) / (nodeHeight - chrome) === ratio
 *
 * which works whether the node is image-only (chrome ≈ header) or image + a
 * stack of sliders (chrome = header + sliders + outputs).
 */

export interface MediaBox {
  /** Intrinsic media aspect ratio (width / height). */
  ratio: number;
  /** Horizontal chrome: node width minus media-box width (flow units). */
  sidePad: number;
  /** Vertical chrome: node height minus media-box height (flow units). */
  chrome: number;
}

export interface ResizeBounds {
  minWidth: number;
  maxWidth: number;
  minHeight: number;
}

export interface ResizeDelta {
  startWidth: number;
  startHeight: number;
  /** Pointer movement since drag start, in flow (un-zoomed) units. */
  deltaX: number;
  deltaY: number;
}

export interface ResizeResult {
  width: number;
  height: number;
}

const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max);

const nodeHeightForWidth = (width: number, box: MediaBox): number =>
  Math.max(1, width - box.sidePad) / box.ratio + box.chrome;

const nodeWidthForHeight = (height: number, box: MediaBox): number =>
  Math.max(1, height - box.chrome) * box.ratio + box.sidePad;

/**
 * Resize that keeps the media's aspect ratio. Whichever axis the pointer moved
 * most drives the resize; the other axis is derived so the media box keeps
 * `ratio`. Both axes are clamped to the bounds, re-deriving the partner axis so
 * the ratio survives the clamp.
 */
export function computeAspectResize(
  delta: ResizeDelta,
  box: MediaBox,
  bounds: ResizeBounds
): ResizeResult {
  const { startWidth, startHeight, deltaX, deltaY } = delta;
  const { minWidth, maxWidth, minHeight } = bounds;

  let width: number;
  let height: number;

  if (Math.abs(deltaX) >= Math.abs(deltaY)) {
    width = clamp(startWidth + deltaX, minWidth, maxWidth);
    height = nodeHeightForWidth(width, box);
    if (height < minHeight) {
      height = minHeight;
      width = clamp(nodeWidthForHeight(height, box), minWidth, maxWidth);
    }
  } else {
    height = Math.max(startHeight + deltaY, minHeight);
    width = nodeWidthForHeight(height, box);
    if (width < minWidth || width > maxWidth) {
      width = clamp(width, minWidth, maxWidth);
      height = Math.max(nodeHeightForWidth(width, box), minHeight);
    }
  }

  return { width: Math.round(width), height: Math.round(height) };
}

/** Free resize (both axes follow the pointer) — used when no media is present. */
export function computeFreeResize(
  delta: ResizeDelta,
  bounds: ResizeBounds
): ResizeResult {
  return {
    width: Math.round(
      clamp(delta.startWidth + delta.deltaX, bounds.minWidth, bounds.maxWidth)
    ),
    height: Math.round(Math.max(delta.startHeight + delta.deltaY, bounds.minHeight))
  };
}
