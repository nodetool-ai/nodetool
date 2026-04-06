import type { ModuleConfig } from "../types.js";

export const audioConfig: ModuleConfig = {
  moduleName: "audio",
  defaultPollInterval: 4000,
  defaultMaxAttempts: 120,
  nodes: [
    // -----------------------------------------------------------------------
    // 1. GenerateMusic (Suno)
    // -----------------------------------------------------------------------
    {
      className: "GenerateMusic",
      modelId: "suno/generate",
      title: "Generate Music",
      description:
        "Generate music using Suno AI via Kie.ai.\n\n    kie, suno, music, audio, ai, generation, vocals, instrumental\n\n    Creates full tracks with vocals and instrumentals using Suno models.\n    Supports custom mode for strict lyric control and non-custom mode for easy prompts.\n\n    Use cases:\n    - Generate background music for projects\n    - Create AI-composed songs with vocals\n    - Produce instrumentals for content\n    - Generate music in various genres and styles",
      outputType: "audio",
      useSuno: true,
      pollInterval: 4000,
      maxAttempts: 120,
      fields: [
        {
          name: "custom_mode",
          type: "bool",
          default: false,
          title: "Custom Mode",
          description:
            "Enable custom mode for detailed control over style and title."
        },
        {
          name: "prompt",
          type: "str",
          default: "",
          title: "Prompt",
          description:
            "Music description or lyrics. In custom mode, this is used as lyrics when instrumental is false. In non-custom mode, this is the core idea."
        },
        {
          name: "style",
          type: "str",
          default: "",
          title: "Style",
          description: "Music style specification (required in custom mode)."
        },
        {
          name: "title",
          type: "str",
          default: "",
          title: "Title",
          description:
            "Track title (required in custom mode, max 80 characters)."
        },
        {
          name: "instrumental",
          type: "bool",
          default: false,
          title: "Instrumental",
          description: "Generate instrumental-only (no vocals)."
        },
        {
          name: "model",
          type: "enum",
          default: "V4_5PLUS",
          title: "Model",
          description: "Suno model version to use.",
          values: ["V4", "V4_5", "V4_5PLUS", "V4_5ALL", "V5"]
        },
        {
          name: "negative_tags",
          type: "str",
          default: "",
          title: "Negative Tags",
          description:
            "Music styles or traits to exclude from the generated audio."
        },
        {
          name: "vocal_gender",
          type: "enum",
          default: "",
          title: "Vocal Gender",
          description: "Vocal gender preference (custom mode only).",
          values: ["", "m", "f"]
        },
        {
          name: "style_weight",
          type: "float",
          default: 0,
          title: "Style Weight",
          description: "Strength of adherence to style (0-1)."
        },
        {
          name: "weirdness_constraint",
          type: "float",
          default: 0,
          title: "Weirdness Constraint",
          description: "Creative deviation control (0-1)."
        },
        {
          name: "audio_weight",
          type: "float",
          default: 0,
          title: "Audio Weight",
          description: "Balance weight for audio features (0-1)."
        },
        {
          name: "persona_id",
          type: "str",
          default: "",
          title: "Persona Id",
          description: "Persona ID to apply (custom mode only)."
        }
      ],
      paramNames: {
        custom_mode: "customMode",
        negative_tags: "negativeTags",
        vocal_gender: "vocalGender",
        style_weight: "styleWeight",
        weirdness_constraint: "weirdnessConstraint",
        audio_weight: "audioWeight",
        persona_id: "personaId"
      },
      conditionalFields: [
        { field: "negative_tags", condition: "truthy" },
        { field: "vocal_gender", condition: "truthy" },
        { field: "style_weight", condition: "truthy" },
        { field: "weirdness_constraint", condition: "truthy" },
        { field: "audio_weight", condition: "truthy" },
        { field: "persona_id", condition: "truthy" }
      ],
      validation: [
        { field: "prompt", rule: "not_empty", message: "prompt is required" }
      ]
    },

    // -----------------------------------------------------------------------
    // 2. ExtendMusic (Suno)
    // -----------------------------------------------------------------------
    {
      className: "ExtendMusic",
      modelId: "suno/extend",
      title: "Extend Music",
      description:
        "Extend music using Suno AI via Kie.ai.\n\n    kie, suno, music, audio, ai, extension, continuation, remix\n\n    Extends an existing track by continuing from a specified time point.\n    Can reuse original parameters or override them with custom settings.",
      outputType: "audio",
      useSuno: true,
      pollInterval: 4000,
      maxAttempts: 120,
      fields: [
        {
          name: "default_param_flag",
          type: "bool",
          default: false,
          title: "Default Param Flag",
          description:
            "If true, use custom parameters (prompt/style/title/continue_at). If false, inherit parameters from the source audio."
        },
        {
          name: "audio_id",
          type: "str",
          default: "",
          title: "Audio Id",
          description: "Audio ID to extend."
        },
        {
          name: "prompt",
          type: "str",
          default: "",
          title: "Prompt",
          description: "Description of the desired extension content."
        },
        {
          name: "style",
          type: "str",
          default: "",
          title: "Style",
          description:
            "Music style for the extension (required for custom params)."
        },
        {
          name: "title",
          type: "str",
          default: "",
          title: "Title",
          description:
            "Title for the extended track (required for custom params)."
        },
        {
          name: "continue_at",
          type: "float",
          default: 0,
          title: "Continue At",
          description:
            "Time in seconds to start extending from (required for custom params).",
          min: 0
        },
        {
          name: "model",
          type: "enum",
          default: "V4_5PLUS",
          title: "Model",
          description: "Suno model version to use (must match source audio).",
          values: ["V4", "V4_5", "V4_5PLUS", "V4_5ALL", "V5"]
        },
        {
          name: "negative_tags",
          type: "str",
          default: "",
          title: "Negative Tags",
          description: "Music styles or traits to exclude from the extension."
        },
        {
          name: "vocal_gender",
          type: "enum",
          default: "",
          title: "Vocal Gender",
          description: "Vocal gender preference.",
          values: ["", "m", "f"]
        },
        {
          name: "style_weight",
          type: "float",
          default: 0,
          title: "Style Weight",
          description: "Strength of adherence to style (0-1)."
        },
        {
          name: "weirdness_constraint",
          type: "float",
          default: 0,
          title: "Weirdness Constraint",
          description: "Creative deviation control (0-1)."
        },
        {
          name: "audio_weight",
          type: "float",
          default: 0,
          title: "Audio Weight",
          description: "Balance weight for audio features (0-1)."
        },
        {
          name: "persona_id",
          type: "str",
          default: "",
          title: "Persona Id",
          description: "Persona ID to apply (custom params only)."
        }
      ],
      validation: [
        {
          field: "audio_id",
          rule: "not_empty",
          message: "audio_id is required"
        }
      ]
    },

    // -----------------------------------------------------------------------
    // 3. CoverAudio (Suno)
    // -----------------------------------------------------------------------
    {
      className: "CoverAudio",
      modelId: "suno/cover",
      title: "Cover Audio",
      description:
        "Cover an uploaded audio track using Suno AI via Kie.ai.\n\n    kie, suno, music, audio, ai, cover, upload, style transfer\n\n    Uploads a source track and generates a covered version in a new style while\n    retaining the original melody.",
      outputType: "audio",
      useSuno: true,
      pollInterval: 4000,
      maxAttempts: 120,
      fields: [
        {
          name: "custom_mode",
          type: "bool",
          default: false,
          title: "Custom Mode",
          description:
            "Enable custom mode for detailed control over style and title."
        },
        {
          name: "audio",
          type: "audio",
          default: {
            type: "audio",
            uri: "",
            asset_id: null,
            data: null,
            metadata: null
          },
          title: "Audio",
          description: "Source audio to upload for covering."
        },
        {
          name: "prompt",
          type: "str",
          default: "",
          title: "Prompt",
          description:
            "Music description or lyrics. In custom mode, this is used as lyrics when instrumental is false. In non-custom mode, this is the core idea."
        },
        {
          name: "style",
          type: "str",
          default: "",
          title: "Style",
          description: "Music style specification (required in custom mode)."
        },
        {
          name: "title",
          type: "str",
          default: "",
          title: "Title",
          description: "Track title (required in custom mode)."
        },
        {
          name: "instrumental",
          type: "bool",
          default: false,
          title: "Instrumental",
          description: "Generate instrumental-only (no vocals)."
        },
        {
          name: "model",
          type: "enum",
          default: "V4_5PLUS",
          title: "Model",
          description: "Suno model version to use.",
          values: ["V4", "V4_5", "V4_5PLUS", "V4_5ALL", "V5"]
        },
        {
          name: "negative_tags",
          type: "str",
          default: "",
          title: "Negative Tags",
          description:
            "Music styles or traits to exclude from the generated audio."
        },
        {
          name: "vocal_gender",
          type: "enum",
          default: "",
          title: "Vocal Gender",
          description: "Vocal gender preference (custom mode only).",
          values: ["", "m", "f"]
        },
        {
          name: "style_weight",
          type: "float",
          default: 0,
          title: "Style Weight",
          description: "Strength of adherence to style (0-1)."
        },
        {
          name: "weirdness_constraint",
          type: "float",
          default: 0,
          title: "Weirdness Constraint",
          description: "Creative deviation control (0-1)."
        },
        {
          name: "audio_weight",
          type: "float",
          default: 0,
          title: "Audio Weight",
          description: "Balance weight for audio features (0-1)."
        },
        {
          name: "persona_id",
          type: "str",
          default: "",
          title: "Persona Id",
          description: "Persona ID to apply (custom mode only)."
        }
      ],
      uploads: [
        {
          field: "audio",
          kind: "audio",
          paramName: "audio_url"
        }
      ],
      validation: [
        { field: "audio", rule: "not_empty", message: "audio is required" }
      ],
      paramNames: {
        vocal_gender: "vocalGender"
      },
      conditionalFields: [{ field: "vocal_gender", condition: "truthy" }]
    },

    // -----------------------------------------------------------------------
    // 4. AddInstrumental (Suno)
    // -----------------------------------------------------------------------
    {
      className: "AddInstrumental",
      modelId: "suno/add-instrumental",
      title: "Add Instrumental",
      description:
        "Add instrumental accompaniment to uploaded audio via Suno AI.\n\n    kie, suno, music, audio, ai, instrumental, accompaniment, upload\n\n    Uploads a source track (e.g., vocals/stems) and generates a backing track.",
      outputType: "audio",
      useSuno: true,
      pollInterval: 4000,
      maxAttempts: 120,
      fields: [
        {
          name: "audio",
          type: "audio",
          default: {
            type: "audio",
            uri: "",
            asset_id: null,
            data: null,
            metadata: null
          },
          title: "Audio",
          description: "Source audio to upload for instrumental generation."
        },
        {
          name: "title",
          type: "str",
          default: "",
          title: "Title",
          description: "Title of the generated music."
        },
        {
          name: "tags",
          type: "str",
          default: "",
          title: "Tags",
          description: "Music styles or tags to include in the generated music."
        },
        {
          name: "negative_tags",
          type: "str",
          default: "",
          title: "Negative Tags",
          description: "Music styles or characteristics to exclude."
        },
        {
          name: "model",
          type: "enum",
          default: "V4_5PLUS",
          title: "Model",
          description: "Suno model version to use.",
          values: ["V4_5PLUS", "V5"]
        },
        {
          name: "vocal_gender",
          type: "enum",
          default: "",
          title: "Vocal Gender",
          description: "Vocal gender preference.",
          values: ["", "m", "f"]
        },
        {
          name: "style_weight",
          type: "float",
          default: 0,
          title: "Style Weight",
          description: "Strength of adherence to style (0-1)."
        },
        {
          name: "weirdness_constraint",
          type: "float",
          default: 0,
          title: "Weirdness Constraint",
          description: "Creative deviation control (0-1)."
        },
        {
          name: "audio_weight",
          type: "float",
          default: 0,
          title: "Audio Weight",
          description: "Balance weight for audio features (0-1)."
        }
      ],
      uploads: [
        {
          field: "audio",
          kind: "audio",
          paramName: "audio_url"
        }
      ],
      validation: [
        { field: "audio", rule: "not_empty", message: "audio is required" }
      ],
      paramNames: {
        tags: "prompt",
        title: "style"
      }
    },

    // -----------------------------------------------------------------------
    // 5. AddVocals (Suno)
    // -----------------------------------------------------------------------
    {
      className: "AddVocals",
      modelId: "suno/add-vocals",
      title: "Add Vocals",
      description:
        "Add AI vocals to uploaded audio via Suno AI.\n\n    kie, suno, music, audio, ai, vocals, singing, upload\n\n    Uploads an instrumental track and generates vocal layers on top.",
      outputType: "audio",
      useSuno: true,
      pollInterval: 4000,
      maxAttempts: 120,
      fields: [
        {
          name: "audio",
          type: "audio",
          default: {
            type: "audio",
            uri: "",
            asset_id: null,
            data: null,
            metadata: null
          },
          title: "Audio",
          description: "Source audio to upload for vocal generation."
        },
        {
          name: "prompt",
          type: "str",
          default: "",
          title: "Prompt",
          description: "Prompt describing lyric content and singing style."
        },
        {
          name: "title",
          type: "str",
          default: "",
          title: "Title",
          description: "Title of the generated music."
        },
        {
          name: "style",
          type: "str",
          default: "",
          title: "Style",
          description: "Music style for vocal generation."
        },
        {
          name: "tags",
          type: "str",
          default: "",
          title: "Tags",
          description: "Optional music tags to include in the generation."
        },
        {
          name: "negative_tags",
          type: "str",
          default: "",
          title: "Negative Tags",
          description: "Excluded music styles or elements."
        },
        {
          name: "model",
          type: "enum",
          default: "V4_5PLUS",
          title: "Model",
          description: "Suno model version to use.",
          values: ["V4_5PLUS", "V5"]
        },
        {
          name: "vocal_gender",
          type: "enum",
          default: "",
          title: "Vocal Gender",
          description: "Vocal gender preference.",
          values: ["", "m", "f"]
        },
        {
          name: "style_weight",
          type: "float",
          default: 0,
          title: "Style Weight",
          description: "Strength of adherence to style (0-1)."
        },
        {
          name: "weirdness_constraint",
          type: "float",
          default: 0,
          title: "Weirdness Constraint",
          description: "Creative deviation control (0-1)."
        },
        {
          name: "audio_weight",
          type: "float",
          default: 0,
          title: "Audio Weight",
          description: "Balance weight for audio features (0-1)."
        }
      ],
      uploads: [
        {
          field: "audio",
          kind: "audio",
          paramName: "audio_url"
        }
      ],
      validation: [
        { field: "audio", rule: "not_empty", message: "audio is required" }
      ],
      paramNames: {
        vocal_gender: "vocalGender"
      },
      conditionalFields: [{ field: "vocal_gender", condition: "truthy" }]
    },

    // -----------------------------------------------------------------------
    // 6. ReplaceMusicSection (Suno)
    // -----------------------------------------------------------------------
    {
      className: "ReplaceMusicSection",
      modelId: "suno/replace-section",
      title: "Replace Music Section",
      description:
        "Replace a section of a generated Suno track.\n\n    kie, suno, music, replace, edit, infill\n\n    Regenerates a time range and blends it into the original track.",
      outputType: "audio",
      useSuno: true,
      pollInterval: 4000,
      maxAttempts: 120,
      fields: [
        {
          name: "task_id",
          type: "str",
          default: "",
          title: "Task Id",
          description: "Original music task ID."
        },
        {
          name: "audio_id",
          type: "str",
          default: "",
          title: "Audio Id",
          description: "Audio ID to replace."
        },
        {
          name: "prompt",
          type: "str",
          default: "",
          title: "Prompt",
          description: "Prompt describing the replacement segment content."
        },
        {
          name: "tags",
          type: "str",
          default: "",
          title: "Tags",
          description: "Music style tags."
        },
        {
          name: "title",
          type: "str",
          default: "",
          title: "Title",
          description: "Music title."
        },
        {
          name: "infill_start_s",
          type: "float",
          default: 0,
          title: "Infill Start S",
          description: "Start time point for replacement (seconds).",
          min: 0
        },
        {
          name: "infill_end_s",
          type: "float",
          default: 0,
          title: "Infill End S",
          description: "End time point for replacement (seconds).",
          min: 0
        },
        {
          name: "negative_tags",
          type: "str",
          default: "",
          title: "Negative Tags",
          description: "Excluded music styles for the replacement segment."
        },
        {
          name: "full_lyrics",
          type: "str",
          default: "",
          title: "Full Lyrics",
          description: "Full lyrics after modification."
        }
      ],
      validation: [
        { field: "task_id", rule: "not_empty", message: "task_id is required" },
        {
          field: "audio_id",
          rule: "not_empty",
          message: "audio_id is required"
        }
      ],
      paramNames: {
        tags: "style",
        infill_start_s: "start_time",
        infill_end_s: "end_time"
      }
    },

    // -----------------------------------------------------------------------
    // 7. ElevenLabsTextToSpeech
    // -----------------------------------------------------------------------
    {
      className: "ElevenLabsTextToSpeech",
      modelId: "elevenlabs/text-to-speech-turbo-2-5",
      title: "ElevenLabs Text To Speech",
      description:
        "Generate speech using ElevenLabs AI via Kie.ai.\n\n    kie, elevenlabs, tts, text-to-speech, voice, audio, ai, speech synthesis\n\n    Creates natural-sounding speech from text using ElevenLabs' voice models.\n    Supports multiple voices, stability controls, and multilingual output.\n\n    Use cases:\n    - Generate voiceovers for videos and podcasts\n    - Create audiobooks and narrated content\n    - Produce natural-sounding speech for applications\n    - Generate speech in multiple languages and voices",
      outputType: "audio",
      fields: [
        {
          name: "text",
          type: "str",
          default: "",
          title: "Text",
          description: "The text to convert to speech."
        },
        {
          name: "voice",
          type: "str",
          default: "Rachel",
          title: "Voice",
          description:
            "The voice ID to use for synthesis. Common voices: Rachel, Adam, Bella, Antoni."
        },
        {
          name: "stability",
          type: "float",
          default: 0.5,
          title: "Stability",
          description:
            "Stability of the voice output. Lower values are more expressive, higher values are more consistent.",
          min: 0,
          max: 1
        },
        {
          name: "similarity_boost",
          type: "float",
          default: 0.75,
          title: "Similarity Boost",
          description:
            "How closely to clone the voice characteristics. Higher values match the voice more closely.",
          min: 0,
          max: 1
        },
        {
          name: "style",
          type: "float",
          default: 0,
          title: "Style",
          description:
            "Style parameter for voice expression. Range 0.0 to 1.0.",
          min: 0,
          max: 1
        },
        {
          name: "speed",
          type: "float",
          default: 1,
          title: "Speed",
          description: "Speed of the speech. Range 0.5 to 1.5.",
          min: 0.5,
          max: 1.5
        },
        {
          name: "language_code",
          type: "str",
          default: "",
          title: "Language Code",
          description:
            "Language code for multilingual TTS (e.g., 'en', 'es', 'fr', 'de'). Leave empty for auto-detection."
        },
        {
          name: "model",
          type: "enum",
          default: "text-to-speech-turbo-2-5",
          title: "Model",
          description: "ElevenLabs model version to use.",
          values: ["text-to-speech-turbo-2-5", "text-to-speech-multilingual-v2"]
        }
      ],
      validation: [
        { field: "text", rule: "not_empty", message: "text is required" },
        { field: "voice", rule: "not_empty", message: "voice_id is required" }
      ],
      paramNames: {
        voice: "voice_id",
        model: "model_id"
      }
    },

    // -----------------------------------------------------------------------
    // 8. ElevenLabsAudioIsolation
    // -----------------------------------------------------------------------
    {
      className: "ElevenLabsAudioIsolation",
      modelId: "elevenlabs/audio-isolation",
      title: "ElevenLabs Audio Isolation",
      description:
        "Isolate speech from audio using ElevenLabs AI via Kie.ai.\n\n    kie, elevenlabs, audio-isolation, speech, noise-removal, ai\n\n    ElevenLabs Audio Isolation uses AI to remove background noise, music,\n    and interference while preserving clear, natural speech.\n\n    Use cases:\n    - Clean up podcast and interview recordings\n    - Remove background noise from audio\n    - Isolate speech for professional recordings\n    - Prepare audio for transcription or production",
      outputType: "audio",
      fields: [
        {
          name: "audio",
          type: "audio",
          default: {
            type: "audio",
            uri: "",
            asset_id: null,
            data: null,
            metadata: null
          },
          title: "Audio",
          description: "Audio file to process for speech isolation."
        }
      ],
      uploads: [
        {
          field: "audio",
          kind: "audio",
          paramName: "audio_url"
        }
      ],
      validation: [
        { field: "audio", rule: "not_empty", message: "audio is required" }
      ]
    },

    // -----------------------------------------------------------------------
    // 9. ElevenLabsSoundEffect
    // -----------------------------------------------------------------------
    {
      className: "ElevenLabsSoundEffect",
      modelId: "elevenlabs/sound-effect-v2",
      title: "ElevenLabs Sound Effect",
      description:
        "Generate sound effects using ElevenLabs AI via Kie.ai.\n\n    kie, elevenlabs, sound-effect, sfx, audio, ai\n\n    ElevenLabs Sound Effect V2 generates audio from text descriptions,\n    supporting clips up to 20+ seconds with seamless looping and 48kHz audio.\n\n    Use cases:\n    - Generate custom sound effects for videos\n    - Create ambient sounds for games and applications\n    - Produce foley effects from text descriptions\n    - Generate audio elements for creative projects",
      outputType: "audio",
      fields: [
        {
          name: "text",
          type: "str",
          default: "",
          title: "Text",
          description: "Text description of the sound effect to generate."
        },
        {
          name: "duration_seconds",
          type: "float",
          default: 5,
          title: "Duration Seconds",
          description:
            "Duration of the sound effect in seconds (up to 22 seconds).",
          min: 0.5,
          max: 22
        },
        {
          name: "prompt_influence",
          type: "float",
          default: 0.3,
          title: "Prompt Influence",
          description: "How strongly the prompt influences generation (0-1).",
          min: 0,
          max: 1
        }
      ],
      validation: [
        { field: "text", rule: "not_empty", message: "text is required" }
      ],
      conditionalFields: [{ field: "duration_seconds", condition: "truthy" }]
    },

    // -----------------------------------------------------------------------
    // 10. ElevenLabsSpeechToText
    // -----------------------------------------------------------------------
    {
      className: "ElevenLabsSpeechToText",
      modelId: "elevenlabs/speech-to-text",
      title: "ElevenLabs Speech To Text",
      description:
        "Transcribe speech to text using ElevenLabs AI via Kie.ai.\n\n    kie, elevenlabs, speech-to-text, transcription, stt, ai\n\n    ElevenLabs Speech to Text (Scribe v1) delivers state-of-the-art transcription\n    with multilingual support, speaker diarization, and audio-event tagging.\n\n    Use cases:\n    - Transcribe podcasts and interviews\n    - Create subtitles for videos\n    - Convert audio recordings to text\n    - Generate meeting transcripts with speaker labels",
      outputType: "text",
      fields: [
        {
          name: "audio",
          type: "audio",
          default: {
            type: "audio",
            uri: "",
            asset_id: null,
            data: null,
            metadata: null
          },
          title: "Audio",
          description: "Audio file to transcribe."
        },
        {
          name: "language_code",
          type: "str",
          default: "",
          title: "Language Code",
          description:
            "Language code (e.g., 'en', 'es', 'fr'). Leave empty for auto-detection."
        },
        {
          name: "diarization",
          type: "bool",
          default: false,
          title: "Diarization",
          description:
            "Enable speaker diarization to identify different speakers."
        }
      ],
      uploads: [
        {
          field: "audio",
          kind: "audio",
          paramName: "audio_url"
        }
      ],
      validation: [
        { field: "audio", rule: "not_empty", message: "audio is required" }
      ]
    },

    // -----------------------------------------------------------------------
    // 11. ElevenLabsV3Dialogue
    // -----------------------------------------------------------------------
    {
      className: "ElevenLabsV3Dialogue",
      modelId: "elevenlabs/text-to-dialogue-v3",
      title: "ElevenLabs V3 Dialogue",
      description:
        "Generate expressive dialogue using ElevenLabs V3 via Kie.ai.\n\n    kie, elevenlabs, v3, dialogue, tts, text-to-speech, multi-speaker, ai\n\n    ElevenLabs Eleven V3 enables expressive multilingual Text to Dialogue\n    with audio tag control, multi-speaker support, and natural delivery.\n\n    Use cases:\n    - Generate dialogue for storytelling applications\n    - Create multi-speaker audio content\n    - Produce expressive voiceovers with audio tags\n    - Generate natural conversation audio",
      outputType: "audio",
      fields: [
        {
          name: "text",
          type: "str",
          default: "",
          title: "Text",
          description:
            "The dialogue text to convert to speech. Supports audio tags for control."
        },
        {
          name: "voice",
          type: "str",
          default: "Rachel",
          title: "Voice",
          description: "Primary voice ID to use for synthesis."
        },
        {
          name: "stability",
          type: "float",
          default: 0.5,
          title: "Stability",
          description: "Stability of the voice output (0-1).",
          min: 0,
          max: 1
        },
        {
          name: "similarity_boost",
          type: "float",
          default: 0.75,
          title: "Similarity Boost",
          description: "Voice clone similarity (0-1).",
          min: 0,
          max: 1
        },
        {
          name: "style",
          type: "float",
          default: 0,
          title: "Style",
          description: "Style expression parameter (0-1).",
          min: 0,
          max: 1
        },
        {
          name: "speed",
          type: "float",
          default: 1,
          title: "Speed",
          description: "Speech speed (0.5-1.5).",
          min: 0.5,
          max: 1.5
        },
        {
          name: "language_code",
          type: "str",
          default: "",
          title: "Language Code",
          description:
            "Language code for multilingual output. Leave empty for auto-detection."
        }
      ],
      validation: [
        { field: "text", rule: "not_empty", message: "script is required" }
      ],
      paramNames: {
        text: "script",
        voice: "voice_assignments"
      }
    }
  ]
};
