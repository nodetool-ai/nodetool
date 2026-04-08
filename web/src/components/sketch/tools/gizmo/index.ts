/**
 * tools/gizmo – Shared gizmo-core module for overlay drawing.
 *
 * Provides centralized constants, reusable paint primitives, and viewport
 * conversion helpers so TransformTool, MoveTool, CropTool, and future
 * gizmo consumers share one visual implementation.
 *
 * @module tools/gizmo
 */

export {
  // Constants
  HANDLE_SIZE,
  HANDLE_HIT_RADIUS,
  ROTATION_HANDLE_OFFSET,
  ROTATION_HANDLE_RADIUS_FACTOR,
  GIZMO_PRIMARY_COLOR,
  GIZMO_PRIMARY_SEMI,
  GIZMO_PRIMARY_FAINT,
  HANDLE_FILL_DEFAULT,
  HANDLE_FILL_HOVERED,
  OFF_CANVAS_INDICATOR_COLOR,
  CROP_DIM_COLOR,
  CROP_BORDER_COLOR,
  CROP_GRID_COLOR,
  GIZMO_LINE_WIDTH,
  GIZMO_LINE_WIDTH_HOVERED,
  BOUNDING_BOX_DASH_ON,
  BOUNDING_BOX_DASH_OFF,
  OFF_CANVAS_DASH_ON,
  OFF_CANVAS_DASH_OFF
} from "./gizmoConstants";

export {
  // Paint primitives
  drawBoundingBox,
  drawSquareHandle,
  drawRotationHandle,
  drawTransformGizmo,
  drawOffCanvasIndicator,
  drawCropOverlay
} from "./gizmoPrimitives";
