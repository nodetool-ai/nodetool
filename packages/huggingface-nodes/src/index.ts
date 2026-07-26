import { tagContentCardBodies } from "@nodetool-ai/node-sdk";
import type { NodeClass } from "@nodetool-ai/node-sdk";
import { HUGGINGFACE_TEXT_NODES } from "./nodes/text.js";
import { HUGGINGFACE_IMAGE_NODES } from "./nodes/image.js";
import { HUGGINGFACE_AUDIO_NODES } from "./nodes/audio.js";
import { HUGGINGFACE_VIDEO_NODES } from "./nodes/video.js";

export * from "./huggingface-base.js";
export * from "./nodes/text.js";
export * from "./nodes/image.js";
export * from "./nodes/audio.js";
export * from "./nodes/video.js";

/**
 * Every Hugging Face Inference Providers node, across all task modalities.
 *
 * Nodes whose primary output is displayable (generated media, or the text a
 * generator/captioner/transcriber returns) render a content card; the ones
 * that return scores or bounding boxes keep the generic body.
 */
export const HUGGINGFACE_NODES: readonly NodeClass[] = tagContentCardBodies([
  ...HUGGINGFACE_TEXT_NODES,
  ...HUGGINGFACE_IMAGE_NODES,
  ...HUGGINGFACE_AUDIO_NODES,
  ...HUGGINGFACE_VIDEO_NODES
]);

export function registerHuggingFaceNodes(registry: {
  register: (nodeClass: NodeClass) => void;
}): void {
  for (const nodeClass of HUGGINGFACE_NODES) {
    registry.register(nodeClass);
  }
}
