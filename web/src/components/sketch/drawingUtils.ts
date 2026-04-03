/**
 * drawingUtils.ts
 *
 * Barrel re-export for all drawing algorithm functions. Domain-specific
 * implementations live in focused modules under `painting/`, `rendering/`,
 * and `tools/`. This file re-exports everything so that existing
 * consumers continue to work without changes.
 */

// ─── Re-exports from painting modules ────────────────────────────────────────

export {
  MIN_PRESSURE_FACTOR,
  strokePressureMultiplier,
  paintPressureForEngine,
  SKETCH_FULL_OPACITY_THRESHOLD,
  stampAlongStroke,
  expandDirtyRect,
  expandDirtyRectFromPoints,
  drawBrushStroke,
  brushSettingsForEraserStroke,
  pencilSettingsForEraserStroke,
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
  DirtyRectBox,
  DirtyRectTracker,
  BlurTempCanvases
} from "./rendering/canvasUtils";

// ─── Re-exports from tool modules ────────────────────────────────────────────

export { drawGradient } from "./tools/GradientTool";
export { constrainEnd, applyAltCenterDraw, drawShapeOnCtx } from "./tools/ShapeTool";
export { floodFill } from "./tools/FillTool";
