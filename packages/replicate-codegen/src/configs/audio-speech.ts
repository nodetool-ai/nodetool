import type { ModuleConfig } from "../types.js";

export const audioSpeechConfig: ModuleConfig = {
  configs: {
    "elevenlabs/flash-v2.5": {
      className: "ElevenLabs_Flash_V2_5",
      returnType: "audio"
    },
    "elevenlabs/turbo-v2.5": {
      className: "ElevenLabs_Turbo_V2_5",
      returnType: "audio"
    },
    "elevenlabs/v2-multilingual": {
      className: "ElevenLabs_V2_Multilingual",
      returnType: "audio"
    },
    "elevenlabs/v3": { className: "ElevenLabs_V3", returnType: "audio" },
    "elevenlabs/music": { className: "ElevenLabs_Music", returnType: "audio" },
    "inworld/tts-1.5-max": {
      className: "Inworld_TTS_Max",
      returnType: "audio"
    },
    "inworld/tts-1.5-mini": {
      className: "Inworld_TTS_Mini",
      returnType: "audio"
    },
    "jaaari/kokoro-82m": { className: "Kokoro_82M", returnType: "audio" },
    "lucataco/xtts-v2": { className: "XTTS_V2", returnType: "audio" },
    "lucataco/orpheus-3b-0.1-ft": {
      className: "Orpheus_3B",
      returnType: "audio"
    },
    "lucataco/csm-1b": { className: "CSM_1B", returnType: "audio" },
    "cjwbw/parler-tts": { className: "Parler_TTS", returnType: "audio" },
    "cjwbw/voicecraft": { className: "VoiceCraft", returnType: "audio" },
    "chenxwh/openvoice": { className: "OpenVoice", returnType: "audio" },
    "playht/text-to-speech": { className: "PlayHT_TTS", returnType: "audio" },
    "x-lance/f5-tts": { className: "F5_TTS", returnType: "audio" },
    "fermatresearch/spanish-f5-tts": {
      className: "Spanish_F5_TTS",
      returnType: "audio"
    },
    "qwen/qwen3-tts": { className: "Qwen3_TTS", returnType: "audio" },
    "resemble-ai/chatterbox": { className: "Chatterbox", returnType: "audio" },
    "resemble-ai/chatterbox-multilingual": {
      className: "Chatterbox_Multilingual",
      returnType: "audio"
    },
    "resemble-ai/chatterbox-pro": {
      className: "Chatterbox_Pro",
      returnType: "audio"
    },
    "resemble-ai/chatterbox-turbo": {
      className: "Chatterbox_Turbo",
      returnType: "audio"
    },
    "minimax/speech-02-hd": { className: "Speech_02_HD", returnType: "audio" },
    "minimax/speech-02-turbo": {
      className: "Speech_02_Turbo",
      returnType: "audio"
    },
    "minimax/speech-2.6-hd": {
      className: "Speech_2_6_HD",
      returnType: "audio"
    },
    "minimax/speech-2.6-turbo": {
      className: "Speech_2_6_Turbo",
      returnType: "audio"
    },
    "minimax/speech-2.8-turbo": {
      className: "Speech_2_8_Turbo",
      returnType: "audio"
    },
    "minimax/voice-cloning": {
      className: "Voice_Cloning",
      returnType: "audio"
    },
    "minimax/music-1.5": { className: "Music_1_5", returnType: "audio" },
    "stability-ai/stable-audio-2.5": {
      className: "Stable_Audio_2_5",
      returnType: "audio"
    },
    "lucataco/ace-step": { className: "AceStep", returnType: "audio" },
    "lucataco/magnet": { className: "MAGNeT", returnType: "audio" },
    "sakemin/musicgen-chord": {
      className: "MusicGen_Chord",
      returnType: "audio"
    },
    "sakemin/musicgen-remixer": {
      className: "MusicGen_Remixer",
      returnType: "audio",
      fieldOverrides: { audio: { propType: "audio" } }
    },
    "sakemin/musicgen-stereo-chord": {
      className: "MusicGen_Stereo_Chord",
      returnType: "audio"
    },
    "andreasjansson/musicgen-looper": {
      className: "MusicGen_Looper",
      returnType: "audio"
    },
    "zsxkib/flux-music": { className: "Flux_Music", returnType: "audio" },
    "zsxkib/dia": { className: "Dia", returnType: "audio" },
    "zsxkib/thinksound": { className: "ThinkSound", returnType: "audio" }
  }
};
