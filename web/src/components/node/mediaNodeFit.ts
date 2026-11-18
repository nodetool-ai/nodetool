/**
 * Fit a media node's height to the aspect ratio of the media it shows.
 *
 * The node keeps its width. The media box takes the media's ratio, and the
 * chrome around it (header, controls, outputs) stays a fixed offset, as in
 * `mediaAspectResize`.
 */
import type { MediaBox } from "./mediaAspectResize";
import { isNumber } from "../../utils/typePredicates";

/** Narrowest and widest media ratio (width / height) a node takes. */
export const MIN_MEDIA_RATIO = 1 / 3;
export const MAX_MEDIA_RATIO = 3;

export interface MediaDimensions {
  width: number;
  height: number;
}

const isPositive = (value: unknown): value is number =>
  isNumber(value) && Number.isFinite(value) && value > 0;

/** Media ratio clamped to the supported range, or null for bad dimensions. */
export function clampedMediaRatio(dims: MediaDimensions): number | null {
  if (!isPositive(dims.width) || !isPositive(dims.height)) {
    return null;
  }
  const ratio = dims.width / dims.height;
  return Math.min(Math.max(ratio, MIN_MEDIA_RATIO), MAX_MEDIA_RATIO);
}

/**
 * Width and height from a media ref (`ImageRef`, `VideoRef`, asset), read
 * from the ref itself or from its asset metadata. Null when neither has both.
 */
export function mediaDimensionsFromRef(value: unknown): MediaDimensions | null {
  if (value === null || typeof value !== "object") {
    return null;
  }
  const ref = value as {
    width?: unknown;
    height?: unknown;
    metadata?: Record<string, unknown> | null;
  };
  if (isPositive(ref.width) && isPositive(ref.height)) {
    return { width: ref.width, height: ref.height };
  }
  const meta = ref.metadata;
  if (meta && isPositive(meta.width) && isPositive(meta.height)) {
    return { width: meta.width, height: meta.height };
  }
  return null;
}

/** Node height for the node width so that the media box has `ratio`. */
export function fitNodeHeight(
  nodeWidth: number,
  ratio: number,
  box: Pick<MediaBox, "sidePad" | "chrome">,
  minHeight: number
): number {
  const mediaWidth = Math.max(1, nodeWidth - box.sidePad);
  return Math.round(Math.max(minHeight, mediaWidth / ratio + box.chrome));
}

/** Ratio key stored on the node so one content is fitted only once. */
export const mediaRatioKey = (ratio: number): number =>
  Math.round(ratio * 1000) / 1000;
