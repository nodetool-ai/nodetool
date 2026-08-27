/**
 * drawingUtils.ts
 *
 * Barrel re-export for the drawing algorithms consumers reach through this
 * path. Implementations live in focused modules under `painting/`,
 * `rendering/`, and `tools/`. Everything not listed here is imported from
 * its own module.
 */

// ─── Re-exports from painting modules ────────────────────────────────────────

export {
  strokePressureMultiplier,
  paintPressureForEngine,
  drawBrushStroke,
  drawEraserStroke,
  drawPencilStroke
} from "./painting/strokeRendering";
export type { StrokeStampState } from "./painting/strokeRendering";

export { drawBlurStroke } from "./painting/blurRendering";

export { drawCloneStampStroke } from "./painting/cloneRendering";

// ─── Re-exports from rendering modules ───────────────────────────────────────

export {
  blendModeToComposite,
  checkerboardDocumentCellPx,
  drawCheckerboard,
  PIXEL_GRID_MIN_ZOOM,
  PIXEL_GRID_FULL_OPACITY_ZOOM,
  PENCIL_PIXEL_CURSOR_MIN_ZOOM,
  drawPixelGrid
} from "./rendering/canvasUtils";
export type {
  DirtyRectTracker,
  BlurTempCanvases
} from "./rendering/canvasUtils";
