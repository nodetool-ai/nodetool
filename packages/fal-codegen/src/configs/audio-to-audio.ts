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
      ]
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
      ]
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
      ]
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
      ]
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
      ]
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
      ]
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
      ]
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
      ]
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
    },
    "fal-ai/personaplex": {
      className: "Personaplex",
      docstring:
        "PersonaPlex is a real-time, full-duplex speech-to-speech conversational model that enables persona control through text-based role prompts and audio-based voice conditioning.",
      tags: ["processing", "audio-to-audio", "audio", "personaplex"],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "fal-ai/personaplex/realtime": {
      className: "PersonaplexRealtime",
      docstring:
        "PersonaPlex is a real-time, full-duplex speech-to-speech conversational model that enables persona control through text-based role prompts and audio-based voice conditioning.",
      tags: [
        "processing",
        "audio-to-audio",
        "audio",
        "personaplex",
        "realtime"
      ],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "fal-ai/stable-audio-3/medium/audio-inpainting": {
      className: "StableAudio3MediumAudioInpainting",
      docstring:
        "Stable Audio 3 Medium audio inpainting is a 1.4 billion parameter latent diffusion model that fills in or reworks selected segments of a stereo track guided by text prompts, supporting single- and multi-segment editing.",
      tags: [
        "processing",
        "audio-to-audio",
        "audio",
        "stable",
        "medium",
        "inpainting"
      ],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "fal-ai/stable-audio-3/medium/audio-outpainting": {
      className: "StableAudio3MediumAudioOutpainting",
      docstring:
        "Stable Audio 3 Medium audio outpainting is a 1.4 billion parameter latent diffusion model that extends existing stereo audio beyond its original endpoint via causal continuation guided by text prompts.",
      tags: [
        "processing",
        "audio-to-audio",
        "audio",
        "stable",
        "medium",
        "outpainting"
      ],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "fal-ai/stable-audio-3/medium/audio-to-audio": {
      className: "StableAudio3MediumAudioToAudio",
      docstring:
        "Stable Audio 3 Medium audio-to-audio is a 1.4 billion parameter latent diffusion model that transforms an input audio clip into new stereo variations up to 6 minutes guided by a text prompt.",
      tags: ["processing", "audio-to-audio", "audio", "stable", "medium"],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "fal-ai/stable-audio-3/medium/base/audio-inpainting": {
      className: "StableAudio3MediumBaseAudioInpainting",
      docstring:
        "Stable Audio 3 Medium Base audio inpainting is the foundational 1.4 billion parameter checkpoint for editing or filling selected stereo audio segments guided by text prompts.",
      tags: [
        "processing",
        "audio-to-audio",
        "audio",
        "stable",
        "medium",
        "base",
        "inpainting"
      ],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "fal-ai/stable-audio-3/medium/base/audio-outpainting": {
      className: "StableAudio3MediumBaseAudioOutpainting",
      docstring:
        "Stable Audio 3 Medium Base audio outpainting is the foundational 1.4 billion parameter checkpoint that extends existing stereo audio with causal continuation guided by text prompts.",
      tags: [
        "processing",
        "audio-to-audio",
        "audio",
        "stable",
        "medium",
        "base",
        "outpainting"
      ],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "fal-ai/stable-audio-3/medium/base/audio-to-audio": {
      className: "StableAudio3MediumBaseAudioToAudio",
      docstring:
        "Stable Audio 3 Medium Base audio-to-audio is the foundational 1.4 billion parameter checkpoint that transforms input audio into new stereo variations up to 6 minutes guided by text prompts.",
      tags: [
        "processing",
        "audio-to-audio",
        "audio",
        "stable",
        "medium",
        "base"
      ],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "fal-ai/stable-audio-3/small/music/audio-inpainting": {
      className: "StableAudio3SmallMusicAudioInpainting",
      docstring:
        "Stable Audio 3 Small Music audio inpainting is a 459 million parameter latent diffusion model that fills in or reworks selected segments of a music track guided by text prompts.",
      tags: [
        "processing",
        "audio-to-audio",
        "audio",
        "stable",
        "small",
        "music",
        "inpainting"
      ],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "fal-ai/stable-audio-3/small/music/audio-outpainting": {
      className: "StableAudio3SmallMusicAudioOutpainting",
      docstring:
        "Stable Audio 3 Small Music audio outpainting is a 459 million parameter latent diffusion model that extends music compositions beyond their original endpoint via causal continuation.",
      tags: [
        "processing",
        "audio-to-audio",
        "audio",
        "stable",
        "small",
        "music",
        "outpainting"
      ],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "fal-ai/stable-audio-3/small/music/audio-to-audio": {
      className: "StableAudio3SmallMusicAudioToAudio",
      docstring:
        "Stable Audio 3 Small Music audio-to-audio is a 459 million parameter latent diffusion model that transforms input music into new variations up to 2 minutes guided by text prompts.",
      tags: [
        "processing",
        "audio-to-audio",
        "audio",
        "stable",
        "small",
        "music"
      ],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "fal-ai/stable-audio-3/small/music/base/audio-inpainting": {
      className: "StableAudio3SmallMusicBaseAudioInpainting",
      docstring:
        "Stable Audio 3 Small Music Base audio inpainting is the foundational 459 million parameter checkpoint for editing or filling selected music segments guided by text prompts.",
      tags: [
        "processing",
        "audio-to-audio",
        "audio",
        "stable",
        "small",
        "music",
        "base",
        "inpainting"
      ],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "fal-ai/stable-audio-3/small/music/base/audio-outpainting": {
      className: "StableAudio3SmallMusicBaseAudioOutpainting",
      docstring:
        "Stable Audio 3 Small Music Base audio outpainting is the foundational 459 million parameter checkpoint that extends music tracks via causal continuation guided by text prompts.",
      tags: [
        "processing",
        "audio-to-audio",
        "audio",
        "stable",
        "small",
        "music",
        "base",
        "outpainting"
      ],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "fal-ai/stable-audio-3/small/music/base/audio-to-audio": {
      className: "StableAudio3SmallMusicBaseAudioToAudio",
      docstring:
        "Stable Audio 3 Small Music Base audio-to-audio is the foundational 459 million parameter checkpoint that transforms input music into new variations up to 2 minutes guided by text prompts.",
      tags: [
        "processing",
        "audio-to-audio",
        "audio",
        "stable",
        "small",
        "music",
        "base"
      ],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "fal-ai/stable-audio-3/small/sfx/audio-inpainting": {
      className: "StableAudio3SmallSfxAudioInpainting",
      docstring:
        "Stable Audio 3 Small SFX audio inpainting is a 459 million parameter latent diffusion model that fills in or reworks selected segments of a sound-effect track guided by text prompts.",
      tags: [
        "processing",
        "audio-to-audio",
        "audio",
        "stable",
        "small",
        "sfx",
        "inpainting"
      ],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "fal-ai/stable-audio-3/small/sfx/audio-outpainting": {
      className: "StableAudio3SmallSfxAudioOutpainting",
      docstring:
        "Stable Audio 3 Small SFX audio outpainting is a 459 million parameter latent diffusion model that extends sound-effect tracks beyond their original endpoint via causal continuation.",
      tags: [
        "processing",
        "audio-to-audio",
        "audio",
        "stable",
        "small",
        "sfx",
        "outpainting"
      ],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "fal-ai/stable-audio-3/small/sfx/audio-to-audio": {
      className: "StableAudio3SmallSfxAudioToAudio",
      docstring:
        "Stable Audio 3 Small SFX audio-to-audio is a 459 million parameter latent diffusion model that transforms input audio into new sound-effect variations guided by text prompts.",
      tags: ["processing", "audio-to-audio", "audio", "stable", "small", "sfx"],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "fal-ai/stable-audio-3/small/sfx/base/audio-inpainting": {
      className: "StableAudio3SmallSfxBaseAudioInpainting",
      docstring:
        "Stable Audio 3 Small SFX Base audio inpainting is the foundational 459 million parameter checkpoint for editing or filling selected sound-effect segments guided by text prompts.",
      tags: [
        "processing",
        "audio-to-audio",
        "audio",
        "stable",
        "small",
        "sfx",
        "base",
        "inpainting"
      ],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "fal-ai/stable-audio-3/small/sfx/base/audio-outpainting": {
      className: "StableAudio3SmallSfxBaseAudioOutpainting",
      docstring:
        "Stable Audio 3 Small SFX Base audio outpainting is the foundational 459 million parameter checkpoint that extends sound-effect tracks via causal continuation guided by text prompts.",
      tags: [
        "processing",
        "audio-to-audio",
        "audio",
        "stable",
        "small",
        "sfx",
        "base",
        "outpainting"
      ],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "fal-ai/stable-audio-3/small/sfx/base/audio-to-audio": {
      className: "StableAudio3SmallSfxBaseAudioToAudio",
      docstring:
        "Stable Audio 3 Small SFX Base audio-to-audio is the foundational 459 million parameter checkpoint that transforms input audio into new sound-effect variations guided by text prompts.",
      tags: [
        "processing",
        "audio-to-audio",
        "audio",
        "stable",
        "small",
        "sfx",
        "base"
      ],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "fal-ai/tada/1b/text-to-speech": {
      className: "Tada1bTextToSpeech",
      docstring:
        "A unified speech-language model that synchronizes speech and text into a single, cohesive stream via 1:1 alignment. Lighter 1B variant",
      tags: ["processing", "audio-to-audio", "audio", "tada", "1b", "speech"],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "fal-ai/tada/3b/text-to-speech": {
      className: "Tada3bTextToSpeech",
      docstring:
        "A unified speech-language model that synchronizes speech and text into a single, cohesive stream via 1:1 alignment.",
      tags: ["processing", "audio-to-audio", "audio", "tada", "3b", "speech"],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "fal-ai/workflow-utilities/audio-compressor": {
      className: "WorkflowUtilitiesAudioCompressor",
      docstring: "FFMPEG Utility for Audio Compression",
      tags: [
        "processing",
        "audio-to-audio",
        "audio",
        "workflow",
        "utilities",
        "compressor"
      ],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "fal-ai/workflow-utilities/impulse-response": {
      className: "WorkflowUtilitiesImpulseResponse",
      docstring: "FFMPEG Utility for Impulse Response",
      tags: [
        "processing",
        "audio-to-audio",
        "audio",
        "workflow",
        "utilities",
        "impulse",
        "response"
      ],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "mirelo-ai/sfx1.6/extend-audio": {
      className: "Sfx16ExtendAudio",
      docstring: "Extend any sound effect with seamless, natural tails.",
      tags: [
        "processing",
        "audio-to-audio",
        "audio",
        "mirelo",
        "sfx1",
        "extend",
        "mirelo-ai"
      ],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "mirelo-ai/sfx1.6/inpaint-audio": {
      className: "Sfx16InpaintAudio",
      docstring:
        "Erase and replace any moment in your audio with AI-driven precision.",
      tags: [
        "processing",
        "audio-to-audio",
        "audio",
        "mirelo",
        "sfx1",
        "inpaint",
        "mirelo-ai"
      ],
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
