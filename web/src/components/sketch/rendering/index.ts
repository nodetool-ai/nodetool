/**
 * Rendering module barrel export
 *
 * Provides the SketchRuntime interface and the Canvas2D implementation.
 */

export type {
  SketchRuntime,
  DirtyRect,
  ActiveStrokeInfo
} from "./types";

export { Canvas2DRuntime } from "./Canvas2DRuntime";
