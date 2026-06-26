import type { CompositeSource } from "./types";

/**
 * Whether a composite source has decoded pixels ready to sample. Shared by the
 * WebGPU compositor (before uploading to a texture) and the Canvas2D fallback
 * (before `drawImage`).
 */
export function isSourceReady(source: CompositeSource): boolean {
  if (source instanceof HTMLVideoElement) {
    return source.readyState >= 2;
  }
  if (source instanceof HTMLImageElement) {
    return source.complete && source.naturalWidth > 0;
  }
  return source.width > 0;
}

/**
 * Whether to present the frame just composited. A scene that *has* layers but
 * drew none of them means every source is mid-decode — e.g. the incoming clip
 * at a cut is still seeking. Presenting then would flash opaque black (both
 * compositors seed the frame black), so we skip the present and the canvas
 * holds its last frame instead. An empty scene (no layers) still presents:
 * that's a genuine gap and should clear to black.
 */
export function shouldPresentFrame(
  layerCount: number,
  drawnCount: number
): boolean {
  return layerCount === 0 || drawnCount > 0;
}

/** Intrinsic pixel dimensions of a composite source. */
export function sourceDimensions(source: CompositeSource): {
  width: number;
  height: number;
} {
  if (source instanceof HTMLVideoElement) {
    return {
      width: source.videoWidth || 0,
      height: source.videoHeight || 0
    };
  }
  if (source instanceof HTMLImageElement) {
    return {
      width: source.naturalWidth || 0,
      height: source.naturalHeight || 0
    };
  }
  return { width: source.width, height: source.height };
}
