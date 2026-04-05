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
    }
  }
};
