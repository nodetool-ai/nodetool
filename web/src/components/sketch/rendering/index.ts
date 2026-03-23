/**
 * Rendering module barrel export
 *
 * Provides the SketchRuntime interface, Canvas2D implementation,
 * WebGPU implementation, and runtime factory.
 */

export type {
  SketchRuntime,
  DirtyRect,
  ActiveStrokeInfo
} from "./types";

export { Canvas2DRuntime } from "./Canvas2DRuntime";
export { WebGPURuntime } from "./WebGPURuntime";
export {
  isWebGPUAvailable,
  initWebGPU,
  createRuntime
} from "./initWebGPU";
export type { WebGPUInitResult } from "./initWebGPU";
