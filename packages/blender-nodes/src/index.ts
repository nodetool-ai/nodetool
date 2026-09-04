/**
 * `@nodetool-ai/blender-nodes` — Blender headless integration (Stage 1b).
 *
 * Binary discovery, the versioned job contract, the runner interface with
 * its local implementation, the thin `runBlenderJob` entry point, and the
 * `nodetool.blender.*` nodes. `BLENDER_NODES` is registered in
 * `@nodetool-ai/base-nodes` alongside the other node arrays.
 */

export { BLENDER_RENDER_NODES } from "./nodes/render-image.js";
export { RenderImageNode } from "./nodes/render-image.js";
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
  BlenderEngine,
  BlenderJob,
  BlenderOp,
  BlenderResult,
  BlenderResultStats,
  CameraMode,
  CameraParams,
  LightingPreset,
  RenderImageParams
} from "./job.js";
export {
  BlenderJobError,
  LocalBlenderRunner,
  resolveOpScriptDir,
  MAX_OUTPUT_BYTES,
  MAX_TOTAL_OUTPUT_BYTES,
  MAX_OUTPUT_COUNT
} from "./runner.js";
export type {
  BlenderJobErrorCode,
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

export const BLENDER_NODES = [...BLENDER_RENDER_NODES];
