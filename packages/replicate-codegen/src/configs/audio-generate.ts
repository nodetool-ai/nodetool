import type { ModuleConfig } from "../types.js";

export const audioGenerateConfig: ModuleConfig = {
  configs: {
    "zsxkib/realistic-voice-cloning": {
      className: "RealisticVoiceCloning",
      returnType: "audio",
      fieldOverrides: {
        song_input: { propType: "audio" }
      }
    },
    "afiaka87/tortoise-tts": {
      className: "TortoiseTTS",
      returnType: "audio",
      fieldOverrides: {
        custom_voice: { propType: "audio" }
      }
    },
    "adirik/styletts2": {
      className: "StyleTTS2",
      returnType: "audio",
      fieldOverrides: {
        reference: { propType: "audio" }
      }
    },
    "riffusion/riffusion": {
      className: "Riffusion",
      returnType: "audio",
      fieldOverrides: {
        song_input: { propType: "audio" }
      }
    },
    "meta/musicgen": {
      className: "MusicGen",
      returnType: "audio"
    },
    "zsxkib/mmaudio": {
      className: "MMAudio",
      returnType: "audio"
    },
    "google/lyria-2": {
      className: "Lyria_2",
      returnType: "audio"
    },
    "minimax/speech-2.8-hd": {
      className: "Speech_2_8_HD",
      returnType: "audio"
    }
  }
};
