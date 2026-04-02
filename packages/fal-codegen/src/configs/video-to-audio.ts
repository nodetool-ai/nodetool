import type { ModuleConfig } from "../types.js";

export const config: ModuleConfig = {
  configs: {
    "fal-ai/sam-audio/visual-separate": {
      className: "SamAudioVisualSeparate",
      docstring:
        "Audio separation with SAM Audio. Isolate any sound using natural language—professional-grade audio editing made simple for creators, researchers, and accessibility applications.",
      tags: ["audio", "extraction", "video-to-audio", "processing"],
      useCases: [
        "Audio extraction from video",
        "Sound separation",
        "Video audio analysis",
        "Music extraction",
        "Sound effect isolation"
      ]
    },
    "mirelo-ai/sfx-v1.5/video-to-audio": {
      className: "MireloAiSfxV15VideoToAudio",
      docstring:
        "Generate synced sounds for any video, and return the new sound track (like MMAudio)",
      tags: ["audio", "extraction", "video-to-audio", "processing"],
      useCases: [
        "Audio extraction from video",
        "Sound separation",
        "Video audio analysis",
        "Music extraction",
        "Sound effect isolation"
      ]
    },
    "fal-ai/kling-video/video-to-audio": {
      className: "KlingVideoVideoToAudio",
      docstring: "Generate audio from input videos using Kling",
      tags: ["audio", "extraction", "video-to-audio", "processing"],
      useCases: [
        "Audio extraction from video",
        "Sound separation",
        "Video audio analysis",
        "Music extraction",
        "Sound effect isolation"
      ]
    },
    "mirelo-ai/sfx-v1/video-to-audio": {
      className: "MireloAiSfxV1VideoToAudio",
      docstring:
        "Generate synced sounds for any video, and return the new sound track (like MMAudio)",
      tags: ["audio", "extraction", "video-to-audio", "processing"],
      useCases: [
        "Audio extraction from video",
        "Sound separation",
        "Video audio analysis",
        "Music extraction",
        "Sound effect isolation"
      ]
    }
  }
};
