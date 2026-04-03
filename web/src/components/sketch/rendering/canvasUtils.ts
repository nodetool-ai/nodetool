/**
 * canvasUtils.ts
 *
 * Canvas rendering utilities: dirty-rect tracking types, blend-mode mapping,
 * checkerboard and pixel-grid drawing helpers used across the sketch editor.
 */

import type { BlendMode } from "../types";

// ─── Dirty-rect types ────────────────────────────────────────────────────────

export interface DirtyRectBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** Mutable ref-like object for tracking the dirty rect during a stroke */
export interface DirtyRectTracker {
  current: DirtyRectBox | null;
}

/** Reusable off-screen canvases for the blur tool */
export interface BlurTempCanvases {
  tmp: HTMLCanvasElement | null;
  blurred: HTMLCanvasElement | null;
  mask: HTMLCanvasElement | null;
}

// ─── Blend mode mapping ──────────────────────────────────────────────────────

export function blendModeToComposite(
  mode: BlendMode
): GlobalCompositeOperation {
  switch (mode) {
    case "multiply":
      return "multiply";
    case "screen":
      return "screen";
    case "overlay":
      return "overlay";
    case "darken":
      return "darken";
    case "lighten":
      return "lighten";
    case "color-dodge":
      return "color-dodge";
    case "color-burn":
      return "color-burn";
    case "hard-light":
      return "hard-light";
    case "soft-light":
      return "soft-light";
    case "difference":
      return "difference";
    case "exclusion":
      return "exclusion";
    default:
      return "source-over";
  }
}

// ─── Checkerboard ────────────────────────────────────────────────────────────

let cachedCheckerboardTile: HTMLCanvasElement | null = null;
/** The target visual cell size in screen pixels (approximate after rounding). */
const CHECKERBOARD_SCREEN_CELL = 8;

/**
 * Integer document pixels per checker cell so the alpha grid aligns with the
 * canvas bitmap. A fractional `8/zoom` misaligns with `imageRendering: pixelated`
 * and CSS scale, which makes tiles look uneven at many zoom levels.
 */
export function checkerboardDocumentCellPx(zoom: number | undefined): number {
  const z = zoom != null && zoom > 0 ? zoom : 1;
  return Math.max(1, Math.round(CHECKERBOARD_SCREEN_CELL / z));
}

export function drawCheckerboard(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  zoom?: number
): void {
  // Build a 2×2-cell tile; scale the pattern so each cell spans an integer
  // number of document pixels (`cellDoc`), keeping tiles uniform on the bitmap.
  const tileCell = CHECKERBOARD_SCREEN_CELL;
  const cellDoc = checkerboardDocumentCellPx(zoom);
  const patternScale = cellDoc / tileCell;
  if (!cachedCheckerboardTile) {
    cachedCheckerboardTile = document.createElement("canvas");
    cachedCheckerboardTile.width = tileCell * 2;
    cachedCheckerboardTile.height = tileCell * 2;
    const pCtx = cachedCheckerboardTile.getContext("2d");
    if (pCtx) {
      pCtx.fillStyle = "#2a2a2a";
      pCtx.fillRect(0, 0, tileCell * 2, tileCell * 2);
      pCtx.fillStyle = "#3a3a3a";
      pCtx.fillRect(0, 0, tileCell, tileCell);
      pCtx.fillRect(tileCell, tileCell, tileCell, tileCell);
    }
  }
  const pattern = ctx.createPattern(cachedCheckerboardTile, "repeat");
  if (pattern) {
    if (typeof DOMMatrix !== "undefined" && pattern.setTransform) {
      pattern.setTransform(new DOMMatrix().scaleSelf(patternScale, patternScale));
    }
    ctx.fillStyle = pattern;
    ctx.fillRect(0, 0, width, height);
  } else {
    // Fallback: solid background
    ctx.fillStyle = "#2a2a2a";
    ctx.fillRect(0, 0, width, height);
  }
}

// ─── Pixel grid ──────────────────────────────────────────────────────────────

/**
 * First zoom scale (1 = 100%) at which the pixel grid is drawn on the viewport layer.
 * 20 = 2000% — only when image pixels are very large on screen.
 */
export const PIXEL_GRID_MIN_ZOOM = 20;

/** Opacity ramp ends here (grid reaches full stroke alpha). */
export const PIXEL_GRID_FULL_OPACITY_ZOOM = 28;

/**
 * Pencil pixel-snap cursor: independent of {@link PIXEL_GRID_MIN_ZOOM} so the cell
 * cursor appears at modest zoom (e.g. 200%).
 */
export const PENCIL_PIXEL_CURSOR_MIN_ZOOM = 2;

/**
 * Strokes a thin grid at every integer **document pixel** boundary (not filled cells).
 *
 * **Caller must apply the same document→viewport transform as the artwork** (e.g. the
 * selection/marching-ants canvas: scale(zoom) + pan, origin at document top-left). This
 * keeps the grid a screen-aligned UI decoration; do not draw it on the document-sized
 * overlay bitmap in image-buffer space.
 *
 * `lineWidth` is `1/zoom` in document user units so the stroke is ~one CSS/device pixel
 * thick after the view scale.
 */
export function drawPixelGrid(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  zoom: number
): void {
  if (zoom < PIXEL_GRID_MIN_ZOOM) {
    return;
  }

  const fadeEnd = PIXEL_GRID_FULL_OPACITY_ZOOM;
  const t =
    zoom >= fadeEnd
      ? 1
      : (zoom - PIXEL_GRID_MIN_ZOOM) / (fadeEnd - PIXEL_GRID_MIN_ZOOM);
  const opacity = 0.28 + 0.26 * Math.min(1, Math.max(0, t));

  const lw = 1 / zoom;

  ctx.save();
  ctx.strokeStyle = `rgba(255, 255, 255, ${opacity})`;
  ctx.lineWidth = lw;

  // Vertical lines
  ctx.beginPath();
  for (let x = 0; x <= width; x++) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
  }
  // Horizontal lines
  for (let y = 0; y <= height; y++) {
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
  }
  ctx.stroke();
  ctx.restore();
}
