/**
 * Canvas module barrel export
 *
 * Focused hooks extracted from the monolithic SketchCanvas component.
 */

export { useCompositing } from "./useCompositing";
export type { UseCompositingResult } from "./useCompositing";

export { useRuntimeBootstrap } from "./useRuntimeBootstrap";

export { useTransformPreviewComposite } from "./useTransformPreviewComposite";

export { useRedrawScheduler } from "./useRedrawScheduler";

export { useLayerHydration } from "./useLayerHydration";

export { useCanvasImperativeHandle } from "./useCanvasImperativeHandle";

export {
  useOverlayRenderer,
  selectionAntCanvasMarginCssPx
} from "./useOverlayRenderer";
export type { UseOverlayRendererResult } from "./useOverlayRenderer";

export { usePointerHandlers } from "./usePointerHandlers";
export type { UsePointerHandlersParams, UsePointerHandlersResult } from "./usePointerHandlers";

export {
  useCanvasTouchGestures,
  computePinchStep
} from "./useCanvasTouchGestures";

export { useTransformPreviewBridge } from "./useTransformPreviewBridge";

export { useCanvasOrchestration } from "./useCanvasOrchestration";

export { DisplayFrameCoordinator } from "./DisplayFrameCoordinator";
export type {
  RedrawReason,
  TraceEventType,
  TraceEvent
} from "./DisplayFrameCoordinator";

// Re-export ActiveStrokeInfo from its canonical home in the rendering module.
export type { ActiveStrokeInfo } from "../rendering";
