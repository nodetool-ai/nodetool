import type { NodeClass, NodeRegistry } from "@nodetool-ai/node-sdk";

/**
 * `@nodetool-ai/manimgx-nodes` — ManimGX scenes as workflow nodes.
 *
 * ManimGX renders math and 3D animations written with Manim Community
 * Edition's Python API on a Rust GPU engine. These nodes run its command
 * line: `RenderScene` (scene → MP4), `InspectScene` (storyboard, timeline and
 * layout checks without video) and `GenerateScene` (a language model writes
 * the scene and fixes it from the inspection). `MANIMGX_NODES` is registered
 * in `@nodetool-ai/base-nodes` alongside the other node arrays.
 */

export { RenderSceneNode, MANIMGX_RENDER_NODES } from "./nodes/render-scene.js";
export { InspectSceneNode, MANIMGX_INSPECT_NODES } from "./nodes/inspect-scene.js";
export {
  GenerateSceneNode,
  MANIMGX_GENERATE_NODES,
  SCENE_AUTHOR_SYSTEM_PROMPT,
  extractSceneCode
} from "./nodes/generate-scene.js";
export {
  MANIMGX_INSTALL_HINT,
  resolveManimgxBinary,
  resetManimgxBinaryCache
} from "./manimgx-binary.js";
export type { ManimgxBinary } from "./manimgx-binary.js";
export {
  MANIMGX_DISABLED_ERROR,
  MANIMGX_PRESETS,
  ManimgxError,
  childEnv,
  isManimgxEnabled,
  manimgxArgs,
  runManimgx
} from "./run-manimgx.js";
export type {
  ManimgxPreset,
  ManimgxRenderSettings,
  ManimgxResult,
  ManimgxRun,
  ManimgxRunOptions,
  ManimgxScene
} from "./run-manimgx.js";

import { MANIMGX_RENDER_NODES } from "./nodes/render-scene.js";
import { MANIMGX_INSPECT_NODES } from "./nodes/inspect-scene.js";
import { MANIMGX_GENERATE_NODES } from "./nodes/generate-scene.js";

export const MANIMGX_NODES = [
  ...MANIMGX_RENDER_NODES,
  ...MANIMGX_INSPECT_NODES,
  ...MANIMGX_GENERATE_NODES
];

export const ALL_MANIMGX_NODES: readonly NodeClass[] = [
  ...MANIMGX_NODES,
];

export function registerManimgxNodes(registry: NodeRegistry): void {
  for (const nodeClass of ALL_MANIMGX_NODES) {
    registry.register(nodeClass);
  }
}
