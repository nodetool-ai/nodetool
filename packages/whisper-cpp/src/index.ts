import { registerProvider } from "@nodetool-ai/runtime";
import { isCloudProfileActive } from "@nodetool-ai/protocol";
import { WhisperCppProvider } from "./whisper-cpp-provider.js";

export { WhisperCppProvider };
export { discoverASRModels, discoverVadModels } from "./model-discovery.js";
let registered = false;
export function registerWhisperCppProviders(): void {
  if (registered || isCloudProfileActive(process.env.NODETOOL_NODE_PROFILE, process.env.NODETOOL_ENV)) {
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
