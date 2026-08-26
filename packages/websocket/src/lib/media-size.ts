/**
 * Pixel dimensions for a resolution tier + aspect ratio, mirroring the
 * generation nodes' `resolveImageSize` (packages/image-nodes): the tier sets
 * the short edge and the ratio scales the other edge.
 *
 * Providers whose image APIs are pixel-addressed (GPT Image's `size` field)
 * declare no `aspect_ratio` parameter, so a request carrying only the ratio
 * string renders at the model default — square. The direct-generation path
 * derives the same explicit dimensions the node layer always sent.
 */

/** Long-edge pixels per resolution tier (image-nodes' table). */
export const IMAGE_RESOLUTION_PX: Record<string, number> = {
  "1K": 1024,
  "2K": 2048,
  "4K": 4096
};

/** Ratio name → [w, h] units (image-nodes' table). */
const ASPECT_RATIOS: Record<string, [number, number]> = {
  "21:9": [21, 9],
  "16:9": [16, 9],
  "3:2": [3, 2],
  "7:5": [7, 5],
  "4:3": [4, 3],
  "5:4": [5, 4],
  "1:1": [1, 1],
  "9:16": [9, 16],
  "2:3": [2, 3],
  "5:7": [5, 7],
  "3:4": [3, 4],
  "4:5": [4, 5]
};

/**
 * Width/height for a resolution tier + aspect ratio, or null when no tier is
 * recognized (callers keep their current behavior then).
 */
export function resolveImageSize(
  resolution?: string | null,
  aspectRatio?: string | null
): { width: number; height: number } | null {
  const base = resolution ? (IMAGE_RESOLUTION_PX[resolution] ?? null) : null;
  if (base === null) return null;
  const [aw, ah] = ASPECT_RATIOS[aspectRatio ?? ""] ?? [1, 1];
  if (aw >= ah) {
    const height = base;
    return { width: Math.round((height * aw) / ah), height };
  }
  const width = base;
  return { width, height: Math.round((width * ah) / aw) };
}
