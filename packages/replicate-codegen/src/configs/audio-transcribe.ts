import type { ModuleConfig } from "../types.js";

export const audioTranscribeConfig: ModuleConfig = {
  configs: {
    "vaibhavs10/incredibly-fast-whisper": {
      className: "IncrediblyFastWhisper",
      returnType: "str",
      fieldOverrides: {
        audio: { propType: "audio" },
      },
    },
    "openai/gpt-4o-transcribe": {
      className: "GPT4o_Transcribe",
      returnType: "str",
      fieldOverrides: {
        audio: { propType: "audio" },
      },
    },
  },
};
