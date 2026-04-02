import type { ModuleConfig } from "../types.js";

export const audioTranscribeConfig: ModuleConfig = {
  configs: {
    "vaibhavs10/incredibly-fast-whisper": {
      className: "IncrediblyFastWhisper",
      returnType: "str",
      fieldOverrides: {
        audio: { propType: "audio" }
      }
    },
    "openai/gpt-4o-transcribe": {
      className: "GPT4o_Transcribe",
      returnType: "str",
      fieldOverrides: {
        audio: { propType: "audio" }
      }
    },
    "openai/whisper": {
      className: "Whisper",
      returnType: "str",
      fieldOverrides: { audio: { propType: "audio" } }
    },
    "openai/gpt-4o-mini-transcribe": {
      className: "GPT4o_Mini_Transcribe",
      returnType: "str",
      fieldOverrides: { audio: { propType: "audio" } }
    },
    "daanelson/whisperx": {
      className: "WhisperX",
      returnType: "str",
      fieldOverrides: { audio: { propType: "audio" } }
    },
    "thomasmol/whisper-diarization": {
      className: "Whisper_Diarization",
      returnType: "str",
      fieldOverrides: { audio: { propType: "audio" } }
    },
    "nvidia/parakeet-rnnt-1.1b": {
      className: "Parakeet_RNNT",
      returnType: "str",
      fieldOverrides: { audio: { propType: "audio" } }
    },
    "lucataco/speaker-diarization": {
      className: "Speaker_Diarization",
      returnType: "str",
      fieldOverrides: { audio: { propType: "audio" } }
    },
    "meronym/speaker-diarization": {
      className: "Meronym_Speaker_Diarization",
      returnType: "str",
      fieldOverrides: { audio: { propType: "audio" } }
    },
    "meronym/speaker-transcription": {
      className: "Speaker_Transcription",
      returnType: "str",
      fieldOverrides: { audio: { propType: "audio" } }
    },
    "collectiveai-team/speaker-diarization-3": {
      className: "Speaker_Diarization_3",
      returnType: "str",
      fieldOverrides: { audio: { propType: "audio" } }
    }
  }
};
