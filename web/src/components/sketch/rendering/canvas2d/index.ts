/**
 * canvas2d/ barrel export
 *
 * Re-exports all extracted Canvas2D engine modules so that Canvas2DRuntime
 * can import from a single path.
 */

export {
  SERIALIZED_LAYER_DATA_PREFIX,
  getDefaultRasterBounds,
  serializeLayerData,
  deserializeLayerData,
  findContentRect,
  getLayerDataFromCanvas,
  getCanvasSerializedData,
  clearCanvasSerializedData
} from "./layerIO";
export type { SerializedLayerData } from "./layerIO";

export { evaluateLayerEffectsCPU } from "./resolvedOutput";

export {
  drawWithTransform,
  drawLayerToContext,
  renderDocumentComposite,
  compositeToDisplayCanvas
} from "./composite";
export type {
  EvaluateLayerEffectsFn,
  StrokeTempState,
  RenderDocumentCompositeOptions
} from "./composite";

export {
  reconcileLayerToDocumentSpace,
  cropLayers,
  flipLayer,
  rotateLayer180,
  nudgeLayer,
  applyAdjustments,
  invertLayerColors
} from "./reconcile";

export {
  flattenToDataUrl,
  getMaskDataUrl,
  flattenVisible,
  readbackComposite,
  clearLayerBySelectionMask,
  fillLayerBySelectionMask,
  trimLayerToBounds,
  mergeLayerDown
} from "./maskAndExport";
export type {
  RenderDocumentCompositeFn,
  DrawLayerToContextFn
} from "./maskAndExport";
