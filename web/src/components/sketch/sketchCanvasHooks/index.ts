/**
 * Canvas module barrel export
 *
 * Focused hooks extracted from the monolithic SketchCanvas component.
 */

export { useCompositing } from "./useCompositing";
export type { UseCompositingParams, UseCompositingResult } from "./useCompositing";

export { useCanvasImperativeHandle } from "./useCanvasImperativeHandle";
export type { UseCanvasImperativeHandleParams } from "./useCanvasImperativeHandle";

export {
  useOverlayRenderer,
  selectionAntCanvasMarginCssPx
} from "./useOverlayRenderer";
export type {
  SelectionMoveAntsRef,
  UseOverlayRendererParams,
  UseOverlayRendererResult
} from "./useOverlayRenderer";

export { usePointerHandlers } from "./usePointerHandlers";
export type { UsePointerHandlersParams, UsePointerHandlersResult } from "./usePointerHandlers";

// Re-export ActiveStrokeInfo from its canonical home in the rendering module.
export type { ActiveStrokeInfo } from "../rendering";

