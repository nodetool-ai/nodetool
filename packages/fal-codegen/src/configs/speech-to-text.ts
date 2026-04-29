import type { ModuleConfig } from "../types.js";

export const config: ModuleConfig = {
  configs: {
    "fal-ai/elevenlabs/speech-to-text": {
      className: "ElevenLabsSpeechToText",
      docstring:
        "ElevenLabs Speech to Text transcribes audio to text with high accuracy.",
      tags: ["audio", "transcription", "stt", "elevenlabs", "speech-to-text"],
      useCases: [
        "Transcribe audio files",
        "Convert speech to text",
        "Generate transcripts from audio",
        "Extract text from recordings",
        "Create captions from audio"
      ],
      basicFields: ["audio"]
    },
    "fal-ai/elevenlabs/speech-to-text/scribe-v2": {
      className: "ElevenLabsScribeV2",
      docstring:
        "ElevenLabs Scribe V2 provides blazingly fast speech-to-text transcription.",
      tags: [
        "audio",
        "transcription",
        "stt",
        "fast",
        "elevenlabs",
        "speech-to-text"
      ],
      useCases: [
        "Fast audio transcription",
        "Real-time speech recognition",
        "Quick transcript generation",
        "High-speed audio processing",
        "Rapid speech-to-text conversion"
      ],
      basicFields: ["audio"]
    },
    "fal-ai/smart-turn": {
      className: "SmartTurn",
      docstring:
        "Pipecat's Smart Turn model provides native audio turn detection for conversations.",
      tags: [
        "audio",
        "turn-detection",
        "conversation",
        "pipecat",
        "speech-analysis"
      ],
      useCases: [
        "Detect conversation turns",
        "Identify speaker changes",
        "Analyze dialogue timing",
        "Detect speech boundaries",
        "Process conversational audio"
      ],
      basicFields: ["audio"]
    },
    "fal-ai/speech-to-text": {
      className: "SpeechToText",
      docstring:
        "General-purpose speech-to-text model for accurate audio transcription.",
      tags: ["audio", "transcription", "stt", "speech-to-text"],
      useCases: [
        "General audio transcription",
        "Convert speech recordings to text",
        "Generate audio transcripts",
        "Process voice recordings",
        "Extract text from speech"
      ],
      basicFields: ["audio"]
    },
    "fal-ai/speech-to-text/stream": {
      className: "SpeechToTextStream",
      docstring: "Streaming speech-to-text for real-time audio transcription.",
      tags: [
        "audio",
        "transcription",
        "stt",
        "streaming",
        "real-time",
        "speech-to-text"
      ],
      useCases: [
        "Real-time transcription",
        "Live audio captioning",
        "Stream audio processing",
        "Continuous speech recognition",
        "Live speech-to-text conversion"
      ],
      basicFields: ["audio_stream"]
    },
    "fal-ai/speech-to-text/turbo": {
      className: "SpeechToTextTurbo",
      docstring:
        "High-speed speech-to-text model optimized for fast transcription.",
      tags: [
        "audio",
        "transcription",
        "stt",
        "turbo",
        "fast",
        "speech-to-text"
      ],
      useCases: [
        "Fast audio transcription",
        "Quick speech recognition",
        "Rapid transcript generation",
        "High-speed processing",
        "Efficient speech-to-text"
      ],
      basicFields: ["audio"]
    },
    "fal-ai/speech-to-text/turbo/stream": {
      className: "SpeechToTextTurboStream",
      docstring:
        "High-speed streaming speech-to-text for real-time fast transcription.",
      tags: [
        "audio",
        "transcription",
        "stt",
        "turbo",
        "streaming",
        "fast",
        "speech-to-text"
      ],
      useCases: [
        "Real-time fast transcription",
        "Live fast captioning",
        "High-speed streaming STT",
        "Rapid live transcription",
        "Efficient real-time processing"
      ],
      basicFields: ["audio_stream"]
    },
    "fal-ai/whisper": {
      className: "Whisper",
      docstring:
        "OpenAI's Whisper model for robust multilingual speech recognition.",
      tags: [
        "audio",
        "transcription",
        "stt",
        "whisper",
        "multilingual",
        "speech-to-text"
      ],
      useCases: [
        "Multilingual transcription",
        "Robust speech recognition",
        "Transcribe multiple languages",
        "Handle noisy audio",
        "International audio processing"
      ],
      basicFields: ["audio"]
    },
    "fal-ai/wizper": {
      className: "Wizper",
      docstring:
        "Wizper provides fast and accurate speech-to-text transcription.",
      tags: [
        "audio",
        "transcription",
        "stt",
        "wizper",
        "fast",
        "speech-to-text"
      ],
      useCases: [
        "Fast accurate transcription",
        "Quick speech recognition",
        "Efficient audio processing",
        "Rapid text extraction",
        "Speedy speech-to-text"
      ],
      basicFields: ["audio"]
    },
    "fal-ai/cohere-transcribe": {
      className: "CohereTranscribe",
      docstring: "Cohere transcription model: speech-to-text.",
      tags: ["audio", "stt", "speech-to-text", "transcription", "cohere"],
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
