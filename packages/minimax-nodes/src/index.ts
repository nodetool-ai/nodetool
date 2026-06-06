import type { NodeClass } from "@nodetool-ai/node-sdk";
import { VOICE_NODES } from "./nodes/voice.js";
import { TEXT_TO_SPEECH_NODES } from "./nodes/text-to-speech.js";
import { MUSIC_NODES } from "./nodes/music.js";
import { TEXT_TO_IMAGE_NODES } from "./nodes/text-to-image.js";
import { TEXT_TO_VIDEO_NODES } from "./nodes/text-to-video.js";
import { IMAGE_TO_VIDEO_NODES } from "./nodes/image-to-video.js";

export { MinimaxVoiceNode } from "./nodes/voice.js";
export { MinimaxTextToSpeechNode } from "./nodes/text-to-speech.js";
export { MinimaxMusicNode } from "./nodes/music.js";
export { MinimaxTextToImageNode } from "./nodes/text-to-image.js";
export { MinimaxTextToVideoNode } from "./nodes/text-to-video.js";
export { MinimaxImageToVideoNode } from "./nodes/image-to-video.js";

export const MINIMAX_NODES: readonly NodeClass[] = [
  ...VOICE_NODES,
  ...TEXT_TO_SPEECH_NODES,
  ...MUSIC_NODES,
  ...TEXT_TO_IMAGE_NODES,
  ...TEXT_TO_VIDEO_NODES,
  ...IMAGE_TO_VIDEO_NODES
];

export function registerMinimaxNodes(registry: {
  register: (nodeClass: NodeClass) => void;
}): void {
  for (const nodeClass of MINIMAX_NODES) {
    registry.register(nodeClass);
  }
}
