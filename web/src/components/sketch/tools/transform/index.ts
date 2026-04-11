/**
 * tools/transform barrel export.
 *
 * @module tools/transform
 */

export { cursorForHandle } from "./cursorMapping";
export {
  type TransformHandle,
  HANDLE_RADIUS,
  ROTATION_HANDLE_OFFSET,
  HANDLE_SIZE,
  OUTSIDE_ROTATE_MARGIN,
  HANDLE_ANCHOR,
  rotatePoint,
  snapAngle,
  dist,
  computeLayerCenter,
  scaledHalfExtents,
  buildHandlePositions,
  hitTestHandles,
  isInRotateZone,
  docToScreen,
  docRectToScreen,
  getLayerGizmoBounds
} from "./handleGeometry";
export {
  computeMoveTransform,
  computeRotateTransform,
  computeScaleTransform,
  computeTransformForHandle
} from "./computeTransform";
