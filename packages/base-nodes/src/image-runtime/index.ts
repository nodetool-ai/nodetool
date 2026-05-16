/**
 * ImageRuntime — runtime-polymorphic seam for cheap image operations.
 *
 * The same node `process()` calls run server-side (sharp via Node implementation)
 * and browser-side (OffscreenCanvas via browser implementation). This is the
 * single source of truth for what cheap image ops exist; per-environment
 * implementations supply how they're executed.
 *
 * Used by:
 *   - Server: `ResizeNode.process()` calls `context.image.resize(...)`. The
 *     ProcessingContext at runtime carries the node implementation.
 *   - Browser: a live-preview hook in `web/src/preview/` calls the same
 *     interface against `image-runtime/browser` to update node body previews
 *     in real time as the user drags a slider, without a server round-trip.
 *
 * Adding a new cheap op = add a method here + implement in both files. The
 * node author writes one `process()` that's drift-free across environments.
 */

/**
 * Minimal in-memory image representation. The runtime takes and returns this
 * shape; mapping to/from `ImageRef` (which may carry `uri`/`asset_id`) is the
 * caller's responsibility.
 */
export interface ImageBytes {
  /** Raw encoded bytes (PNG/JPEG/WEBP). Empty when no image is loaded. */
  data: Uint8Array;
  /** Optional pixel width hint (post-encode). */
  width?: number;
  /** Optional pixel height hint (post-encode). */
  height?: number;
  /** Optional MIME type (e.g. "image/png"). Defaults to image/png on output. */
  mimeType?: string;
}

export interface ResizeOptions {
  width?: number;
  height?: number;
  /** Resampling filter hint. Implementations may pick the closest match. */
  filter?: "nearest" | "bilinear" | "lanczos";
  /** When true, preserve aspect ratio and fit within `width`×`height`. */
  fit?: boolean;
}

export interface CropOptions {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface RotateOptions {
  /** Degrees clockwise. */
  angle: number;
  /** Background color for revealed corners on non-multiple-of-90 rotations. */
  background?: string;
}

export interface FlipOptions {
  horizontal?: boolean;
  vertical?: boolean;
}

export interface BlurOptions {
  /** Kernel kind. */
  kind?: "box" | "gaussian";
  /** Radius in pixels (typical range 1–100). */
  radius: number;
}

/**
 * The runtime contract. Every method is async and returns a fresh `ImageBytes`.
 * Empty `image.data` short-circuits to a no-op (return image unchanged).
 *
 * Implementations are expected to be pure: no global state, no caching that
 * outlives the call. The frontend hook may invoke these dozens of times per
 * second while a slider is dragged.
 */
export interface ImageRuntime {
  resize(image: ImageBytes, opts: ResizeOptions): Promise<ImageBytes>;
  crop(image: ImageBytes, opts: CropOptions): Promise<ImageBytes>;
  rotate(image: ImageBytes, opts: RotateOptions): Promise<ImageBytes>;
  flip(image: ImageBytes, opts: FlipOptions): Promise<ImageBytes>;
  blur(image: ImageBytes, opts: BlurOptions): Promise<ImageBytes>;
}

/** Sentinel for an empty image (no bytes). Identity-comparable. */
export const EMPTY_IMAGE: ImageBytes = Object.freeze({
  data: new Uint8Array()
}) as unknown as ImageBytes;

/**
 * Convenience: true when the image has no bytes (acts as a no-op signal).
 */
export const isEmpty = (image: ImageBytes): boolean => image.data.byteLength === 0;
