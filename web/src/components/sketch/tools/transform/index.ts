/**
 * tools/transform barrel export.
 *
 * @module tools/transform
 */

export { cursorForHandle } from "./cursorMapping";
export {
  type TransformHandle,
  type CornerHandle,
  type EdgeHandle,
  isCornerHandle,
  isEdgeHandle,
  HANDLE_RADIUS,
  ROTATION_HANDLE_OFFSET,
  HANDLE_SIZE,
  OUTSIDE_ROTATE_MARGIN,
  PIVOT_HIT_RADIUS,
  PIVOT_SNAP_DISTANCE,
  HANDLE_ANCHOR,
  rotatePoint,
  snapAngle,
  dist,
  computeLayerCenter,
  scaledHalfExtents,
  buildHandlePositions,
  hitTestHandles,
  isInRotateZone,
  hitTestPivot,
  getPivotSnapAnchors,
  snapPivotToAnchor,
  docToScreen,
  docRectToScreen,
  canvasDocPointToGizmoDevicePixels
} from "./handleGeometry";
export {
  type CropRectDoc,
  clampCropRectToCanvas,
  hitTestCropHandles,
  resizeCropRectFromDrag
} from "./cropGeometry";
export {
  computeMoveTransform,
  computeRotateTransform,
  computeScaleTransform,
  computeTransformForHandle,
  computeDistortTransform,
  computeSkewTransform,
  computePerspectiveTransform,
  resolveTransformGestureMode
} from "./computeTransform";
export {
  affineMultiply,
  affineInvert,
  rasterSpaceToDocAffine,
  unionOfDocumentExtents,
  layerTransformFromDocAffine,
  fitAffineRectangleCorners
} from "./multiLayerTransformMath";
