import type { ModuleConfig } from "../types.js";

export const config: ModuleConfig = {
  configs: {
    "fal-ai/elevenlabs/voice-changer": {
      className: "ElevenlabsVoiceChanger",
      docstring:
        "ElevenLabs Voice Changer transforms voice characteristics in audio with AI-powered voice conversion.",
      tags: [
        "audio",
        "voice-change",
        "elevenlabs",
        "transformation",
        "audio-to-audio"
      ],
      useCases: [
        "Change voice characteristics in audio",
        "Transform vocal qualities",
        "Create voice variations",
        "Modify speaker identity",
        "Generate voice-changed audio"
      ],
      basicFields: ["audio"]
    },
    "fal-ai/nova-sr": {
      className: "NovaSr",
      docstring:
        "Nova SR enhances audio quality through super-resolution processing for clearer and richer sound.",
      tags: [
        "audio",
        "enhancement",
        "super-resolution",
        "quality",
        "audio-to-audio"
      ],
      useCases: [
        "Enhance audio quality",
        "Improve sound clarity",
        "Upscale audio resolution",
        "Restore degraded audio",
        "Generate high-quality audio"
      ],
      basicFields: ["audio"]
    },
    "fal-ai/deepfilternet3": {
      className: "Deepfilternet3",
      docstring:
        "DeepFilterNet3 removes noise and improves audio quality with advanced deep learning filtering.",
      tags: [
        "audio",
        "noise-reduction",
        "filtering",
        "cleaning",
        "audio-to-audio"
      ],
      useCases: [
        "Remove noise from audio",
        "Clean audio recordings",
        "Filter unwanted sounds",
        "Improve audio clarity",
        "Generate clean audio"
      ],
      basicFields: ["audio"]
    },
    "fal-ai/sam-audio/separate": {
      className: "SamAudioSeparate",
      docstring:
        "SAM Audio Separate isolates and extracts different audio sources from mixed recordings.",
      tags: [
        "audio",
        "separation",
        "source-extraction",
        "isolation",
        "audio-to-audio"
      ],
      useCases: [
        "Separate audio sources",
        "Extract vocals from music",
        "Isolate instruments",
        "Remove background sounds",
        "Generate separated audio tracks"
      ],
      basicFields: ["audio"]
    },
    "fal-ai/sam-audio/span-separate": {
      className: "SamAudioSpanSeparate",
      docstring:
        "SAM Audio Span Separate isolates audio sources across time spans with precise temporal control.",
      tags: ["audio", "separation", "temporal", "span", "audio-to-audio"],
      useCases: [
        "Separate audio by time spans",
        "Extract sources in specific periods",
        "Isolate temporal audio segments",
        "Remove sounds in time ranges",
        "Generate time-based separations"
      ],
      basicFields: ["audio"]
    },
    "fal-ai/demucs": {
      className: "Demucs",
      docstring:
        "Demucs separates music into vocals, drums, bass, and other instruments with high quality.",
      tags: ["audio", "music-separation", "stems", "demucs", "audio-to-audio"],
      useCases: [
        "Separate music into stems",
        "Extract vocals from songs",
        "Isolate instruments in music",
        "Create karaoke tracks",
        "Generate individual audio stems"
      ],
      basicFields: ["audio"]
    },
    "fal-ai/stable-audio-25/audio-to-audio": {
      className: "StableAudio25AudioToAudio",
      docstring:
        "Stable Audio 2.5 transforms and modifies audio with AI-powered processing and effects.",
      tags: [
        "audio",
        "transformation",
        "stable-audio",
        "2.5",
        "audio-to-audio"
      ],
      useCases: [
        "Transform audio characteristics",
        "Apply AI-powered audio effects",
        "Modify audio properties",
        "Generate audio variations",
        "Create processed audio"
      ],
      basicFields: ["audio", "prompt"]
    },
    "fal-ai/ffmpeg-api/merge-audios": {
      className: "FfmpegApiMergeAudios",
      docstring:
        "FFmpeg API Merge Audios combines multiple audio files into a single output.",
      tags: ["audio", "processing", "audio-to-audio", "merging", "ffmpeg"],
      useCases: [
        "Combine multiple audio tracks",
        "Merge audio segments",
        "Create audio compilations",
        "Join split audio files",
        "Generate combined audio output"
      ],
      basicFields: ["audio"]
    },
    "fal-ai/kling-video/create-voice": {
      className: "KlingVideoCreateVoice",
      docstring: "Create Voices to be used with Kling 2.6 Voice Control",
      tags: ["audio", "processing", "audio-to-audio", "transformation"],
      useCases: [
        "Audio enhancement and processing",
        "Voice transformation",
        "Audio style transfer",
        "Sound quality improvement",
        "Audio effect application"
      ]
    },
    "fal-ai/audio-understanding": {
      className: "AudioUnderstanding",
      docstring:
        "A audio understanding model to analyze audio content and answer questions about what's happening in the audio based on user prompts.",
      tags: ["audio", "processing", "audio-to-audio", "transformation"],
      useCases: [
        "Audio enhancement and processing",
        "Voice transformation",
        "Audio style transfer",
        "Sound quality improvement",
        "Audio effect application"
      ]
    },
    "fal-ai/stable-audio-25/inpaint": {
      className: "StableAudio25Inpaint",
      docstring:
        "Generate high quality music and sound effects using Stable Audio 2.5 from StabilityAI",
      tags: ["audio", "processing", "audio-to-audio", "transformation"],
      useCases: [
        "Audio enhancement and processing",
        "Voice transformation",
        "Audio style transfer",
        "Sound quality improvement",
        "Audio effect application"
      ]
    },
    "sonauto/v2/extend": {
      className: "SonautoV2Extend",
      docstring: "Extend an existing song",
      tags: ["audio", "processing", "audio-to-audio", "transformation"],
      useCases: [
        "Audio enhancement and processing",
        "Voice transformation",
        "Audio style transfer",
        "Sound quality improvement",
        "Audio effect application"
      ]
    },
    "fal-ai/ace-step/audio-outpaint": {
      className: "AceStepAudioOutpaint",
      docstring:
        "Extend the beginning or end of provided audio with lyrics and/or style using ACE-Step",
      tags: ["audio", "processing", "audio-to-audio", "transformation"],
      useCases: [
        "Audio enhancement and processing",
        "Voice transformation",
        "Audio style transfer",
        "Sound quality improvement",
        "Audio effect application"
      ]
    },
    "fal-ai/ace-step/audio-inpaint": {
      className: "AceStepAudioInpaint",
      docstring:
        "Modify a portion of provided audio with lyrics and/or style using ACE-Step",
      tags: ["audio", "processing", "audio-to-audio", "transformation"],
      useCases: [
        "Audio enhancement and processing",
        "Voice transformation",
        "Audio style transfer",
        "Sound quality improvement",
        "Audio effect application"
      ]
    },
    "fal-ai/ace-step/audio-to-audio": {
      className: "AceStepAudioToAudio",
      docstring:
        "Generate music from a lyrics and example audio using ACE-Step",
      tags: ["audio", "processing", "audio-to-audio", "transformation"],
      useCases: [
        "Audio enhancement and processing",
        "Voice transformation",
        "Audio style transfer",
        "Sound quality improvement",
        "Audio effect application"
      ]
    },
    "fal-ai/dia-tts/voice-clone": {
      className: "DiaTtsVoiceClone",
      docstring:
        "Clone dialog voices from a sample audio and generate dialogs from text prompts using the Dia TTS which leverages advanced AI techniques to create high-quality text-to-speech.",
      tags: ["audio", "processing", "audio-to-audio", "transformation"],
      useCases: [
        "Audio enhancement and processing",
        "Voice transformation",
        "Audio style transfer",
        "Sound quality improvement",
        "Audio effect application"
      ]
    },
    "fal-ai/elevenlabs/audio-isolation": {
      className: "ElevenlabsAudioIsolation",
      docstring:
        "Isolate audio tracks using ElevenLabs advanced audio isolation technology.",
      tags: ["audio", "processing", "audio-to-audio", "transformation"],
      useCases: [
        "Audio enhancement and processing",
        "Voice transformation",
        "Audio style transfer",
        "Sound quality improvement",
        "Audio effect application"
      ]
    }
  }
};
