/**
 * `@nodetool-ai/blender-nodes` — Blender headless integration (Stage 3).
 *
 * Binary discovery, the versioned job contract, the runner interface with
 * its local implementation, the thin `runBlenderJob` entry point, and the
 * `nodetool.blender.*` nodes. `BLENDER_NODES` is registered in
 * `@nodetool-ai/base-nodes` alongside the other node arrays.
 */

export { BLENDER_RENDER_NODES } from "./nodes/render-image.js";
export { RenderImageNode } from "./nodes/render-image.js";
export { BLENDER_PASSES_NODES } from "./nodes/render-passes.js";
export { RenderPassesNode } from "./nodes/render-passes.js";
export { BLENDER_ANIMATION_NODES } from "./nodes/render-animation.js";
export { RenderAnimationNode } from "./nodes/render-animation.js";
export { BLENDER_PREPARE_NODES } from "./nodes/prepare-for-engine.js";
export { PrepareForEngineNode } from "./nodes/prepare-for-engine.js";
export { BLENDER_EXPORT_NODES } from "./nodes/export-model.js";
export { ExportModelNode } from "./nodes/export-model.js";
export type { BlenderBinary } from "./blender-binary.js";
export {
  BlenderVersionError,
  resolveBlenderBinary,
  resetBlenderBinaryCache,
  BLENDER_MIN_VERSION
} from "./blender-binary.js";
export {
  BLENDER_JOB_VERSION,
  jobFileNameSchema,
  blenderResultSchema
} from "./job.js";
export type {
  BakeMode,
  BlenderEngine,
  BlenderJob,
  BlenderOp,
  BlenderResult,
  BlenderResultStats,
  CameraMode,
  CameraParams,
  DepthFormat,
  ExportFormat,
  ExportModelParams,
  LightingPreset,
  PrepareForEngineParams,
  RenderAnimationParams,
  RenderImageParams,
  RenderPass,
  RenderPassesParams
} from "./job.js";
export {
  BlenderJobError,
  LocalBlenderRunner,
  WorkerBlenderRunner,
  resolveOpScriptDir,
  MAX_OUTPUT_BYTES,
  MAX_TOTAL_OUTPUT_BYTES,
  MAX_OUTPUT_COUNT
} from "./runner.js";
export type {
  BlenderJobErrorCode,
  WorkerBlenderRunnerOptions,
  BlenderRunner,
  BlenderRunOptions,
  BlenderRunResult
} from "./runner.js";
export {
  resolveBlenderRunner,
  runBlenderJob,
  __setBlenderRunnerForTesting,
  BLENDER_MODEL_INPUT_FILE
} from "./run-job.js";

import { BLENDER_RENDER_NODES } from "./nodes/render-image.js";
import { BLENDER_PASSES_NODES } from "./nodes/render-passes.js";
import { BLENDER_ANIMATION_NODES } from "./nodes/render-animation.js";
import { BLENDER_PREPARE_NODES } from "./nodes/prepare-for-engine.js";
import { BLENDER_EXPORT_NODES } from "./nodes/export-model.js";

export const BLENDER_NODES = [
  ...BLENDER_RENDER_NODES,
  ...BLENDER_PASSES_NODES,
  ...BLENDER_ANIMATION_NODES,
  ...BLENDER_PREPARE_NODES,
  ...BLENDER_EXPORT_NODES
];
