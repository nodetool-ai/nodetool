import { registerProvider } from "@nodetool-ai/runtime";
import { isCloudProfileActive } from "@nodetool-ai/protocol";
import type { NodeRegistry } from "@nodetool-ai/node-sdk";
import { WhisperCppProvider } from "./whisper-cpp-provider.js";
import { LiveTranscriptionNode } from "./nodes/live-transcription.js";

export { WhisperCppProvider, LiveTranscriptionNode };
export { discoverASRModels, discoverVadModels } from "./model-discovery.js";
export const ALL_NODES = [LiveTranscriptionNode] as const;
let registered = false;
export function registerWhisperCppProviders(): void {
  if (
    registered ||
    isCloudProfileActive(
      process.env.NODETOOL_NODE_PROFILE,
      process.env.NODETOOL_ENV
    )
  ) {
    return;
  }
  registerProvider(
    "whisper_cpp",
    WhisperCppProvider,
    {},
    { WHISPER_CPP_MODELS_DIR: "", WHISPER_CPP_GPU_BACKEND: "" },
    { access: "in_process", displayName: "whisper.cpp" }
  );
  registered = true;
}
export function registerWhisperCppNodes(registry: NodeRegistry): void {
  for (const node of ALL_NODES) {
    registry.register(node);
  }
}
