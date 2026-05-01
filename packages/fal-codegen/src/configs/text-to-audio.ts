import type { ModuleConfig } from "../types.js";

export const config: ModuleConfig = {
  configs: {
    "fal-ai/ace-step/prompt-to-audio": {
      className: "ACEStepPromptToAudio",
      docstring:
        "ACE-Step generates music from text prompts with high-quality audio synthesis.",
      tags: ["audio", "generation", "music", "ace-step", "text-to-audio"],
      useCases: [
        "Generate music from text descriptions",
        "Create background music for videos",
        "Produce royalty-free music",
        "Generate audio soundtracks",
        "Create custom music compositions"
      ],
      basicFields: ["prompt"]
    },
    "fal-ai/ace-step": {
      className: "ACEStep",
      docstring:
        "ACE-Step generates music with lyrics from text using advanced audio synthesis.",
      tags: [
        "audio",
        "generation",
        "music",
        "lyrics",
        "ace-step",
        "text-to-audio"
      ],
      useCases: [
        "Generate songs with lyrics",
        "Create music with vocal tracks",
        "Produce complete songs from text",
        "Generate lyrical content",
        "Create vocal music compositions"
      ],
      basicFields: ["prompt"]
    },
    "fal-ai/csm-1b": {
      className: "CSM1B",
      docstring:
        "CSM (Conversational Speech Model) generates natural conversational speech from text.",
      tags: ["audio", "speech", "tts", "conversational", "text-to-speech"],
      useCases: [
        "Generate natural conversation audio",
        "Create dialogue for characters",
        "Produce conversational voice content",
        "Generate realistic speech",
        "Create interactive voice responses"
      ],
      basicFields: ["text"]
    },
    "fal-ai/diffrhythm": {
      className: "DiffRhythm",
      docstring:
        "DiffRhythm generates rhythmic music and beats using diffusion models.",
      tags: [
        "audio",
        "generation",
        "rhythm",
        "beats",
        "music",
        "text-to-audio"
      ],
      useCases: [
        "Generate rhythmic music",
        "Create drum beats",
        "Produce percussion tracks",
        "Generate rhythm patterns",
        "Create beat sequences"
      ],
      basicFields: ["prompt"]
    },
    "fal-ai/elevenlabs/tts/multilingual-v2": {
      className: "ElevenLabsTTSMultilingualV2",
      docstring:
        "ElevenLabs Multilingual TTS v2 generates natural speech in multiple languages.",
      tags: [
        "audio",
        "tts",
        "speech",
        "multilingual",
        "elevenlabs",
        "text-to-speech"
      ],
      useCases: [
        "Generate multilingual speech",
        "Create voiceovers in multiple languages",
        "Produce localized audio content",
        "Generate international voice content",
        "Create translated audio"
      ],
      basicFields: ["text", "language"]
    },
    "fal-ai/elevenlabs/text-to-dialogue/eleven-v3": {
      className: "ElevenLabsTextToDialogueV3",
      docstring:
        "ElevenLabs Text to Dialogue v3 generates conversational dialogue with multiple speakers.",
      tags: [
        "audio",
        "dialogue",
        "conversation",
        "elevenlabs",
        "text-to-speech"
      ],
      useCases: [
        "Generate multi-speaker dialogue",
        "Create conversational audio",
        "Produce podcast-style content",
        "Generate character conversations",
        "Create interactive dialogues"
      ],
      basicFields: ["text"]
    },
    "fal-ai/elevenlabs/sound-effects/v2": {
      className: "ElevenLabsSoundEffectsV2",
      docstring:
        "ElevenLabs Sound Effects v2 generates custom sound effects from text descriptions.",
      tags: ["audio", "sound-effects", "sfx", "elevenlabs", "text-to-audio"],
      useCases: [
        "Generate custom sound effects",
        "Create audio effects for videos",
        "Produce game sound effects",
        "Generate environmental sounds",
        "Create audio atmosphere"
      ],
      basicFields: ["prompt"]
    },
    "fal-ai/elevenlabs/tts/eleven-v3": {
      className: "ElevenLabsTTSV3",
      docstring:
        "ElevenLabs TTS v3 generates high-quality natural speech with advanced voice control.",
      tags: ["audio", "tts", "speech", "elevenlabs", "text-to-speech"],
      useCases: [
        "Generate high-quality voiceovers",
        "Create natural speech audio",
        "Produce professional narration",
        "Generate expressive speech",
        "Create audiobook content"
      ],
      basicFields: ["text"]
    },
    "fal-ai/elevenlabs/music": {
      className: "ElevenLabsMusic",
      docstring:
        "ElevenLabs Music generates custom music compositions from text descriptions.",
      tags: ["audio", "music", "generation", "elevenlabs", "text-to-audio"],
      useCases: [
        "Generate custom music",
        "Create background scores",
        "Produce original compositions",
        "Generate mood music",
        "Create cinematic soundtracks"
      ],
      basicFields: ["prompt"]
    },
    "fal-ai/f5-tts": {
      className: "F5TTS",
      docstring:
        "F5 TTS generates natural speech with fast inference and high quality.",
      tags: ["audio", "tts", "speech", "fast", "text-to-speech"],
      useCases: [
        "Fast speech generation",
        "Real-time TTS applications",
        "Quick voiceover creation",
        "Efficient speech synthesis",
        "Rapid audio production"
      ],
      basicFields: ["text"]
    },
    "fal-ai/kokoro": {
      className: "Kokoro",
      docstring:
        "Kokoro generates expressive and emotional speech with advanced prosody control.",
      tags: [
        "audio",
        "tts",
        "speech",
        "expressive",
        "emotional",
        "text-to-speech"
      ],
      useCases: [
        "Generate expressive speech",
        "Create emotional voiceovers",
        "Produce dramatic narration",
        "Generate character voices",
        "Create emotive audio content"
      ],
      basicFields: ["text"]
    },
    "fal-ai/lumina-next-music": {
      className: "LuminaNextMusic",
      docstring:
        "Lumina Next Music generates advanced music compositions with sophisticated arrangements.",
      tags: [
        "audio",
        "music",
        "generation",
        "lumina",
        "advanced",
        "text-to-audio"
      ],
      useCases: [
        "Generate sophisticated music",
        "Create complex arrangements",
        "Produce advanced compositions",
        "Generate professional music",
        "Create layered soundtracks"
      ],
      basicFields: ["prompt"]
    },
    "fal-ai/suno-ai": {
      className: "SunoAI",
      docstring:
        "Suno AI generates complete songs with vocals and instrumentals from text.",
      tags: ["audio", "music", "song", "generation", "suno", "text-to-audio"],
      useCases: [
        "Generate complete songs",
        "Create vocal tracks with music",
        "Produce original songs",
        "Generate music with lyrics",
        "Create full audio productions"
      ],
      basicFields: ["prompt"]
    },
    "fal-ai/stable-audio": {
      className: "StableAudio",
      docstring:
        "Stable Audio generates high-quality audio from text with consistent results.",
      tags: ["audio", "generation", "stable", "music", "text-to-audio"],
      useCases: [
        "Generate consistent audio",
        "Create reliable soundtracks",
        "Produce predictable audio",
        "Generate stable music",
        "Create dependable audio content"
      ],
      basicFields: ["prompt"]
    },
    "fal-ai/xtts": {
      className: "XTTS",
      docstring:
        "XTTS generates expressive speech with voice cloning capabilities.",
      tags: [
        "audio",
        "tts",
        "speech",
        "voice-cloning",
        "expressive",
        "text-to-speech"
      ],
      useCases: [
        "Clone and generate voices",
        "Create personalized speech",
        "Produce voice-matched content",
        "Generate custom voice audio",
        "Create voice replications"
      ],
      basicFields: ["text"]
    },
    "fal-ai/joyous": {
      className: "Joyous",
      docstring:
        "Joyous generates upbeat and cheerful music from text descriptions.",
      tags: [
        "audio",
        "music",
        "generation",
        "upbeat",
        "cheerful",
        "text-to-audio"
      ],
      useCases: [
        "Generate cheerful music",
        "Create upbeat soundtracks",
        "Produce happy audio content",
        "Generate positive music",
        "Create energetic compositions"
      ],
      basicFields: ["prompt"]
    },
    "fal-ai/metavoice": {
      className: "MetaVoice",
      docstring:
        "MetaVoice generates natural speech with advanced voice characteristics control.",
      tags: ["audio", "tts", "speech", "metavoice", "text-to-speech"],
      useCases: [
        "Generate natural speech",
        "Control voice characteristics",
        "Create varied voice outputs",
        "Produce customized speech",
        "Generate flexible audio content"
      ],
      basicFields: ["text"]
    },
    "fal-ai/piper-tts": {
      className: "PiperTTS",
      docstring: "Piper TTS generates fast, efficient speech with low latency.",
      tags: ["audio", "tts", "speech", "fast", "efficient", "text-to-speech"],
      useCases: [
        "Fast speech generation",
        "Low-latency TTS",
        "Efficient audio production",
        "Real-time speech synthesis",
        "Quick voiceover creation"
      ],
      basicFields: ["text"]
    },
    "fal-ai/riffusion": {
      className: "Riffusion",
      docstring:
        "Riffusion generates music using diffusion models for creative audio synthesis.",
      tags: [
        "audio",
        "music",
        "generation",
        "diffusion",
        "riffusion",
        "text-to-audio"
      ],
      useCases: [
        "Generate creative music",
        "Create experimental audio",
        "Produce unique soundscapes",
        "Generate artistic compositions",
        "Create innovative music"
      ],
      basicFields: ["prompt"]
    },
    "fal-ai/vocalremover": {
      className: "VocalRemover",
      docstring:
        "Vocal Remover separates vocals from music to create instrumental versions.",
      tags: [
        "audio",
        "vocal-separation",
        "karaoke",
        "instrumental",
        "processing"
      ],
      useCases: [
        "Create karaoke tracks",
        "Extract instrumentals",
        "Remove vocals from songs",
        "Separate audio stems",
        "Create background music"
      ],
      basicFields: ["audio"]
    },
    "fal-ai/minimax-music/v2": {
      className: "MinimaxMusicV2",
      docstring: "Minimax Music",
      tags: ["audio", "generation", "text-to-audio", "tts", "professional"],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "beatoven/sound-effect-generation": {
      className: "BeatovenSoundEffectGeneration",
      docstring: "Sound Effect Generation",
      tags: ["audio", "generation", "text-to-audio", "tts"],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "beatoven/music-generation": {
      className: "BeatovenMusicGeneration",
      docstring: "Music Generation",
      tags: ["audio", "generation", "text-to-audio", "tts"],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "fal-ai/minimax-music/v1.5": {
      className: "MinimaxMusicV15",
      docstring: "MiniMax (Hailuo AI) Music v1.5",
      tags: ["audio", "generation", "text-to-audio", "tts", "professional"],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "fal-ai/stable-audio-25/text-to-audio": {
      className: "StableAudio25TextToAudio",
      docstring: "Stable Audio 2.5",
      tags: ["audio", "generation", "text-to-audio", "tts"],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "sonauto/v2/inpaint": {
      className: "SonautoV2Inpaint",
      docstring: "Sonauto V2",
      tags: ["audio", "generation", "text-to-audio", "tts"],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "sonauto/v2/text-to-music": {
      className: "SonautoV2TextToMusic",
      docstring: "Create full songs in any style",
      tags: ["audio", "generation", "text-to-audio", "sound"],
      useCases: [
        "Sound effect generation",
        "Music composition",
        "Audio content creation",
        "Background music generation",
        "Podcast audio production"
      ]
    },
    "fal-ai/lyria2": {
      className: "Lyria2",
      docstring:
        "Lyria 2 is Google's latest music generation model, you can generate any type of music with this model.",
      tags: ["audio", "generation", "text-to-audio", "sound"],
      useCases: [
        "Sound effect generation",
        "Music composition",
        "Audio content creation",
        "Background music generation",
        "Podcast audio production"
      ]
    },
    "cassetteai/sound-effects-generator": {
      className: "CassetteaiSoundEffectsGenerator",
      docstring:
        "Create stunningly realistic sound effects in seconds - CassetteAI's Sound Effects Model generates high-quality SFX up to 30 seconds long in just 1 second of processing time",
      tags: ["audio", "generation", "text-to-audio", "sound"],
      useCases: [
        "Sound effect generation",
        "Music composition",
        "Audio content creation",
        "Background music generation",
        "Podcast audio production"
      ]
    },
    "cassetteai/music-generator": {
      className: "CassetteaiMusicGenerator",
      docstring:
        "CassetteAI's model generates a 30-second sample in under 2 seconds and a full 3-minute track in under 10 seconds. At 44.1 kHz stereo audio, expect a level of professional consistency with no breaks, no squeaks, and no random interruptions in your creations.",
      tags: ["audio", "generation", "text-to-audio", "sound"],
      useCases: [
        "Sound effect generation",
        "Music composition",
        "Audio content creation",
        "Background music generation",
        "Podcast audio production"
      ]
    },
    "fal-ai/kokoro/hindi": {
      className: "KokoroHindi",
      docstring:
        "A fast and expressive Hindi text-to-speech model with clear pronunciation and accurate intonation.",
      tags: ["audio", "generation", "text-to-audio", "sound"],
      useCases: [
        "Sound effect generation",
        "Music composition",
        "Audio content creation",
        "Background music generation",
        "Podcast audio production"
      ]
    },
    "fal-ai/kokoro/british-english": {
      className: "KokoroBritishEnglish",
      docstring:
        "A high-quality British English text-to-speech model offering natural and expressive voice synthesis.",
      tags: ["audio", "generation", "text-to-audio", "sound"],
      useCases: [
        "Sound effect generation",
        "Music composition",
        "Audio content creation",
        "Background music generation",
        "Podcast audio production"
      ]
    },
    "fal-ai/kokoro/american-english": {
      className: "KokoroAmericanEnglish",
      docstring:
        "Kokoro is a lightweight text-to-speech model that delivers comparable quality to larger models while being significantly faster and more cost-efficient.",
      tags: ["audio", "generation", "text-to-audio", "sound"],
      useCases: [
        "Sound effect generation",
        "Music composition",
        "Audio content creation",
        "Background music generation",
        "Podcast audio production"
      ]
    },
    "fal-ai/zonos": {
      className: "Zonos",
      docstring:
        "Clone voice of any person and speak anything in their voice using zonos' voice cloning.",
      tags: ["audio", "generation", "text-to-audio", "sound"],
      useCases: [
        "Sound effect generation",
        "Music composition",
        "Audio content creation",
        "Background music generation",
        "Podcast audio production"
      ]
    },
    "fal-ai/kokoro/italian": {
      className: "KokoroItalian",
      docstring:
        "A high-quality Italian text-to-speech model delivering smooth and expressive speech synthesis.",
      tags: ["audio", "generation", "text-to-audio", "sound"],
      useCases: [
        "Sound effect generation",
        "Music composition",
        "Audio content creation",
        "Background music generation",
        "Podcast audio production"
      ]
    },
    "fal-ai/kokoro/brazilian-portuguese": {
      className: "KokoroBrazilianPortuguese",
      docstring:
        "A natural and expressive Brazilian Portuguese text-to-speech model optimized for clarity and fluency.",
      tags: ["audio", "generation", "text-to-audio", "sound"],
      useCases: [
        "Sound effect generation",
        "Music composition",
        "Audio content creation",
        "Background music generation",
        "Podcast audio production"
      ]
    },
    "fal-ai/kokoro/french": {
      className: "KokoroFrench",
      docstring:
        "An expressive and natural French text-to-speech model for both European and Canadian French.",
      tags: ["audio", "generation", "text-to-audio", "sound"],
      useCases: [
        "Sound effect generation",
        "Music composition",
        "Audio content creation",
        "Background music generation",
        "Podcast audio production"
      ]
    },
    "fal-ai/kokoro/japanese": {
      className: "KokoroJapanese",
      docstring:
        "A fast and natural-sounding Japanese text-to-speech model optimized for smooth pronunciation.",
      tags: ["audio", "generation", "text-to-audio", "sound"],
      useCases: [
        "Sound effect generation",
        "Music composition",
        "Audio content creation",
        "Background music generation",
        "Podcast audio production"
      ]
    },
    "fal-ai/kokoro/mandarin-chinese": {
      className: "KokoroMandarinChinese",
      docstring:
        "A highly efficient Mandarin Chinese text-to-speech model that captures natural tones and prosody.",
      tags: ["audio", "generation", "text-to-audio", "sound"],
      useCases: [
        "Sound effect generation",
        "Music composition",
        "Audio content creation",
        "Background music generation",
        "Podcast audio production"
      ]
    },
    "fal-ai/kokoro/spanish": {
      className: "KokoroSpanish",
      docstring:
        "A natural-sounding Spanish text-to-speech model optimized for Latin American and European Spanish.",
      tags: ["audio", "generation", "text-to-audio", "sound"],
      useCases: [
        "Sound effect generation",
        "Music composition",
        "Audio content creation",
        "Background music generation",
        "Podcast audio production"
      ]
    },
    "fal-ai/yue": {
      className: "Yue",
      docstring:
        "YuE is a groundbreaking series of open-source foundation models designed for music generation, specifically for transforming lyrics into full songs.",
      tags: ["audio", "generation", "text-to-audio", "sound"],
      useCases: [
        "Sound effect generation",
        "Music composition",
        "Audio content creation",
        "Background music generation",
        "Podcast audio production"
      ]
    },
    "fal-ai/mmaudio-v2/text-to-audio": {
      className: "MmaudioV2TextToAudio",
      docstring:
        "MMAudio generates synchronized audio given text inputs. It can generate sounds described by a prompt.",
      tags: ["audio", "generation", "text-to-audio", "sound"],
      useCases: [
        "Sound effect generation",
        "Music composition",
        "Audio content creation",
        "Background music generation",
        "Podcast audio production"
      ]
    },
    "fal-ai/minimax-music": {
      className: "MinimaxMusic",
      docstring:
        "Generate music from text prompts using the MiniMax model, which leverages advanced AI techniques to create high-quality, diverse musical compositions.",
      tags: ["audio", "generation", "text-to-audio", "sound"],
      useCases: [
        "Sound effect generation",
        "Music composition",
        "Audio content creation",
        "Background music generation",
        "Podcast audio production"
      ]
    },
    "fal-ai/minimax-music/v2.5": {
      className: "MinimaxMusicV25",
      docstring: "MiniMax Music v2.5: text-to-music generation.",
      tags: ["audio", "music", "text-to-audio", "minimax"],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "fal-ai/minimax-music/v2.6": {
      className: "MinimaxMusicV26",
      docstring: "MiniMax Music v2.6: text-to-music generation.",
      tags: ["audio", "music", "text-to-audio", "minimax"],
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
