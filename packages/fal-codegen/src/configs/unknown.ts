import type { ModuleConfig } from "../types.js";

export const config: ModuleConfig = {
  configs: {
    "fal-ai/workflow-utilities/interleave-video": {
      className: "WorkflowUtilitiesInterleaveVideo",
      docstring: "ffmpeg utility to interleave videos",
      tags: ["utility", "processing", "general"],
      useCases: [
        "General media processing",
        "Utility operations",
        "Content manipulation",
        "Automated workflows",
        "Data processing"
      ]
    },
    "fal-ai/qwen-3-tts/clone-voice/1.7b": {
      className: "Qwen3TtsCloneVoice17b",
      docstring:
        "Clone your voices using Qwen3-TTS Clone-Voice model with zero shot cloning capabilities and use it on text-to-speech models to create speeches of yours!",
      tags: ["utility", "processing", "general"],
      useCases: [
        "General media processing",
        "Utility operations",
        "Content manipulation",
        "Automated workflows",
        "Data processing"
      ]
    },
    "fal-ai/qwen-3-tts/clone-voice/0.6b": {
      className: "Qwen3TtsCloneVoice06b",
      docstring:
        "Clone your voices using Qwen3-TTS Clone-Voice model with zero shot cloning capabilities and use it on text-to-speech models to create speeches of yours!",
      tags: ["utility", "processing", "general"],
      useCases: [
        "General media processing",
        "Utility operations",
        "Content manipulation",
        "Automated workflows",
        "Data processing"
      ]
    },
    "openrouter/router/audio": {
      className: "RouterAudio",
      docstring:
        "Run any ALM (Audio Language Model) with fal, powered by OpenRouter.",
      tags: ["utility", "processing", "general"],
      useCases: [
        "General media processing",
        "Utility operations",
        "Content manipulation",
        "Automated workflows",
        "Data processing"
      ]
    }
  }
};
