import type { ModuleConfig } from "../types.js";

export const config: ModuleConfig = {
  configs: {
    "fal-ai/ffmpeg-api/loudnorm": {
      className: "FfmpegApiLoudnorm",
      docstring:
        "Get EBU R128 loudness normalization from audio files using FFmpeg API.",
      tags: ["json", "processing", "data", "utility"],
      useCases: [
        "JSON data processing",
        "Data transformation",
        "Metadata extraction",
        "Audio analysis",
        "Media processing utilities"
      ]
    },
    "fal-ai/ffmpeg-api/waveform": {
      className: "FfmpegApiWaveform",
      docstring: "Get waveform data from audio files using FFmpeg API.",
      tags: ["json", "processing", "data", "utility"],
      useCases: [
        "JSON data processing",
        "Data transformation",
        "Metadata extraction",
        "Audio analysis",
        "Media processing utilities"
      ]
    },
    "fal-ai/ffmpeg-api/metadata": {
      className: "FfmpegApiMetadata",
      docstring:
        "Get encoding metadata from video and audio files using FFmpeg API.",
      tags: ["json", "processing", "data", "utility"],
      useCases: [
        "JSON data processing",
        "Data transformation",
        "Metadata extraction",
        "Audio analysis",
        "Media processing utilities"
      ]
    },
    "fal-ai/omnilottie": {
      className: "Omnilottie",
      docstring: "Convert your assets into lottie using Omnilottie.",
      tags: ["json", "structured-output", "processing", "omnilottie"],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "fal-ai/omnilottie/image-to-lottie": {
      className: "OmnilottieImageToLottie",
      docstring: "Convert your assets into lottie using Omnilottie.",
      tags: ["json", "structured-output", "processing", "omnilottie", "lottie"],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "fal-ai/omnilottie/video-to-lottie": {
      className: "OmnilottieVideoToLottie",
      docstring: "Convert your assets into lottie using Omnilottie.",
      tags: ["json", "structured-output", "processing", "omnilottie", "lottie"],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    }
  }
};
