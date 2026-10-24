import type { NodeClass, NodeRegistry } from "@nodetool-ai/node-sdk";
import { VIDEO_NODES } from "./nodes/video.js";
import { TIMELINE_NODES } from "./nodes/timeline.js";
import { SCRIPT_NODES } from "./nodes/script.js";
import { STORYBOARD_NODES } from "./nodes/storyboard.js";
import { MODEL3D_NODES } from "./nodes/model3d.js";
import { LIB_YTDLP_NODES } from "./nodes/lib-video-download.js";
import { VIDEO_ACCESSORY_NODES } from "./nodes/accessories.js";

export * from "./nodes/video.js";
export * from "./nodes/timeline.js";
export * from "./nodes/script.js";
export * from "./nodes/storyboard.js";
export * from "./nodes/lib-video-download.js";
export * from "./nodes/model3d.js";
export * from "./nodes/accessories.js";

// Submodule re-exports for callers (tests, codegen) that import the
// 3D-model defaults / generation node classes directly.
export {
  TextTo3DNode,
  ImageTo3DNode
} from "./nodes/model3d/generation.js";
export {
  DEFAULT_MODEL_3D,
  DEFAULT_FOLDER,
  DEFAULT_IMAGE,
  DEFAULT_TEXT_TO_3D_MODEL,
  DEFAULT_IMAGE_TO_3D_MODEL
} from "./nodes/model3d/defaults.js";

export const ALL_VIDEO_NODES: readonly NodeClass[] = [
  ...VIDEO_NODES,
  ...TIMELINE_NODES,
  ...SCRIPT_NODES,
  ...STORYBOARD_NODES,
  ...MODEL3D_NODES,
  ...LIB_YTDLP_NODES,
  ...VIDEO_ACCESSORY_NODES,
];

export function registerVideoNodes(registry: NodeRegistry): void {
  for (const nodeClass of ALL_VIDEO_NODES) {
    registry.register(nodeClass);
  }
}
