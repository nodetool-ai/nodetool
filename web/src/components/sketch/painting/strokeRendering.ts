/**
 * strokeRendering.ts
 *
 * The brush/pencil/eraser stroke engine lives in the paint core
 * (`@nodetool-ai/image-editor/painting.js`) so it can also run headlessly in
 * Node. This module is the sketch editor's view of it — every existing import
 * path keeps working, and there is exactly one implementation.
 */

export {
  MIN_PRESSURE_FACTOR,
  SKETCH_FULL_OPACITY_THRESHOLD,
  strokePressureMultiplier,
  paintPressureForEngine,
  pixelPerfectPencilDabFootprint,
  snapStrokeDabCenterDoc,
  stampAlongStroke,
  expandDirtyRect,
  expandDirtyRectFromPoints,
  drawBrushStroke,
  drawPencilStroke,
  drawEraserStroke,
  brushSettingsForEraserStroke,
  pencilSettingsForEraserStroke
} from "@nodetool-ai/image-editor/painting.js";

export type {
  StrokeStampState,
  PaintSurface,
  PaintSurfaceFactory,
  PaintContext2D
} from "@nodetool-ai/image-editor/painting.js";
