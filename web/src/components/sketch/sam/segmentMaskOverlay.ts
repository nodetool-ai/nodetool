/**
 * segmentMaskOverlay – drawing utilities for segmentation mask preview overlay.
 *
 * Provides functions to render semi-transparent colored overlays on the
 * canvas showing the detected object masks, and to generate cutout data URLs
 * by compositing a source image through a binary/soft mask.
 */

/** Distinct palette for mask overlays – high-contrast, semi-transparent. */
const MASK_OVERLAY_COLORS = [
  "rgba(255, 80, 80, 0.35)",   // red
  "rgba(80, 180, 255, 0.35)",  // blue
  "rgba(80, 255, 120, 0.35)",  // green
  "rgba(255, 200, 60, 0.35)",  // yellow
  "rgba(200, 80, 255, 0.35)",  // purple
  "rgba(255, 140, 60, 0.35)",  // orange
  "rgba(60, 255, 220, 0.35)",  // cyan
  "rgba(255, 80, 180, 0.35)"   // pink
];

/** Outline colors matching the overlay fills. */
const MASK_OUTLINE_COLORS = [
  "rgba(255, 80, 80, 0.8)",
  "rgba(80, 180, 255, 0.8)",
  "rgba(80, 255, 120, 0.8)",
  "rgba(255, 200, 60, 0.8)",
  "rgba(200, 80, 255, 0.8)",
  "rgba(255, 140, 60, 0.8)",
  "rgba(60, 255, 220, 0.8)",
  "rgba(255, 80, 180, 0.8)"
];

/** Get overlay color for a given mask index. */
export function getMaskOverlayColor(maskIndex: number): string {
  return MASK_OVERLAY_COLORS[maskIndex % MASK_OVERLAY_COLORS.length];
}

/** Get outline color for a given mask index. */
export function getMaskOutlineColor(maskIndex: number): string {
  return MASK_OUTLINE_COLORS[maskIndex % MASK_OUTLINE_COLORS.length];
}

/**
 * Render segmentation mask bounds as colored rectangles on an overlay context.
 *
 * Used for quick bounding-box preview while masks are loading or when
 * the full mask data hasn't arrived yet.
 */
export function drawMaskBoundsOverlay(
  ctx: CanvasRenderingContext2D,
  masks: ReadonlyArray<{
    bounds: { x: number; y: number; width: number; height: number };
    label?: string;
  }>,
  zoom: number
): void {
  for (let i = 0; i < masks.length; i++) {
    const mask = masks[i];
    const { x, y, width, height } = mask.bounds;
    const fillColor = getMaskOverlayColor(i);
    const strokeColor = getMaskOutlineColor(i);

    // Filled semi-transparent rect
    ctx.fillStyle = fillColor;
    ctx.fillRect(x, y, width, height);

    // Outline
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 2 / zoom;
    ctx.strokeRect(x, y, width, height);

    // Label
    if (mask.label) {
      const fontSize = Math.max(10, 14 / zoom);
      ctx.font = `${fontSize}px sans-serif`;
      ctx.fillStyle = strokeColor;
      ctx.textBaseline = "bottom";
      ctx.fillText(mask.label, x + 4 / zoom, y - 4 / zoom);
    }
  }
}

/**
 * Render full mask data as colored overlays on the canvas.
 *
 * For each mask, loads the PNG data URL and composites it with the
 * assigned color on top of the overlay context.
 *
 * This is async because it needs to decode mask images.
 */
