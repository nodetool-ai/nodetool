import type { NodeClass } from "@nodetool-ai/node-sdk";
import { TEXT_TO_SPEECH_NODES } from "./nodes/text-to-speech.js";
import { SPEECH_TO_TEXT_NODES } from "./nodes/speech-to-text.js";
import { REALTIME_TTS_NODES } from "./nodes/realtime-tts.js";
import { REALTIME_STT_NODES } from "./nodes/realtime-stt.js";

export const ELEVENLABS_NODES: readonly NodeClass[] = [
  ...TEXT_TO_SPEECH_NODES,
  ...SPEECH_TO_TEXT_NODES,
  ...REALTIME_TTS_NODES,
  ...REALTIME_STT_NODES
];

export function registerElevenLabsNodes(registry: {
  register: (nodeClass: NodeClass) => void;
}): void {
  for (const nodeClass of ELEVENLABS_NODES) {
    registry.register(nodeClass);
  }
}
