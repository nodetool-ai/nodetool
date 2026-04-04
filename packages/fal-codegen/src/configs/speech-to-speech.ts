import type { ModuleConfig } from "../types.js";

export const config: ModuleConfig = {
  configs: {
    "resemble-ai/chatterboxhd/speech-to-speech": {
      className: "ResembleAiChatterboxhdSpeechToSpeech",
      docstring:
        "Transform voices using Resemble AI's Chatterbox. Convert audio to new voices or your own samples, with expressive results and built-in perceptual watermarking.",
      tags: ["speech", "voice", "transformation", "cloning"],
      useCases: [
        "Voice cloning and transformation",
        "Real-time voice conversion",
        "Voice style transfer",
        "Speech enhancement",
        "Accent conversion"
      ]
    },
    "fal-ai/chatterbox/speech-to-speech": {
      className: "ChatterboxSpeechToSpeech",
      docstring:
        "Whether you're working on memes, videos, games, or AI agents, Chatterbox brings your content to life. Use the first tts from resemble ai.",
      tags: ["speech", "voice", "transformation", "cloning"],
      useCases: [
        "Voice cloning and transformation",
        "Real-time voice conversion",
        "Voice style transfer",
        "Speech enhancement",
        "Accent conversion"
      ]
    }
  }
};