export async function drawMaskImageOverlay(
  ctx: CanvasRenderingContext2D,
  masks: ReadonlyArray<{
    maskDataUrl: string;
    bounds: { x: number; y: number; width: number; height: number };
    label?: string;
  }>,
  zoom: number,
  signal?: AbortSignal
): Promise<void> {
  for (let i = 0; i < masks.length; i++) {
    if (signal?.aborted) {
      return;
    }

    const mask = masks[i];
    if (!mask.maskDataUrl) {
      // Fallback to bounds-only preview
      drawMaskBoundsOverlay(ctx, [mask], zoom);
      continue;
    }

    // Decode mask image
    const img = await loadImage(mask.maskDataUrl);
    if (signal?.aborted) {
      return;
    }

    const { x, y, width, height } = mask.bounds;
    const color = getMaskOverlayColor(i);
    const outlineColor = getMaskOutlineColor(i);

    // Create a temporary canvas to tint the mask
    const tintCanvas = document.createElement("canvas");
    tintCanvas.width = width;
    tintCanvas.height = height;
    const tintCtx = tintCanvas.getContext("2d");
    if (!tintCtx) {
      continue;
    }

    // Draw the mask (white = object)
    tintCtx.drawImage(img, 0, 0, width, height);

    // Use the mask as alpha, fill with overlay color
    tintCtx.globalCompositeOperation = "source-in";
    tintCtx.fillStyle = color;
    tintCtx.fillRect(0, 0, width, height);

    // Draw tinted mask on the main overlay
    ctx.drawImage(tintCanvas, x, y);

    // Draw outline around mask bounds
    ctx.strokeStyle = outlineColor;
    ctx.lineWidth = 2 / zoom;
    ctx.strokeRect(x, y, width, height);

    // Label
    if (mask.label) {
      const fontSize = Math.max(10, 14 / zoom);
      ctx.font = `${fontSize}px sans-serif`;
      ctx.fillStyle = outlineColor;
      ctx.textBaseline = "bottom";
      ctx.fillText(mask.label, x + 4 / zoom, y - 4 / zoom);
    }
  }
}

/**
 * Generate a cutout data URL by masking a source image with a binary mask.
 *
 * Takes the source layer's pixel data and applies the segmentation mask
 * to produce a cutout where only the masked region has pixels.
 *
 * @param sourceDataUrl - PNG data URL of the source layer
 * @param maskDataUrl - PNG data URL of the mask (white = keep, black = discard)
 * @param bounds - Bounds of the mask region in document space
 * @param featherRadius - Optional feather radius for soft edges
 * @returns PNG data URL of the cutout, or null if generation failed
 */
export async function generateCutoutDataUrl(
  sourceDataUrl: string,
  maskDataUrl: string,
  bounds: { x: number; y: number; width: number; height: number },
  featherRadius = 0
): Promise<string | null> {
  try {
    const [sourceImg, maskImg] = await Promise.all([
      loadImage(sourceDataUrl),
      loadImage(maskDataUrl)
    ]);

    const { x, y, width, height } = bounds;

    // Create cutout canvas at mask bounds size
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return null;
    }

    // Draw the source region
    ctx.drawImage(sourceImg, x, y, width, height, 0, 0, width, height);

    // Apply mask as alpha: use destination-in to keep only masked pixels
    const maskCanvas = document.createElement("canvas");
    maskCanvas.width = width;
    maskCanvas.height = height;
    const maskCtx = maskCanvas.getContext("2d");
    if (!maskCtx) {
      return null;
    }

    // Draw mask, optionally with feather (blur)
    if (featherRadius > 0) {
      maskCtx.filter = `blur(${featherRadius}px)`;
      maskCtx.drawImage(maskImg, 0, 0, width, height);
      maskCtx.filter = "none";
    } else {
      maskCtx.drawImage(maskImg, 0, 0, width, height);
    }

    // Apply the mask as alpha channel
    ctx.globalCompositeOperation = "destination-in";
    ctx.drawImage(maskCanvas, 0, 0);
    ctx.globalCompositeOperation = "source-over";

    return canvas.toDataURL("image/png");
  } catch (err) {
    console.error("[generateCutoutDataUrl] Failed:", err);
    return null;
  }
}

/**
 * Generate a unique run ID for a segmentation operation.
 */
export function generateSegmentationRunId(): string {
  return `seg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// ─── Internal Helpers ─────────────────────────────────────────────────────────

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = (err) => reject(err);
    img.src = src;
  });
}
