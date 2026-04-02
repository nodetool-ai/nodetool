import type { NodeClass } from "@nodetool/node-sdk";

import { FAL_3D_TO_3D_NODES } from "./generated/3d-to-3d.js";
import { FAL_AUDIO_TO_AUDIO_NODES } from "./generated/audio-to-audio.js";
import { FAL_AUDIO_TO_TEXT_NODES } from "./generated/audio-to-text.js";
import { FAL_AUDIO_TO_VIDEO_NODES } from "./generated/audio-to-video.js";
import { FAL_IMAGE_TO_3D_NODES } from "./generated/image-to-3d.js";
import { FAL_IMAGE_TO_IMAGE_NODES } from "./generated/image-to-image.js";
import { FAL_IMAGE_TO_JSON_NODES } from "./generated/image-to-json.js";
import { FAL_IMAGE_TO_VIDEO_NODES } from "./generated/image-to-video.js";
import { FAL_JSON_PROCESSING_NODES } from "./generated/json-processing.js";
import { FAL_LLM_NODES } from "./generated/llm.js";
import { FAL_SPEECH_TO_SPEECH_NODES } from "./generated/speech-to-speech.js";
import { FAL_SPEECH_TO_TEXT_NODES } from "./generated/speech-to-text.js";
import { FAL_TEXT_TO_3D_NODES } from "./generated/text-to-3d.js";
import { FAL_TEXT_TO_AUDIO_NODES } from "./generated/text-to-audio.js";
import { FAL_TEXT_TO_IMAGE_NODES } from "./generated/text-to-image.js";
import { FAL_TEXT_TO_JSON_NODES } from "./generated/text-to-json.js";
import { FAL_TEXT_TO_SPEECH_NODES } from "./generated/text-to-speech.js";
import { FAL_TEXT_TO_VIDEO_NODES } from "./generated/text-to-video.js";
import { FAL_TRAINING_NODES } from "./generated/training.js";
import { FAL_UNKNOWN_NODES } from "./generated/unknown.js";
import { FAL_VIDEO_TO_AUDIO_NODES } from "./generated/video-to-audio.js";
import { FAL_VIDEO_TO_TEXT_NODES } from "./generated/video-to-text.js";
import { FAL_VIDEO_TO_VIDEO_NODES } from "./generated/video-to-video.js";
import { FAL_VISION_NODES } from "./generated/vision.js";

export { FalProvider } from "./fal-provider.js";
export { FalRawNode, FalDynamicNode } from "./fal-dynamic.js";

export const FAL_NODES: readonly NodeClass[] = [
  ...FAL_3D_TO_3D_NODES,
  ...FAL_AUDIO_TO_AUDIO_NODES,
  ...FAL_AUDIO_TO_TEXT_NODES,
  ...FAL_AUDIO_TO_VIDEO_NODES,
  ...FAL_IMAGE_TO_3D_NODES,
  ...FAL_IMAGE_TO_IMAGE_NODES,
  ...FAL_IMAGE_TO_JSON_NODES,
  ...FAL_IMAGE_TO_VIDEO_NODES,
  ...FAL_JSON_PROCESSING_NODES,
  ...FAL_LLM_NODES,
  ...FAL_SPEECH_TO_SPEECH_NODES,
  ...FAL_SPEECH_TO_TEXT_NODES,
  ...FAL_TEXT_TO_3D_NODES,
  ...FAL_TEXT_TO_AUDIO_NODES,
  ...FAL_TEXT_TO_IMAGE_NODES,
  ...FAL_TEXT_TO_JSON_NODES,
  ...FAL_TEXT_TO_SPEECH_NODES,
  ...FAL_TEXT_TO_VIDEO_NODES,
  ...FAL_TRAINING_NODES,
  ...FAL_UNKNOWN_NODES,
  ...FAL_VIDEO_TO_AUDIO_NODES,
  ...FAL_VIDEO_TO_TEXT_NODES,
  ...FAL_VIDEO_TO_VIDEO_NODES,
  ...FAL_VISION_NODES
];

export function registerFalNodes(registry: {
  register: (nodeClass: NodeClass) => void;
}): void {
  for (const nodeClass of FAL_NODES) {
    registry.register(nodeClass);
  }
}
