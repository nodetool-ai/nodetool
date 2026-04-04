import type { ModuleConfig } from "../types.js";

export const config: ModuleConfig = {
  configs: {
    "fal-ai/nemotron/asr/stream": {
      className: "NemotronAsrStream",
      docstring:
        "Use the fast speed and pin point accuracy of nemotron to transcribe your texts.",
      tags: ["speech", "recognition", "transcription", "audio-analysis"],
      useCases: [
        "Speech recognition",
        "Audio transcription",
        "Speaker diarization",
        "Voice activity detection",
        "Meeting transcription"
      ]
    },
    "fal-ai/nemotron/asr": {
      className: "NemotronAsr",
      docstring:
        "Use the fast speed and pin point accuracy of nemotron to transcribe your texts.",
      tags: ["speech", "recognition", "transcription", "audio-analysis"],
      useCases: [
        "Speech recognition",
        "Audio transcription",
        "Speaker diarization",
        "Voice activity detection",
        "Meeting transcription"
      ]
    },
    "fal-ai/silero-vad": {
      className: "SileroVad",
      docstring:
        "Detect speech presence and timestamps with accuracy and speed using the ultra-lightweight Silero VAD model",
      tags: ["speech", "recognition", "transcription", "audio-analysis"],
      useCases: [
        "Speech recognition",
        "Audio transcription",
        "Speaker diarization",
        "Voice activity detection",
        "Meeting transcription"
      ]
    }
  }
};
