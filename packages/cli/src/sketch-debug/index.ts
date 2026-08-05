/**
 * The CLI host for the sketch debug harness: target resolution, the
 * `--interact` script, and the bundle writer. The rules themselves live in
 * `@nodetool-ai/execution/sketch-debug`.
 */
export {
  runSketchDebug,
  runSketchValidate,
  type CreateSketchBridge,
  type SketchBridge,
  type SketchBridgeLayer,
  type SketchBridgeSnapshot,
  type SketchBridgeTool,
  type SketchDebugCore,
  type SketchDebugDeps,
  type SketchDebugOptions,
  type SketchDebugResult,
  type SketchValidateResult
} from "./harness.js";
export {
  normalizeToolName,
  parseInteractionScript,
  type SketchInteractionStep
} from "./interactions.js";
export {
  resolveSketchTarget,
  type ImageDocumentRecord,
  type ResolvedSketchTarget,
  type SketchCanvasSettings,
  type SketchDocumentView,
  type SketchLayerView,
  type SketchTargetDeps
} from "./target.js";
