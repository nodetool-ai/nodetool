import type { ModuleConfig } from "../types.js";

export const config: ModuleConfig = {
  configs: {
    "fal-ai/qwen-3-tts/text-to-speech/1.7b": {
      className: "Qwen3TtsTextToSpeech17B",
      docstring:
        "Qwen-3 TTS 1.7B generates natural-sounding speech from text using the large 1.7-billion parameter model.",
      tags: [
        "audio",
        "tts",
        "qwen",
        "1.7b",
        "text-to-speech",
        "speech-synthesis"
      ],
      useCases: [
        "Generate natural-sounding speech from text",
        "Create voice-overs for videos",
        "Produce audiobook narration",
        "Generate spoken content for applications",
        "Create text-to-speech for accessibility"
      ],
      basicFields: ["text"]
    },
    "fal-ai/qwen-3-tts/text-to-speech/0.6b": {
      className: "Qwen3TtsTextToSpeech06B",
      docstring:
        "Qwen-3 TTS 0.6B generates speech from text efficiently using the compact 600-million parameter model.",
      tags: ["audio", "tts", "qwen", "0.6b", "efficient", "text-to-speech"],
      useCases: [
        "Generate speech efficiently from text",
        "Create fast voice-overs",
        "Produce quick audio narration",
        "Generate spoken content with low latency",
        "Create efficient text-to-speech"
      ],
      basicFields: ["text"]
    },
    "fal-ai/qwen-3-tts/voice-design/1.7b": {
      className: "Qwen3TtsVoiceDesign17B",
      docstring:
        "Qwen-3 TTS Voice Design 1.7B creates custom voice characteristics for personalized speech synthesis.",
      tags: ["audio", "tts", "qwen", "voice-design", "custom", "1.7b"],
      useCases: [
        "Design custom voice characteristics",
        "Create personalized speech synthesis",
        "Generate unique voice styles",
        "Produce custom voice-overs",
        "Create tailored speech synthesis"
      ],
      basicFields: ["text"]
    },
    "fal-ai/vibevoice/0.5b": {
      className: "Vibevoice05B",
      docstring:
        "VibeVoice 0.5B generates expressive and emotive speech from text with natural vocal characteristics.",
      tags: [
        "audio",
        "tts",
        "vibevoice",
        "0.5b",
        "expressive",
        "text-to-speech"
      ],
      useCases: [
        "Generate expressive speech from text",
        "Create emotive voice-overs",
        "Produce natural vocal narration",
        "Generate speech with personality",
        "Create engaging audio content"
      ],
      basicFields: ["text"]
    },
    "fal-ai/maya": {
      className: "Maya",
      docstring:
        "Maya generates high-quality natural speech from text with advanced voice synthesis capabilities.",
      tags: ["audio", "tts", "maya", "high-quality", "text-to-speech"],
      useCases: [
        "Generate high-quality speech from text",
        "Create professional voice-overs",
        "Produce premium audio narration",
        "Generate natural-sounding speech",
        "Create professional audio content"
      ],
      basicFields: ["text"]
    },
    "fal-ai/minimax/speech-2.6-hd": {
      className: "MinimaxSpeech26Hd",
      docstring:
        "Minimax Speech 2.6 HD generates high-definition speech from text with superior audio quality.",
      tags: ["audio", "tts", "minimax", "2.6", "hd", "high-quality"],
      useCases: [
        "Generate HD quality speech from text",
        "Create premium voice-overs",
        "Produce high-fidelity audio narration",
        "Generate superior audio quality speech",
        "Create broadcast-quality audio"
      ],
      enumOverrides: {
        OutputFormat: "MinimaxSpeech26HdOutputFormat"
      },
      basicFields: ["text"]
    },
    "fal-ai/minimax/speech-2.6-turbo": {
      className: "MinimaxSpeech26Turbo",
      docstring:
        "Minimax Speech 2.6 Turbo generates speech from text with optimized speed and good quality.",
      tags: ["audio", "tts", "minimax", "2.6", "turbo", "fast"],
      useCases: [
        "Generate speech quickly from text",
        "Create fast voice-overs",
        "Produce rapid audio narration",
        "Generate speech with turbo speed",
        "Create efficient audio content"
      ],
      enumOverrides: {
        OutputFormat: "MinimaxSpeech26TurboOutputFormat"
      },
      basicFields: ["text"]
    },
    "fal-ai/maya/batch": {
      className: "MayaBatch",
      docstring:
        "Maya Batch TTS generates high-quality speech in batch mode for efficient processing.",
      tags: ["speech", "synthesis", "text-to-speech", "tts", "batch", "maya"],
      useCases: [
        "Generate speech for multiple texts",
        "Batch process narration",
        "Create bulk voice-overs",
        "Efficient audio content creation",
        "Generate multiple speech files"
      ],
      basicFields: ["text"]
    },
    "fal-ai/maya/stream": {
      className: "MayaStream",
      docstring:
        "Maya Stream TTS generates high-quality speech in streaming mode for real-time applications.",
      tags: [
        "speech",
        "synthesis",
        "text-to-speech",
        "tts",
        "streaming",
        "maya"
      ],
      useCases: [
        "Generate speech in real-time",
        "Stream narration dynamically",
        "Create live voice-overs",
        "Real-time audio synthesis",
        "Generate streaming speech"
      ],
      basicFields: ["text"]
    },
    "fal-ai/index-tts-2/text-to-speech": {
      className: "IndexTts2TextToSpeech",
      docstring:
        "Index TTS 2 generates natural-sounding speech from text with advanced neural synthesis.",
      tags: ["speech", "synthesis", "text-to-speech", "tts", "neural"],
      useCases: [
        "Generate natural speech from text",
        "Create voice narration",
        "Produce audio books",
        "Generate voice-overs",
        "Create speech content"
      ],
      basicFields: ["text"]
    },
    "fal-ai/indo-voice": {
      className: "IndoVoice",
      docstring:
        "IndoVoice TTS generates Indonesian language speech with natural pronunciation and intonation.",
      tags: ["speech", "synthesis", "text-to-speech", "tts", "indonesian"],
      useCases: [
        "Generate Indonesian speech",
        "Create Indonesian narration",
        "Produce Indonesian voice-overs",
        "Generate localized audio content",
        "Create Indonesian audio books"
      ],
      basicFields: ["text"]
    },
    "fal-ai/cosyvoice-turbo": {
      className: "CosyvoiceTurbo",
      docstring:
        "CosyVoice Turbo generates high-quality speech with fast processing speed and natural voice.",
      tags: ["speech", "synthesis", "text-to-speech", "tts", "turbo", "fast"],
      useCases: [
        "Generate speech quickly",
        "Create fast voice narration",
        "Produce rapid audio content",
        "Generate speech with turbo speed",
        "Create efficient voice-overs"
      ],
      basicFields: ["text"]
    },
    "fal-ai/kling-video/v1/tts": {
      className: "KlingVideoV1Tts",
      docstring:
        "Generate speech from text prompts and different voices using the Kling TTS model, which leverages advanced AI techniques to create high-quality text-to-speech.",
      tags: ["speech", "synthesis", "text-to-speech", "tts"],
      useCases: [
        "Voice synthesis for applications",
        "Audiobook narration",
        "Virtual assistant voices",
        "Accessibility solutions",
        "Content localization"
      ]
    },
    "fal-ai/chatterbox/text-to-speech/multilingual": {
      className: "ChatterboxTextToSpeechMultilingual",
      docstring:
        "Whether you're working on memes, videos, games, or AI agents, Chatterbox brings your content to life. Use the first tts from resemble ai.",
      tags: ["speech", "synthesis", "text-to-speech", "tts"],
      useCases: [
        "Voice synthesis for applications",
        "Audiobook narration",
        "Virtual assistant voices",
        "Accessibility solutions",
        "Content localization"
      ]
    },
    "fal-ai/vibevoice/7b": {
      className: "Vibevoice7b",
      docstring:
        "Generate long, expressive multi-voice speech using Microsoft's powerful TTS",
      tags: ["speech", "synthesis", "text-to-speech", "tts"],
      useCases: [
        "Voice synthesis for applications",
        "Audiobook narration",
        "Virtual assistant voices",
        "Accessibility solutions",
        "Content localization"
      ]
    },
    "fal-ai/vibevoice": {
      className: "Vibevoice",
      docstring:
        "Generate long, expressive multi-voice speech using Microsoft's powerful TTS",
      tags: ["speech", "synthesis", "text-to-speech", "tts"],
      useCases: [
        "Voice synthesis for applications",
        "Audiobook narration",
        "Virtual assistant voices",
        "Accessibility solutions",
        "Content localization"
      ]
    },
    "fal-ai/minimax/preview/speech-2.5-hd": {
      className: "MinimaxPreviewSpeech25Hd",
      docstring:
        "Generate speech from text prompts and different voices using the MiniMax Speech-02 HD model, which leverages advanced AI techniques to create high-quality text-to-speech.",
      tags: ["speech", "synthesis", "text-to-speech", "tts"],
      useCases: [
        "Voice synthesis for applications",
        "Audiobook narration",
        "Virtual assistant voices",
        "Accessibility solutions",
        "Content localization"
      ]
    },
    "fal-ai/minimax/preview/speech-2.5-turbo": {
      className: "MinimaxPreviewSpeech25Turbo",
      docstring:
        "Generate fast speech from text prompts and different voices using the MiniMax Speech-02 Turbo model, which leverages advanced AI techniques to create high-quality text-to-speech.",
      tags: ["speech", "synthesis", "text-to-speech", "tts", "fast"],
      useCases: [
        "Voice synthesis for applications",
        "Audiobook narration",
        "Virtual assistant voices",
        "Accessibility solutions",
        "Content localization"
      ]
    },
    "fal-ai/minimax/voice-design": {
      className: "MinimaxVoiceDesign",
      docstring:
        "Design a personalized voice from a text description, and generate speech from text prompts using the MiniMax model, which leverages advanced AI techniques to create high-quality text-to-speech.",
      tags: ["speech", "synthesis", "text-to-speech", "tts"],
      useCases: [
        "Voice synthesis for applications",
        "Audiobook narration",
        "Virtual assistant voices",
        "Accessibility solutions",
        "Content localization"
      ]
    },
    "resemble-ai/chatterboxhd/text-to-speech": {
      className: "ResembleAiChatterboxhdTextToSpeech",
      docstring:
        "Generate expressive, natural speech with Resemble AI's Chatterbox. Features unique emotion control, instant voice cloning from short audio, and built-in watermarking.",
      tags: ["speech", "synthesis", "text-to-speech", "tts"],
      useCases: [
        "Voice synthesis for applications",
        "Audiobook narration",
        "Virtual assistant voices",
        "Accessibility solutions",
        "Content localization"
      ]
    },
    "fal-ai/chatterbox/text-to-speech": {
      className: "ChatterboxTextToSpeech",
      docstring:
        "Whether you're working on memes, videos, games, or AI agents, Chatterbox brings your content to life. Use the first tts from resemble ai.",
      tags: ["speech", "synthesis", "text-to-speech", "tts"],
      useCases: [
        "Voice synthesis for applications",
        "Audiobook narration",
        "Virtual assistant voices",
        "Accessibility solutions",
        "Content localization"
      ]
    },
    "fal-ai/minimax/voice-clone": {
      className: "MinimaxVoiceClone",
      docstring:
        "Clone a voice from a sample audio and generate speech from text prompts using the MiniMax model, which leverages advanced AI techniques to create high-quality text-to-speech.",
      tags: ["speech", "synthesis", "text-to-speech", "tts"],
      useCases: [
        "Voice synthesis for applications",
        "Audiobook narration",
        "Virtual assistant voices",
        "Accessibility solutions",
        "Content localization"
      ]
    },
    "fal-ai/minimax/speech-02-turbo": {
      className: "MinimaxSpeech02Turbo",
      docstring:
        "Generate fast speech from text prompts and different voices using the MiniMax Speech-02 Turbo model, which leverages advanced AI techniques to create high-quality text-to-speech.",
      tags: ["speech", "synthesis", "text-to-speech", "tts", "fast"],
      useCases: [
        "Voice synthesis for applications",
        "Audiobook narration",
        "Virtual assistant voices",
        "Accessibility solutions",
        "Content localization"
      ]
    },
    "fal-ai/minimax/speech-02-hd": {
      className: "MinimaxSpeech02Hd",
      docstring:
        "Generate speech from text prompts and different voices using the MiniMax Speech-02 HD model, which leverages advanced AI techniques to create high-quality text-to-speech.",
      tags: ["speech", "synthesis", "text-to-speech", "tts"],
      useCases: [
        "Voice synthesis for applications",
        "Audiobook narration",
        "Virtual assistant voices",
        "Accessibility solutions",
        "Content localization"
      ]
    },
    "fal-ai/dia-tts": {
      className: "DiaTts",
      docstring:
        "Dia directly generates realistic dialogue from transcripts. Audio conditioning enables emotion control. Produces natural nonverbals like laughter and throat clearing.",
      tags: ["speech", "synthesis", "text-to-speech", "tts"],
      useCases: [
        "Voice synthesis for applications",
        "Audiobook narration",
        "Virtual assistant voices",
        "Accessibility solutions",
        "Content localization"
      ]
    },
    "fal-ai/orpheus-tts": {
      className: "OrpheusTts",
      docstring:
        "Orpheus TTS is a state-of-the-art, Llama-based Speech-LLM designed for high-quality, empathetic text-to-speech generation. This model has been finetuned to deliver human-level speech synthesis, achieving exceptional clarity, expressiveness, and real-time performances.",
      tags: ["speech", "synthesis", "text-to-speech", "tts"],
      useCases: [
        "Voice synthesis for applications",
        "Audiobook narration",
        "Virtual assistant voices",
        "Accessibility solutions",
        "Content localization"
      ]
    },
    "fal-ai/elevenlabs/tts/turbo-v2.5": {
      className: "ElevenlabsTtsTurboV25",
      docstring:
        "Generate high-speed text-to-speech audio using ElevenLabs TTS Turbo v2.5.",
      tags: ["speech", "synthesis", "text-to-speech", "tts", "fast"],
      useCases: [
        "Voice synthesis for applications",
        "Audiobook narration",
        "Virtual assistant voices",
        "Accessibility solutions",
        "Content localization"
      ]
    }
  }
};
