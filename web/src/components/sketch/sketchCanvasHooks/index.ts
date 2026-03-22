/**
 * Canvas module barrel export
 *
 * Focused hooks extracted from the monolithic SketchCanvas component.
 */

export { useCompositing } from "./useCompositing";
export type { UseCompositingParams, UseCompositingResult } from "./useCompositing";

export { useCanvasImperativeHandle } from "./useCanvasImperativeHandle";
export type { UseCanvasImperativeHandleParams } from "./useCanvasImperativeHandle";

export { useOverlayRenderer } from "./useOverlayRenderer";
export type { UseOverlayRendererParams, UseOverlayRendererResult } from "./useOverlayRenderer";

export { usePointerHandlers } from "./usePointerHandlers";
export type { UsePointerHandlersParams, UsePointerHandlersResult } from "./usePointerHandlers";
