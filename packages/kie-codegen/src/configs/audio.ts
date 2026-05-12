import type { ModuleConfig } from "../types.js";

export const audioConfig: ModuleConfig = {
  "moduleName": "audio",
  "defaultPollInterval": 4000,
  "defaultMaxAttempts": 120,
  "nodes": [
    {
      "className": "ElevenlabsAudioIsolation",
      "modelId": "elevenlabs/audio-isolation",
      "title": "elevenlabs/audio-isolation",
      "description": "elevenlabs/audio-isolation via Kie.ai.\n\n    kie, audio, ai\n\n    Content generation using elevenlabs/audio-isolation",
      "outputType": "audio",
      "fields": [
        {
          "name": "audio",
          "type": "audio",
          "default": {
            "type": "audio",
            "uri": "",
            "asset_id": null,
            "data": null,
            "metadata": null
          },
          "title": "Audio",
          "description": "URL of the audio file to isolate voice from (File URL after upload, not file content; Accepted types: audio/mpeg, audio/wav, audio/x-wav, audio/aac, audio/mp4, audio/ogg; Max size: 10.0MB)",
          "required": true
        }
      ],
      "uploads": [
        {
          "field": "audio",
          "kind": "audio",
          "paramName": "audio_url"
        }
      ]
    },
    {
      "className": "ElevenlabsSoundEffectV2",
      "modelId": "elevenlabs/sound-effect-v2",
      "title": "elevenlabs/sound-effect-v2",
      "description": "elevenlabs/sound-effect-v2 via Kie.ai.\n\n    kie, audio, ai\n\n    Content generation using elevenlabs/sound-effect-v2",
      "outputType": "audio",
      "fields": [
        {
          "name": "text",
          "type": "str",
          "default": "",
          "title": "Text",
          "description": "The text describing the sound effect to generate (Max length: 5000 characters)",
          "required": true
        },
        {
          "name": "loop",
          "type": "bool",
          "default": false,
          "title": "Loop",
          "description": "Whether to create a sound effect that loops smoothly (Boolean value (true/false))",
          "required": false
        },
        {
          "name": "duration_seconds",
          "type": "float",
          "default": 0,
          "title": "Duration Seconds",
          "description": "Duration in seconds (0.5-22). If None, optimal duration will be determined from prompt (Min: 0.5, Max: 22, Step: 0.1) (step: 0.1)",
          "required": false,
          "min": 0.5,
          "max": 22
        },
        {
          "name": "prompt_influence",
          "type": "float",
          "default": 0.3,
          "title": "Prompt Influence",
          "description": "How closely to follow the prompt (0-1). Higher values mean less variation (Min: 0, Max: 1, Step: 0.01) (step: 0.01)",
          "required": false,
          "min": 0,
          "max": 1
        },
        {
          "name": "output_format",
          "type": "enum",
          "default": "mp3_44100_128",
          "title": "Output Format",
          "description": "Output format of the generated audio. Formatted as codec_sample_rate_bitrate",
          "required": false,
          "values": [
            "mp3_22050_32",
            "mp3_44100_32",
            "mp3_44100_64",
            "mp3_44100_96",
            "mp3_44100_128",
            "mp3_44100_192",
            "pcm_8000",
            "pcm_16000",
            "pcm_22050",
            "pcm_24000",
            "pcm_44100",
            "pcm_48000",
            "ulaw_8000",
            "alaw_8000",
            "opus_48000_32",
            "opus_48000_64",
            "opus_48000_96",
            "opus_48000_128",
            "opus_48000_192"
          ]
        }
      ],
      "validation": [
        {
          "field": "text",
          "rule": "not_empty",
          "message": "Text is required"
        }
      ]
    },
    {
      "className": "ElevenlabsSpeechToText",
      "modelId": "elevenlabs/speech-to-text",
      "title": "elevenlabs/speech-to-text",
      "description": "elevenlabs/speech-to-text via Kie.ai.\n\n    kie, audio, ai\n\n    Content generation using elevenlabs/speech-to-text",
      "outputType": "audio",
      "fields": [
        {
          "name": "audio",
          "type": "audio",
          "default": {
            "type": "audio",
            "uri": "",
            "asset_id": null,
            "data": null,
            "metadata": null
          },
          "title": "Audio",
          "description": "URL of the audio file to transcribe (File URL after upload, not file content; Accepted types: audio/mpeg, audio/wav, audio/x-wav, audio/aac, audio/mp3, audio/ogg; Max size: 200.0MB)",
          "required": true
        },
        {
          "name": "language_code",
          "type": "str",
          "default": "",
          "title": "Language Code",
          "description": "Language code of the audio (Max length: 500 characters)",
          "required": false
        },
        {
          "name": "tag_audio_events",
          "type": "bool",
          "default": false,
          "title": "Tag Audio Events",
          "description": "Tag audio events like laughter, applause, etc. (Boolean value (true/false))",
          "required": false
        },
        {
          "name": "diarize",
          "type": "bool",
          "default": false,
          "title": "Diarize",
          "description": "Whether to annotate who is speaking (Boolean value (true/false))",
          "required": false
        }
      ],
      "uploads": [
        {
          "field": "audio",
          "kind": "audio",
          "paramName": "audio_url"
        }
      ]
    },
    {
      "className": "ElevenlabsTextToDialogueV3",
      "modelId": "elevenlabs/text-to-dialogue-v3",
      "title": "elevenlabs/text-to-dialogue-v3",
      "description": "elevenlabs/text-to-dialogue-v3 via Kie.ai.\n\n    kie, audio, ai\n\n    Dialogue text-to-speech generation using elevenlabs/text-to-dialogue-v3",
      "outputType": "audio",
      "fields": [
        {
          "name": "dialogue",
          "type": "list[image]",
          "default": [],
          "title": "Dialogue",
          "description": "Array of dialogue items. Each item contains text and voice. The total character count of all text fields combined must not exceed 5000 characters.",
          "required": true
        },
        {
          "name": "stability",
          "type": "float",
          "default": 0.5,
          "title": "Stability",
          "description": "Voice stability parameter. Must be one of the following values: 0.0, 0.5, or 1.0",
          "required": false
        },
        {
          "name": "language_code",
          "type": "enum",
          "default": "",
          "title": "Language Code",
          "description": "Language code for the speech. Default is empty string or omit the parameter for automatic language detection.",
          "required": false,
          "values": [
            "af",
            "ar",
            "hy",
            "as",
            "az",
            "be",
            "bn",
            "bs",
            "bg",
            "ca",
            "ceb",
            "ny",
            "hr",
            "cs",
            "da",
            "nl",
            "en",
            "et",
            "fil",
            "fi",
            "fr",
            "gl",
            "ka",
            "de",
            "el",
            "gu",
            "ha",
            "he",
            "hi",
            "hu",
            "is",
            "id",
            "ga",
            "it",
            "ja",
            "jv",
            "kn",
            "kk",
            "ky",
            "ko",
            "lv",
            "ln",
            "lt",
            "lb",
            "mk",
            "ms",
            "ml",
            "zh",
            "mr",
            "ne",
            "no",
            "ps",
            "fa",
            "pl",
            "pt",
            "pa",
            "ro",
            "ru",
            "sr",
            "sd",
            "sk",
            "sl",
            "so",
            "es",
            "sw",
            "sv",
            "ta",
            "te",
            "th",
            "tr",
            "uk",
            "ur",
            "vi",
            "cy"
          ]
        }
      ]
    },
    {
      "className": "ElevenlabsTextToSpeechMultilingualV2",
      "modelId": "elevenlabs/text-to-speech-multilingual-v2",
      "title": "elevenlabs/text-to-speech-multilingual-v2",
      "description": "elevenlabs/text-to-speech-multilingual-v2 via Kie.ai.\n\n    kie, audio, ai\n\n    Content generation using elevenlabs/text-to-speech-multilingual-v2",
      "outputType": "audio",
      "fields": [
        {
          "name": "text",
          "type": "str",
          "default": "",
          "title": "Text",
          "description": "The text to convert to speech (Max length: 5000 characters)",
          "required": true
        },
        {
          "name": "voice",
          "type": "enum",
          "default": "EkK5I93UQWFDigLMpZcX",
          "title": "Voice",
          "description": "The voice to use for speech generation. Can be a preset voice name (e.g. Rachel, Adam) or a voice ID. You can preview a voice by opening https://static.aiquickdraw.com/elevenlabs/voice/<voice_id>.mp3 in your browser (replace <voice_id> with the actual voice ID). For example: https://static.aiquickdraw.com/elevenlabs/voice/N2lVS1w4EtoT3dr4eOWO.mp3 Available voices: EkK5I93UQWFDigLMpZcX - James - Husky, Engaging and Bold Z3R5wn05IrDiVCyEkUrK - Arabella - Mysterious and Emotive NNl6r8mD7vthiJatiJt1 - Bradford - Expressive and Articulate YOq2y2Up4RgXP2HyXjE5 - Xavier - Dominating, Metallic Announcer B8gJV1IhpuegLxdpXFOE - Kuon - Cheerful, Clear and Steady 2zRM7PkgwBPiau2jvVXc - Monika Sogam - Deep and Natural 1SM7GgM6IMuvQlz2BwM3 - Mark - Casual, Relaxed and Light 5l5f8iK3YPeGga21rQIX - Adeline - Feminine and Conversational scOwDtmlUjD3prqpp97I - Sam - Support Agent NOpBlnGInO9m6vDvFkFC - Spuds Oxley - Wise and Approachable BZgkqPqms7Kj9ulSkVzn - Eve - Authentic, Energetic and Happy wo6udizrrtpIxWGp2qJk - Northern Terry gU0LNdkMOQCOrPrwtbee - British Football Announcer DGzg6RaUqxGRTHSBjfgF - Brock - Commanding and Loud Sergeant x70vRnQBMBu4FAYhjJbO - Nathan - Virtual Radio Host Sm1seazb4gs7RSlUVw7c - Anika - Animated, Friendly and Engaging P1bg08DkjqiVEzOn76yG - Viraj - Rich and Soft qDuRKMlYmrm8trt5QyBn - Taksh - Calm, Serious and Smooth qXpMhyvQqiRxWQs4qSSB - Horatius - Energetic Character Voice TX3LPaxmHKxFdv7VOQHJ - Liam - Energetic, Social Media Creator N2lVS1w4EtoT3dr4eOWO - Callum - Husky Trickster FGY2WhTYpPnrIDTdsKH5 - Laura - Enthusiast, Quirky Attitude kPzsL2i3teMYv0FxEYQ6 - Brittney - Social Media Voice - Fun, Youthful & Informative UgBBYS2sOqTuMpoF3BR0 - Mark - Natural Conversations hpp4J3VqNfWAUOO0d1Us - Bella - Professional, Bright, Warm nPczCjzI2devNBz1zQrb - Brian - Deep, Resonant and Comforting uYXf8XasLslADfZ2MB4u - Hope - Bubbly, Gossipy and Girly gs0tAILXbY5DNrJrsM6F - Jeff - Classy, Resonating and Strong DTKMou8ccj1ZaWGBiotd - Jamahal - Young, Vibrant, and Natural vBKc2FfBKJfcZNyEt1n6 - Finn - Youthful, Eager and Energetic DYkrAHD8iwork3YSUBbs - Tom - Conversations & Books 56AoDkrOh6qfVPDXZ7Pt - Cassidy - Crisp, Direct and Clear eR40ATw9ArzDf9h3v7t7 - Addison 2.0 - Australian Audiobook & Podcast g6xIsTj2HwM6VR4iXFCw - Jessica Anne Bogart - Chatty and Friendly lcMyyd2HUfFzxdCaC4Ta - Lucy - Fresh & Casual 6aDn1KB0hjpdcocrUkmq - Tiffany - Natural and Welcoming Sq93GQT4X1lKDXsQcixO - Felix - Warm, Positive & Contemporary RP flHkNRp1BlvT73UL6gyz - Jessica Anne Bogart - Eloquent Villain 9yzdeviXkFddZ4Oz8Mok - Lutz - Chuckling, Giggly and Cheerful pPdl9cQBQq4p6mRkZy2Z - Emma - Adorable and Upbeat zYcjlYFOd3taleS0gkk3 - Edward - Loud, Confident and Cocky nzeAacJi50IvxcyDnMXa - Marshal - Friendly, Funny Professor ruirxsoakN0GWmGNIo04 - John Morgan - Gritty, Rugged Cowboy TC0Zp7WVFzhA8zpTlRqV - Aria - Sultry Villain ljo9gAlSqKOvF6D8sOsX - Viking Bjorn - Epic Medieval Raider PPzYpIqttlTYA83688JI - Pirate Marshal 8JVbfL6oEdmuxKn5DK2C - Johnny Kid - Serious and Calm Narrator iCrDUkL56s3C8sCRl7wb - Hope - Poetic, Romantic and Captivating wJqPPQ618aTW29mptyoc - Ana Rita - Smooth, Expressive and Bright EiNlNiXeDU1pqqOPrYMO - John Doe - Deep 4YYIPFl9wE5c4L2eu2Gb - Burt Reynolds™ - Deep, Smooth and Clear 6F5Zhi321D3Oq7v1oNT4 - Hank - Deep and Engaging Narrator YXpFCvM1S3JbWEJhoskW - Wyatt - Wise Rustic Cowboy LG95yZDEHg6fCZdQjLqj - Phil - Explosive, Passionate Announcer CeNX9CMwmxDxUF5Q2Inm - Johnny Dynamite - Vintage Radio DJ aD6riP1btT197c6dACmy - Rachel M - Pro British Radio Presenter mtrellq69YZsNwzUSyXh - Rex Thunder - Deep N Tough dHd5gvgSOzSfduK4CvEg - Ed - Late Night Announcer eVItLK1UvXctxuaRV2Oq - Jean - Alluring and Playful Femme Fatale esy0r39YPLQjOczyOib8 - Britney - Calm and Calculative Villain Tsns2HvNFKfGiNjllgqo - Sven - Emotional and Nice 1U02n4nD6AdIZ9CjF053 - Viraj - Smooth and Gentle AeRdCCKzvd23BpJoofzx - Nathaniel - Engaging, British and Calm LruHrtVF6PSyGItzMNHS - Benjamin - Deep, Warm, Calming 1wGbFxmAM3Fgw63G1zZJ - Allison - Calm, Soothing and Meditative hqfrgApggtO1785R4Fsn - Theodore HQ - Serene and Grounded MJ0RnG71ty4LH3dvNfSd - Leon - Soothing and Grounded",
          "required": true,
          "values": [
            "EkK5I93UQWFDigLMpZcX",
            "Z3R5wn05IrDiVCyEkUrK",
            "NNl6r8mD7vthiJatiJt1",
            "YOq2y2Up4RgXP2HyXjE5",
            "B8gJV1IhpuegLxdpXFOE",
            "2zRM7PkgwBPiau2jvVXc",
            "1SM7GgM6IMuvQlz2BwM3",
            "5l5f8iK3YPeGga21rQIX",
            "scOwDtmlUjD3prqpp97I",
            "NOpBlnGInO9m6vDvFkFC",
            "BZgkqPqms7Kj9ulSkVzn",
            "wo6udizrrtpIxWGp2qJk",
            "gU0LNdkMOQCOrPrwtbee",
            "DGzg6RaUqxGRTHSBjfgF",
            "x70vRnQBMBu4FAYhjJbO",
            "Sm1seazb4gs7RSlUVw7c",
            "P1bg08DkjqiVEzOn76yG",
            "qDuRKMlYmrm8trt5QyBn",
            "qXpMhyvQqiRxWQs4qSSB",
            "TX3LPaxmHKxFdv7VOQHJ",
            "N2lVS1w4EtoT3dr4eOWO",
            "FGY2WhTYpPnrIDTdsKH5",
            "kPzsL2i3teMYv0FxEYQ6",
            "UgBBYS2sOqTuMpoF3BR0",
            "hpp4J3VqNfWAUOO0d1Us",
            "nPczCjzI2devNBz1zQrb",
            "uYXf8XasLslADfZ2MB4u",
            "gs0tAILXbY5DNrJrsM6F",
            "DTKMou8ccj1ZaWGBiotd",
            "vBKc2FfBKJfcZNyEt1n6",
            "DYkrAHD8iwork3YSUBbs",
            "56AoDkrOh6qfVPDXZ7Pt",
            "eR40ATw9ArzDf9h3v7t7",
            "g6xIsTj2HwM6VR4iXFCw",
            "lcMyyd2HUfFzxdCaC4Ta",
            "6aDn1KB0hjpdcocrUkmq",
            "Sq93GQT4X1lKDXsQcixO",
            "flHkNRp1BlvT73UL6gyz",
            "9yzdeviXkFddZ4Oz8Mok",
            "pPdl9cQBQq4p6mRkZy2Z",
            "zYcjlYFOd3taleS0gkk3",
            "nzeAacJi50IvxcyDnMXa",
            "ruirxsoakN0GWmGNIo04",
            "TC0Zp7WVFzhA8zpTlRqV",
            "ljo9gAlSqKOvF6D8sOsX",
            "PPzYpIqttlTYA83688JI",
            "8JVbfL6oEdmuxKn5DK2C",
            "iCrDUkL56s3C8sCRl7wb",
            "wJqPPQ618aTW29mptyoc",
            "EiNlNiXeDU1pqqOPrYMO",
            "4YYIPFl9wE5c4L2eu2Gb",
            "6F5Zhi321D3Oq7v1oNT4",
            "YXpFCvM1S3JbWEJhoskW",
            "LG95yZDEHg6fCZdQjLqj",
            "CeNX9CMwmxDxUF5Q2Inm",
            "aD6riP1btT197c6dACmy",
            "mtrellq69YZsNwzUSyXh",
            "dHd5gvgSOzSfduK4CvEg",
            "eVItLK1UvXctxuaRV2Oq",
            "esy0r39YPLQjOczyOib8",
            "Tsns2HvNFKfGiNjllgqo",
            "1U02n4nD6AdIZ9CjF053",
            "AeRdCCKzvd23BpJoofzx",
            "LruHrtVF6PSyGItzMNHS",
            "1wGbFxmAM3Fgw63G1zZJ",
            "hqfrgApggtO1785R4Fsn",
            "MJ0RnG71ty4LH3dvNfSd"
          ]
        },
        {
          "name": "stability",
          "type": "float",
          "default": 0.5,
          "title": "Stability",
          "description": "Voice stability (0-1) (Min: 0, Max: 1, Step: 0.01) (step: 0.01)",
          "required": false,
          "min": 0,
          "max": 1
        },
        {
          "name": "similarity_boost",
          "type": "float",
          "default": 0.75,
          "title": "Similarity Boost",
          "description": "Similarity boost (0-1) (Min: 0, Max: 1, Step: 0.01) (step: 0.01)",
          "required": false,
          "min": 0,
          "max": 1
        },
        {
          "name": "style",
          "type": "float",
          "default": 0,
          "title": "Style",
          "description": "Style exaggeration (0-1) (Min: 0, Max: 1, Step: 0.01) (step: 0.01)",
          "required": false,
          "min": 0,
          "max": 1
        },
        {
          "name": "speed",
          "type": "float",
          "default": 1,
          "title": "Speed",
          "description": "Speech speed (0.7-1.2). Values below 1.0 slow down the speech, above 1.0 speed it up. Extreme values may affect quality. (Min: 0.7, Max: 1.2, Step: 0.01) (step: 0.01)",
          "required": false,
          "min": 0.7,
          "max": 1.2
        },
        {
          "name": "timestamps",
          "type": "bool",
          "default": false,
          "title": "Timestamps",
          "description": "Whether to return timestamps for each word in the generated speech (Boolean value (true/false))",
          "required": false
        },
        {
          "name": "previous_text",
          "type": "str",
          "default": "",
          "title": "Previous Text",
          "description": "The text that came before the text of the current request. Can be used to improve the speech's continuity when concatenating together multiple generations or to influence the speech's continuity in the current generation. (Max length: 5000 characters)",
          "required": false
        },
        {
          "name": "next_text",
          "type": "str",
          "default": "",
          "title": "Next Text",
          "description": "The text that comes after the text of the current request. Can be used to improve the speech's continuity when concatenating together multiple generations or to influence the speech's continuity in the current generation. (Max length: 5000 characters)",
          "required": false
        },
        {
          "name": "language_code",
          "type": "str",
          "default": "",
          "title": "Language Code",
          "description": "Language code (ISO 639-1) used to enforce a language for the model. Currently only Turbo v2.5 and Flash v2.5 support language enforcement. For other models, an error will be returned if language code is provided. (Max length: 500 characters)",
          "required": false
        }
      ],
      "validation": [
        {
          "field": "text",
          "rule": "not_empty",
          "message": "Text is required"
        },
        {
          "field": "voice",
          "rule": "not_empty",
          "message": "Voice is required"
        }
      ]
    },
    {
      "className": "ElevenlabsTextToSpeechTurbo25",
      "modelId": "elevenlabs/text-to-speech-turbo-2-5",
      "title": "elevenlabs/text-to-speech-turbo-2-5",
      "description": "elevenlabs/text-to-speech-turbo-2-5 via Kie.ai.\n\n    kie, audio, ai\n\n    Content generation using elevenlabs/text-to-speech-turbo-2-5",
      "outputType": "audio",
      "fields": [
        {
          "name": "text",
          "type": "str",
          "default": "",
          "title": "Text",
          "description": "The text to convert to speech (Max length: 5000 characters)",
          "required": true
        },
        {
          "name": "voice",
          "type": "enum",
          "default": "EkK5I93UQWFDigLMpZcX",
          "title": "Voice",
          "description": "The voice to use for speech generation. Can be a preset voice name (e.g. Rachel, Adam) or a voice ID. You can preview a voice by opening https://static.aiquickdraw.com/elevenlabs/voice/<voice_id>.mp3 in your browser (replace <voice_id> with the actual voice ID). For example: https://static.aiquickdraw.com/elevenlabs/voice/N2lVS1w4EtoT3dr4eOWO.mp3 Available voices: EkK5I93UQWFDigLMpZcX - James - Husky, Engaging and Bold Z3R5wn05IrDiVCyEkUrK - Arabella - Mysterious and Emotive NNl6r8mD7vthiJatiJt1 - Bradford - Expressive and Articulate YOq2y2Up4RgXP2HyXjE5 - Xavier - Dominating, Metallic Announcer B8gJV1IhpuegLxdpXFOE - Kuon - Cheerful, Clear and Steady 2zRM7PkgwBPiau2jvVXc - Monika Sogam - Deep and Natural 1SM7GgM6IMuvQlz2BwM3 - Mark - Casual, Relaxed and Light 5l5f8iK3YPeGga21rQIX - Adeline - Feminine and Conversational scOwDtmlUjD3prqpp97I - Sam - Support Agent NOpBlnGInO9m6vDvFkFC - Spuds Oxley - Wise and Approachable BZgkqPqms7Kj9ulSkVzn - Eve - Authentic, Energetic and Happy wo6udizrrtpIxWGp2qJk - Northern Terry gU0LNdkMOQCOrPrwtbee - British Football Announcer DGzg6RaUqxGRTHSBjfgF - Brock - Commanding and Loud Sergeant x70vRnQBMBu4FAYhjJbO - Nathan - Virtual Radio Host Sm1seazb4gs7RSlUVw7c - Anika - Animated, Friendly and Engaging P1bg08DkjqiVEzOn76yG - Viraj - Rich and Soft qDuRKMlYmrm8trt5QyBn - Taksh - Calm, Serious and Smooth qXpMhyvQqiRxWQs4qSSB - Horatius - Energetic Character Voice TX3LPaxmHKxFdv7VOQHJ - Liam - Energetic, Social Media Creator N2lVS1w4EtoT3dr4eOWO - Callum - Husky Trickster FGY2WhTYpPnrIDTdsKH5 - Laura - Enthusiast, Quirky Attitude kPzsL2i3teMYv0FxEYQ6 - Brittney - Social Media Voice - Fun, Youthful & Informative UgBBYS2sOqTuMpoF3BR0 - Mark - Natural Conversations hpp4J3VqNfWAUOO0d1Us - Bella - Professional, Bright, Warm nPczCjzI2devNBz1zQrb - Brian - Deep, Resonant and Comforting uYXf8XasLslADfZ2MB4u - Hope - Bubbly, Gossipy and Girly gs0tAILXbY5DNrJrsM6F - Jeff - Classy, Resonating and Strong DTKMou8ccj1ZaWGBiotd - Jamahal - Young, Vibrant, and Natural vBKc2FfBKJfcZNyEt1n6 - Finn - Youthful, Eager and Energetic DYkrAHD8iwork3YSUBbs - Tom - Conversations & Books 56AoDkrOh6qfVPDXZ7Pt - Cassidy - Crisp, Direct and Clear eR40ATw9ArzDf9h3v7t7 - Addison 2.0 - Australian Audiobook & Podcast g6xIsTj2HwM6VR4iXFCw - Jessica Anne Bogart - Chatty and Friendly lcMyyd2HUfFzxdCaC4Ta - Lucy - Fresh & Casual 6aDn1KB0hjpdcocrUkmq - Tiffany - Natural and Welcoming Sq93GQT4X1lKDXsQcixO - Felix - Warm, Positive & Contemporary RP flHkNRp1BlvT73UL6gyz - Jessica Anne Bogart - Eloquent Villain 9yzdeviXkFddZ4Oz8Mok - Lutz - Chuckling, Giggly and Cheerful pPdl9cQBQq4p6mRkZy2Z - Emma - Adorable and Upbeat zYcjlYFOd3taleS0gkk3 - Edward - Loud, Confident and Cocky nzeAacJi50IvxcyDnMXa - Marshal - Friendly, Funny Professor ruirxsoakN0GWmGNIo04 - John Morgan - Gritty, Rugged Cowboy TC0Zp7WVFzhA8zpTlRqV - Aria - Sultry Villain ljo9gAlSqKOvF6D8sOsX - Viking Bjorn - Epic Medieval Raider PPzYpIqttlTYA83688JI - Pirate Marshal 8JVbfL6oEdmuxKn5DK2C - Johnny Kid - Serious and Calm Narrator iCrDUkL56s3C8sCRl7wb - Hope - Poetic, Romantic and Captivating wJqPPQ618aTW29mptyoc - Ana Rita - Smooth, Expressive and Bright EiNlNiXeDU1pqqOPrYMO - John Doe - Deep 4YYIPFl9wE5c4L2eu2Gb - Burt Reynolds™ - Deep, Smooth and Clear 6F5Zhi321D3Oq7v1oNT4 - Hank - Deep and Engaging Narrator YXpFCvM1S3JbWEJhoskW - Wyatt - Wise Rustic Cowboy LG95yZDEHg6fCZdQjLqj - Phil - Explosive, Passionate Announcer CeNX9CMwmxDxUF5Q2Inm - Johnny Dynamite - Vintage Radio DJ aD6riP1btT197c6dACmy - Rachel M - Pro British Radio Presenter mtrellq69YZsNwzUSyXh - Rex Thunder - Deep N Tough dHd5gvgSOzSfduK4CvEg - Ed - Late Night Announcer eVItLK1UvXctxuaRV2Oq - Jean - Alluring and Playful Femme Fatale esy0r39YPLQjOczyOib8 - Britney - Calm and Calculative Villain Tsns2HvNFKfGiNjllgqo - Sven - Emotional and Nice 1U02n4nD6AdIZ9CjF053 - Viraj - Smooth and Gentle AeRdCCKzvd23BpJoofzx - Nathaniel - Engaging, British and Calm LruHrtVF6PSyGItzMNHS - Benjamin - Deep, Warm, Calming 1wGbFxmAM3Fgw63G1zZJ - Allison - Calm, Soothing and Meditative hqfrgApggtO1785R4Fsn - Theodore HQ - Serene and Grounded MJ0RnG71ty4LH3dvNfSd - Leon - Soothing and Grounded",
          "required": false,
          "values": [
            "EkK5I93UQWFDigLMpZcX",
            "Z3R5wn05IrDiVCyEkUrK",
            "NNl6r8mD7vthiJatiJt1",
            "YOq2y2Up4RgXP2HyXjE5",
            "B8gJV1IhpuegLxdpXFOE",
            "2zRM7PkgwBPiau2jvVXc",
            "1SM7GgM6IMuvQlz2BwM3",
            "5l5f8iK3YPeGga21rQIX",
            "scOwDtmlUjD3prqpp97I",
            "NOpBlnGInO9m6vDvFkFC",
            "BZgkqPqms7Kj9ulSkVzn",
            "wo6udizrrtpIxWGp2qJk",
            "gU0LNdkMOQCOrPrwtbee",
            "DGzg6RaUqxGRTHSBjfgF",
            "x70vRnQBMBu4FAYhjJbO",
            "Sm1seazb4gs7RSlUVw7c",
            "P1bg08DkjqiVEzOn76yG",
            "qDuRKMlYmrm8trt5QyBn",
            "qXpMhyvQqiRxWQs4qSSB",
            "TX3LPaxmHKxFdv7VOQHJ",
            "N2lVS1w4EtoT3dr4eOWO",
            "FGY2WhTYpPnrIDTdsKH5",
            "kPzsL2i3teMYv0FxEYQ6",
            "UgBBYS2sOqTuMpoF3BR0",
            "hpp4J3VqNfWAUOO0d1Us",
            "nPczCjzI2devNBz1zQrb",
            "uYXf8XasLslADfZ2MB4u",
            "gs0tAILXbY5DNrJrsM6F",
            "DTKMou8ccj1ZaWGBiotd",
            "vBKc2FfBKJfcZNyEt1n6",
            "DYkrAHD8iwork3YSUBbs",
            "56AoDkrOh6qfVPDXZ7Pt",
            "eR40ATw9ArzDf9h3v7t7",
            "g6xIsTj2HwM6VR4iXFCw",
            "lcMyyd2HUfFzxdCaC4Ta",
            "6aDn1KB0hjpdcocrUkmq",
            "Sq93GQT4X1lKDXsQcixO",
            "flHkNRp1BlvT73UL6gyz",
            "9yzdeviXkFddZ4Oz8Mok",
            "pPdl9cQBQq4p6mRkZy2Z",
            "zYcjlYFOd3taleS0gkk3",
            "nzeAacJi50IvxcyDnMXa",
            "ruirxsoakN0GWmGNIo04",
            "TC0Zp7WVFzhA8zpTlRqV",
            "ljo9gAlSqKOvF6D8sOsX",
            "PPzYpIqttlTYA83688JI",
            "8JVbfL6oEdmuxKn5DK2C",
            "iCrDUkL56s3C8sCRl7wb",
            "wJqPPQ618aTW29mptyoc",
            "EiNlNiXeDU1pqqOPrYMO",
            "4YYIPFl9wE5c4L2eu2Gb",
            "6F5Zhi321D3Oq7v1oNT4",
            "YXpFCvM1S3JbWEJhoskW",
            "LG95yZDEHg6fCZdQjLqj",
            "CeNX9CMwmxDxUF5Q2Inm",
            "aD6riP1btT197c6dACmy",
            "mtrellq69YZsNwzUSyXh",
            "dHd5gvgSOzSfduK4CvEg",
            "eVItLK1UvXctxuaRV2Oq",
            "esy0r39YPLQjOczyOib8",
            "Tsns2HvNFKfGiNjllgqo",
            "1U02n4nD6AdIZ9CjF053",
            "AeRdCCKzvd23BpJoofzx",
            "LruHrtVF6PSyGItzMNHS",
            "1wGbFxmAM3Fgw63G1zZJ",
            "hqfrgApggtO1785R4Fsn",
            "MJ0RnG71ty4LH3dvNfSd"
          ]
        },
        {
          "name": "stability",
          "type": "float",
          "default": 0.5,
          "title": "Stability",
          "description": "Voice stability (0-1) (Min: 0, Max: 1, Step: 0.01) (step: 0.01)",
          "required": false,
          "min": 0,
          "max": 1
        },
        {
          "name": "similarity_boost",
          "type": "float",
          "default": 0.75,
          "title": "Similarity Boost",
          "description": "Similarity boost (0-1) (Min: 0, Max: 1, Step: 0.01) (step: 0.01)",
          "required": false,
          "min": 0,
          "max": 1
        },
        {
          "name": "style",
          "type": "float",
          "default": 0,
          "title": "Style",
          "description": "Style exaggeration (0-1) (Min: 0, Max: 1, Step: 0.01) (step: 0.01)",
          "required": false,
          "min": 0,
          "max": 1
        },
        {
          "name": "speed",
          "type": "float",
          "default": 1,
          "title": "Speed",
          "description": "Speech speed (0.7-1.2). Values below 1.0 slow down the speech, above 1.0 speed it up. Extreme values may affect quality. (Min: 0.7, Max: 1.2, Step: 0.01) (step: 0.01)",
          "required": false,
          "min": 0.7,
          "max": 1.2
        },
        {
          "name": "timestamps",
          "type": "bool",
          "default": false,
          "title": "Timestamps",
          "description": "Whether to return timestamps for each word in the generated speech (Boolean value (true/false))",
          "required": false
        },
        {
          "name": "previous_text",
          "type": "str",
          "default": "",
          "title": "Previous Text",
          "description": "The text that came before the text of the current request. Can be used to improve the speech's continuity when concatenating together multiple generations or to influence the speech's continuity in the current generation. (Max length: 5000 characters)",
          "required": false
        },
        {
          "name": "next_text",
          "type": "str",
          "default": "",
          "title": "Next Text",
          "description": "The text that comes after the text of the current request. Can be used to improve the speech's continuity when concatenating together multiple generations or to influence the speech's continuity in the current generation. (Max length: 5000 characters)",
          "required": false
        },
        {
          "name": "language_code",
          "type": "str",
          "default": "",
          "title": "Language Code",
          "description": "Language code (ISO 639-1) used to enforce a language for the model. Currently only Turbo v2.5 and Flash v2.5 support language enforcement. For other models, an error will be returned if language code is provided. (Max length: 500 characters)",
          "required": false
        }
      ],
      "validation": [
        {
          "field": "text",
          "rule": "not_empty",
          "message": "Text is required"
        }
      ]
    },
    {
      "className": "GenerateMusic",
      "modelId": "generate-music",
      "title": "Generate Music",
      "description": "Generate Music via Kie.ai.\n\n    kie, audio, ai\n\n    Generate music with or without lyrics using AI models.",
      "outputType": "audio",
      "useSuno": true,
      "sunoEndpoint": "/api/v1/generate",
      "fields": [
        {
          "name": "prompt",
          "type": "str",
          "default": "",
          "title": "Prompt",
          "description": "A description of the desired audio content. - In Custom Mode (`customMode: true`): Required if `instrumental` is `false`. The prompt will be strictly used as the lyrics and sung in the generated track. Character limits by model: - **V4**: Maximum 3000 characters - **V4_5 & V4_5PLUS**: Maximum 5000 characters - **V4_5ALL**: Maximum 5000 characters - **V5_5 & V5**: Maximum 5000 characters Example: \"A calm and relaxing piano track with soft melodies\" - In Non-custom Mode (`customMode: false`): Always required. The prompt serves as the core idea, and lyrics will be automatically generated based on it (not strictly matching the input). Maximum 500 characters. Example: \"A short relaxing piano tune\"",
          "required": true
        },
        {
          "name": "style",
          "type": "str",
          "default": "",
          "title": "Style",
          "description": "Music style specification for the generated audio. - Required in Custom Mode (`customMode: true`). Defines the genre, mood, or artistic direction. - Character limits by model: - **V4**: Maximum 200 characters - **V4_5 & V4_5PLUS**: Maximum 1000 characters - **V4_5ALL**: Maximum 1000 characters - **V5_5 & V5**: Maximum 1000 characters - Common examples: Jazz, Classical, Electronic, Pop, Rock, Hip-hop, etc.",
          "required": false
        },
        {
          "name": "title",
          "type": "str",
          "default": "",
          "title": "Title",
          "description": "Title for the generated music track. - Required in Custom Mode (`customMode: true`). - Max length: 80 characters. - Will be displayed in player interfaces and filenames.",
          "required": false
        },
        {
          "name": "customMode",
          "type": "bool",
          "default": false,
          "title": "Custom Mode",
          "description": "Determines if advanced parameter customization is enabled. - If `true`: Allows detailed control with specific requirements for `style` and `title` fields. - If `false`: Simplified mode where only `prompt` is required and other parameters are ignored.",
          "required": true
        },
        {
          "name": "instrumental",
          "type": "bool",
          "default": false,
          "title": "Instrumental",
          "description": "Determines if the audio should be instrumental (no lyrics). - In Custom Mode (`customMode: true`): - If `true`: Only `style` and `title` are required. - If `false`: `style`, `title`, and `prompt` are required (with prompt used as the exact lyrics). - In Non-custom Mode (`customMode: false`): No impact on required fields (prompt only).",
          "required": true
        },
        {
          "name": "model",
          "type": "enum",
          "default": "",
          "title": "Model",
          "description": "The AI model version to use for generation. - Required for all requests. - Available options: - **`V5_5`**：Custom Models Tailored to Your Unique Taste. - **`V5`**: Superior musical expression, faster generation. - **`V4_5PLUS`**: V4.5+ delivers richer sound, new ways to create, max 8 min. - **`V4_5`**: V4.5 enables smarter prompts, faster generations, max 8 min. - **`V4_5ALL`**: V4.5ALL enables smarter prompts, faster generations, max 8 min. - **`V4`**: V4 improves vocal quality, max 4 min.",
          "required": true,
          "values": [
            "V4",
            "V4_5",
            "V4_5PLUS",
            "V4_5ALL",
            "V5",
            "V5_5"
          ]
        },
        {
          "name": "negativeTags",
          "type": "str",
          "default": "",
          "title": "Negative Tags",
          "description": "Music styles or traits to exclude from the generated audio. Optional. Use to avoid specific styles.",
          "required": false
        },
        {
          "name": "vocalGender",
          "type": "enum",
          "default": "",
          "title": "Vocal Gender",
          "description": "Vocal gender preference for the singing voice. Optional. Use 'm' for male and 'f' for female. Note: This parameter is only effective when customMode is true. Based on practice, this parameter can only increase the probability but cannot guarantee adherence to male/female voice instructions.",
          "required": false,
          "values": [
            "m",
            "f"
          ]
        },
        {
          "name": "styleWeight",
          "type": "float",
          "default": 0,
          "title": "Style Weight",
          "description": "Strength of adherence to the specified style. Optional. Range 0–1, up to 2 decimal places.",
          "required": false,
          "min": 0,
          "max": 1
        },
        {
          "name": "weirdnessConstraint",
          "type": "float",
          "default": 0,
          "title": "Weirdness Constraint",
          "description": "Controls experimental/creative deviation. Optional. Range 0–1, up to 2 decimal places.",
          "required": false,
          "min": 0,
          "max": 1
        },
        {
          "name": "audioWeight",
          "type": "float",
          "default": 0,
          "title": "Audio Weight",
          "description": "Balance weight for audio features vs. other factors. Optional. Range 0–1, up to 2 decimal places.",
          "required": false,
          "min": 0,
          "max": 1
        },
        {
          "name": "personaId",
          "type": "str",
          "default": "",
          "title": "Persona Id",
          "description": "Only available when Custom Mode (`customMode: true`) is enabled. Persona ID to apply to the generated music. Optional. Use this to apply a specific persona style to your music generation. To generate a persona ID, use the [Generate Persona](https://docs.kie.ai/suno-api/generate-persona) endpoint to create a personalized music Persona based on generated music.",
          "required": false
        }
      ],
      "validation": [
        {
          "field": "prompt",
          "rule": "not_empty",
          "message": "Prompt is required"
        },
        {
          "field": "model",
          "rule": "not_empty",
          "message": "Model is required"
        }
      ]
    },
    {
      "className": "ExtendMusic",
      "modelId": "extend-music",
      "title": "Extend Music",
      "description": "Extend Music via Kie.ai.\n\n    kie, audio, ai\n\n    Extend or modify existing music by creating a continuation based on a source audio track.",
      "outputType": "audio",
      "useSuno": true,
      "sunoEndpoint": "/api/v1/generate/extend",
      "fields": [
        {
          "name": "defaultParamFlag",
          "type": "bool",
          "default": false,
          "title": "Default Param Flag",
          "description": "Controls parameter source for extension. - If `true`: Use custom parameters specified in this request. Requires `continueAt`, `prompt`, `style`, and `title`. - If `false`: Use original audio parameters. Only `audioId` is required, other parameters are inherited.",
          "required": true
        },
        {
          "name": "audioId",
          "type": "str",
          "default": "",
          "title": "Audio Id",
          "description": "Unique identifier of the audio track to extend. Required for all extension requests.",
          "required": true
        },
        {
          "name": "prompt",
          "type": "str",
          "default": "",
          "title": "Prompt",
          "description": "Description of the desired audio extension content. - Required when `defaultParamFlag` is `true`. - Character limits by model: - **V4**: Maximum 3000 characters - **V4_5 & V4_5PLUS**: Maximum 5000 characters - **V4_5ALL**: Maximum 5000 characters - **V5_5 & V5**: Maximum 5000 characters - Describes how the music should continue or change in the extension.",
          "required": true
        },
        {
          "name": "style",
          "type": "str",
          "default": "",
          "title": "Style",
          "description": "Music style specification for the extended audio. - Required when `defaultParamFlag` is `true`. - Character limits by model: - **V4**: Maximum 200 characters - **V4_5 & V4_5PLUS**: Maximum 1000 characters - **V4_5ALL**: Maximum 1000 characters - **V5_5 & V5**: Maximum 1000 characters - Should typically align with the original audio's style for best results.",
          "required": false
        },
        {
          "name": "title",
          "type": "str",
          "default": "",
          "title": "Title",
          "description": "Title for the extended music track. - Required when `defaultParamFlag` is `true`. - Character limits by model: - **V4**: Maximum 80 characters - **V4_5 & V4_5PLUS**: Maximum 100 characters - **V4_5ALL**: Maximum 80 characters - **V5_5 & V5**: Maximum 100 characters - Will be displayed in player interfaces and filenames.",
          "required": false
        },
        {
          "name": "continueAt",
          "type": "float",
          "default": 0,
          "title": "Continue At",
          "description": "The time point (in seconds) from which to start extending the music. - Required when `defaultParamFlag` is `true`. - Value range: greater than 0 and less than the total duration of the generated audio. - Specifies the position in the original track where the extension should begin.",
          "required": false
        },
        {
          "name": "model",
          "type": "enum",
          "default": "",
          "title": "Model",
          "description": "The AI model version to use for generation. - Required for all requests. - Available options: - **`V5_5`**：Custom Models Tailored to Your Unique Taste. - **`V5`**: Superior musical expression, faster generation. - **`V4_5PLUS`**: V4.5+ delivers richer sound, new ways to create, max 8 min. - **`V4_5`**: V4.5 enables smarter prompts, faster generations, max 8 min. - **`V4_5ALL`**: V4.5ALL enables smarter prompts, faster generations, max 8 min. - **`V4`**: V4 improves vocal quality, max 4 min.",
          "required": true,
          "values": [
            "V4",
            "V4_5",
            "V4_5PLUS",
            "V4_5ALL",
            "V5",
            "V5_5"
          ]
        },
        {
          "name": "negativeTags",
          "type": "str",
          "default": "",
          "title": "Negative Tags",
          "description": "Music styles or traits to exclude from the extended audio. Optional. Use to avoid specific undesired characteristics.",
          "required": false
        },
        {
          "name": "vocalGender",
          "type": "enum",
          "default": "",
          "title": "Vocal Gender",
          "description": "Vocal gender preference for the singing voice. Optional. Use 'm' for male and 'f' for female. Based on practice, this parameter can only increase the probability but cannot guarantee adherence to male/female voice instructions.",
          "required": false,
          "values": [
            "m",
            "f"
          ]
        },
        {
          "name": "styleWeight",
          "type": "float",
          "default": 0,
          "title": "Style Weight",
          "description": "Strength of adherence to the specified style. Optional. Range 0–1, up to 2 decimal places.",
          "required": false,
          "min": 0,
          "max": 1
        },
        {
          "name": "weirdnessConstraint",
          "type": "float",
          "default": 0,
          "title": "Weirdness Constraint",
          "description": "Controls experimental/creative deviation. Optional. Range 0–1, up to 2 decimal places.",
          "required": false,
          "min": 0,
          "max": 1
        },
        {
          "name": "audioWeight",
          "type": "float",
          "default": 0,
          "title": "Audio Weight",
          "description": "Balance weight for audio features vs. other factors. Optional. Range 0–1, up to 2 decimal places.",
          "required": false,
          "min": 0,
          "max": 1
        },
        {
          "name": "personaId",
          "type": "str",
          "default": "",
          "title": "Persona Id",
          "description": "Only available when Custom Mode (`customMode: true`) is enabled. Persona ID to apply to the generated music. Optional. Use this to apply a specific persona style to your music generation. To generate a persona ID, use the [](generate-persona) endpoint to create a personalized music Persona based on generated music.",
          "required": false
        }
      ],
      "validation": [
        {
          "field": "audioId",
          "rule": "not_empty",
          "message": "Audio Id is required"
        },
        {
          "field": "prompt",
          "rule": "not_empty",
          "message": "Prompt is required"
        },
        {
          "field": "model",
          "rule": "not_empty",
          "message": "Model is required"
        }
      ]
    },
    {
      "className": "UploadAndCoverAudio",
      "modelId": "upload-and-cover-audio",
      "title": "Upload And Cover Audio",
      "description": "Upload And Cover Audio via Kie.ai.\n\n    kie, audio, ai\n\n    > This API creates a cover version of an audio track by transforming it into a new style while retaining its core melody. It incorporates Suno's upload capability, enabling users to upload an audio file for processing. The expected result is a refreshed audio track with a new style, keeping the original melody intact.",
      "outputType": "audio",
      "useSuno": true,
      "sunoEndpoint": "/api/v1/generate/upload-cover",
      "fields": [
        {
          "name": "uploadUrl",
          "type": "audio",
          "default": {
            "type": "audio",
            "uri": "",
            "asset_id": null,
            "data": null,
            "metadata": null
          },
          "title": "Upload Url",
          "description": "The URL for uploading audio files, required regardless of whether customMode and instrumental are true or false. Ensure the uploaded audio does not exceed 8 minutes in length.",
          "required": true
        },
        {
          "name": "prompt",
          "type": "str",
          "default": "",
          "title": "Prompt",
          "description": "A description of the desired audio content. - In Custom Mode (`customMode: true`): Required if `instrumental` is `false`. The prompt will be strictly used as the lyrics and sung in the generated track. Character limits by model: - **V5_5 & V5**: Maximum 5000 characters - **V4_5PLUS & V4_5**: Maximum 5000 characters - **V4_5ALL**: Maximum 5000 characters - **V4**: Maximum 3000 characters Example: \"A calm and relaxing piano track with soft melodies\" - In Non-custom Mode (`customMode: false`): Always required. The prompt serves as the core idea, and lyrics will be automatically generated based on it (not strictly matching the input). Max length: 500 characters. Example: \"A short relaxing piano tune\"",
          "required": true
        },
        {
          "name": "style",
          "type": "str",
          "default": "",
          "title": "Style",
          "description": "The music style or genre for the audio. - Required in Custom Mode (`customMode: true`). Examples: \"Jazz\", \"Classical\", \"Electronic\". Character limits by model: - **V5_5 & V5**: Maximum 1000 characters - **V4_5PLUS & V4_5**: Maximum 1000 characters - **V4_5ALL**: Maximum 1000 characters - **V4**: Maximum 200 characters Example: \"Classical\" - In Non-custom Mode (`customMode: false`): Leave empty.",
          "required": false
        },
        {
          "name": "title",
          "type": "str",
          "default": "",
          "title": "Title",
          "description": "The title of the generated music track. - Required in Custom Mode (`customMode: true`). Character limits by model: - **V5_5 & V5**: Maximum 100 characters - **V4_5PLUS & V4_5**: Maximum 100 characters - **V4_5ALL**: Maximum 80 characters - **V4**: Maximum 80 characters Example: \"Peaceful Piano Meditation\" - In Non-custom Mode (`customMode: false`): Leave empty.",
          "required": false
        },
        {
          "name": "customMode",
          "type": "bool",
          "default": false,
          "title": "Custom Mode",
          "description": "Enables Custom Mode for advanced audio generation settings. - Set to `true` to use Custom Mode (requires `style` and `title`; `prompt` required if `instrumental` is `false`). The prompt will be strictly used as lyrics if `instrumental` is `false`. - Set to `false` for Non-custom Mode (only `prompt` is required). Lyrics will be auto-generated based on the prompt.",
          "required": true
        },
        {
          "name": "instrumental",
          "type": "bool",
          "default": false,
          "title": "Instrumental",
          "description": "Determines if the audio should be instrumental (no lyrics). - In Custom Mode (`customMode: true`): - If `true`: Only `style` and `title` are required. - If `false`: `style`, `title`, and `prompt` are required (with `prompt` used as the exact lyrics). - In Non-custom Mode (`customMode: false`): No impact on required fields (`prompt` only). Lyrics are auto-generated if `instrumental` is `false`.",
          "required": true
        },
        {
          "name": "model",
          "type": "enum",
          "default": "",
          "title": "Model",
          "description": "The AI model version to use for generation. - Required for all requests. - Available options: - **`V5_5`**：Custom Models Tailored to Your Unique Taste. - **`V5`**: Superior musical expression, faster generation. - **`V4_5PLUS`**: V4.5+ delivers richer sound, new ways to create, max 8 min. - **`V4_5`**: V4.5 enables smarter prompts, faster generations, max 8 min. - **`V4_5ALL`**: V4.5ALL enables smarter prompts, faster generations, max 8 min. - **`V4`**: V4 improves vocal quality, max 4 min.",
          "required": true,
          "values": [
            "V4",
            "V4_5",
            "V4_5PLUS",
            "V4_5ALL",
            "V5",
            "V5_5"
          ]
        },
        {
          "name": "negativeTags",
          "type": "str",
          "default": "",
          "title": "Negative Tags",
          "description": "Music styles or traits to exclude from the generated audio. - Optional. Use to avoid specific styles. Example: \"Heavy Metal, Upbeat Drums\"",
          "required": false
        },
        {
          "name": "vocalGender",
          "type": "enum",
          "default": "",
          "title": "Vocal Gender",
          "description": "Vocal gender preference for the singing voice. Optional. Use 'm' for male and 'f' for female. Note: This parameter is only effective when customMode is true. Based on practice, this parameter can only increase the probability but cannot guarantee adherence to male/female voice instructions.",
          "required": false,
          "values": [
            "m",
            "f"
          ]
        },
        {
          "name": "styleWeight",
          "type": "float",
          "default": 0,
          "title": "Style Weight",
          "description": "Strength of adherence to the specified style. Optional. Range 0–1, up to 2 decimal places.",
          "required": false,
          "min": 0,
          "max": 1
        },
        {
          "name": "weirdnessConstraint",
          "type": "float",
          "default": 0,
          "title": "Weirdness Constraint",
          "description": "Controls experimental/creative deviation. Optional. Range 0–1, up to 2 decimal places.",
          "required": false,
          "min": 0,
          "max": 1
        },
        {
          "name": "audioWeight",
          "type": "float",
          "default": 0,
          "title": "Audio Weight",
          "description": "Balance weight for audio features vs. other factors. Optional. Range 0–1, up to 2 decimal places.",
          "required": false,
          "min": 0,
          "max": 1
        },
        {
          "name": "personaId",
          "type": "str",
          "default": "",
          "title": "Persona Id",
          "description": "Only available when Custom Mode (`customMode: true`) is enabled. Persona ID to apply to the generated music. Optional. Use this to apply a specific persona style to your music generation. To generate a persona ID, use the [Generate Persona](https://docs.kie.ai/suno-api/generate-persona) endpoint to create a personalized music Persona based on generated music.",
          "required": false
        }
      ],
      "uploads": [
        {
          "field": "uploadUrl",
          "kind": "audio",
          "paramName": "uploadUrl"
        }
      ],
      "validation": [
        {
          "field": "prompt",
          "rule": "not_empty",
          "message": "Prompt is required"
        },
        {
          "field": "model",
          "rule": "not_empty",
          "message": "Model is required"
        }
      ]
    },
    {
      "className": "UploadAndExtendAudio",
      "modelId": "upload-and-extend-audio",
      "title": "Upload And Extend Audio",
      "description": "Upload And Extend Audio via Kie.ai.\n\n    kie, audio, ai\n\n    > This API extends audio tracks while preserving their original style. It includes Suno's upload functionality, allowing users to upload audio files for processing. The expected result is a longer track that seamlessly continues the input style.",
      "outputType": "audio",
      "useSuno": true,
      "sunoEndpoint": "/api/v1/generate/upload-extend",
      "fields": [
        {
          "name": "uploadUrl",
          "type": "audio",
          "default": {
            "type": "audio",
            "uri": "",
            "asset_id": null,
            "data": null,
            "metadata": null
          },
          "title": "Upload Url",
          "description": "The URL for uploading audio files, required regardless of whether defaultParamFlag is true or false. Ensure the uploaded audio does not exceed 8 minutes in length.",
          "required": true
        },
        {
          "name": "defaultParamFlag",
          "type": "bool",
          "default": false,
          "title": "Default Param Flag",
          "description": "Enable custom mode for advanced audio generation settings. - Set to `true` to use custom parameter mode (requires `style`, `title`, and `uploadUrl`; if `instrumental` is `false`, `uploadUrl` and `prompt` are required). If `instrumental` is `false`, the prompt will be strictly used as lyrics. - Set to `false` to use non-custom mode (only `uploadUrl` required). Lyrics will be automatically generated based on the prompt.",
          "required": true
        },
        {
          "name": "instrumental",
          "type": "bool",
          "default": false,
          "title": "Instrumental",
          "description": "Determines whether the audio is instrumental (without lyrics). - In custom parameter mode (`customMode: true`): - If `true`: only `style`, `title`, and `uploadUrl` are required. - If `false`: `style`, `title`, `prompt` (`prompt` will be used as exact lyrics), and `uploadUrl` are required. - In non-custom parameter mode (`defaultParamFlag: false`): does not affect required fields (only `uploadUrl` needed). If `false`, lyrics will be automatically generated.",
          "required": true
        },
        {
          "name": "prompt",
          "type": "str",
          "default": "",
          "title": "Prompt",
          "description": "Description of how the music should be extended. Required when defaultParamFlag is true. Character limits by model: - **V5_5 & V5**: Maximum 5000 characters - **V4_5PLUS & V4_5**: Maximum 5000 characters - **V4_5ALL**: Maximum 5000 characters - **V4**: Maximum 3000 characters",
          "required": false
        },
        {
          "name": "style",
          "type": "str",
          "default": "",
          "title": "Style",
          "description": "Music style, e.g., Jazz, Classical, Electronic. Character limits by model: - **V5_5 & V5**: Maximum 1000 characters - **V4_5PLUS & V4_5**: Maximum 1000 characters - **V4_5ALL**: Maximum 1000 characters - **V4**: Maximum 200 characters",
          "required": false
        },
        {
          "name": "title",
          "type": "str",
          "default": "",
          "title": "Title",
          "description": "Music title. Character limits by model: - **V5_5 & V5**: Maximum 100 characters - **V4_5PLUS & V4_5**: Maximum 100 characters - **V4_5ALL**: Maximum 80 characters - **V4**: Maximum 80 characters",
          "required": false
        },
        {
          "name": "continueAt",
          "type": "float",
          "default": 0,
          "title": "Continue At",
          "description": "The time point (in seconds) from which to start extending the music. - Required when `defaultParamFlag` is `true`. - Value range: greater than 0 and less than the total duration of the uploaded audio. - Specifies the position in the original track where the extension should begin.",
          "required": true
        },
        {
          "name": "model",
          "type": "enum",
          "default": "",
          "title": "Model",
          "description": "The AI model version to use for generation. - Required for all requests. - Available options: - **`V5_5`**：Custom Models Tailored to Your Unique Taste. - **`V5`**: Superior musical expression, faster generation. - **`V4_5PLUS`**: V4.5+ delivers richer sound, new ways to create, max 8 min. - **`V4_5`**: V4.5 enables smarter prompts, faster generations, max 8 min. - **`V4_5ALL`**: V4.5ALL enables smarter prompts, faster generations, max 8 min. - **`V4`**: V4 improves vocal quality, max 4 min.",
          "required": true,
          "values": [
            "V4",
            "V4_5",
            "V4_5PLUS",
            "V4_5ALL",
            "V5",
            "V5_5"
          ]
        },
        {
          "name": "negativeTags",
          "type": "str",
          "default": "",
          "title": "Negative Tags",
          "description": "Music styles to exclude from generation",
          "required": false
        },
        {
          "name": "vocalGender",
          "type": "enum",
          "default": "",
          "title": "Vocal Gender",
          "description": "Vocal gender preference for the singing voice. Optional. Use 'm' for male and 'f' for female. Based on practice, this parameter can only increase the probability but cannot guarantee adherence to male/female voice instructions.",
          "required": false,
          "values": [
            "m",
            "f"
          ]
        },
        {
          "name": "styleWeight",
          "type": "float",
          "default": 0,
          "title": "Style Weight",
          "description": "Strength of adherence to the specified style. Optional. Range 0–1, up to 2 decimal places.",
          "required": false,
          "min": 0,
          "max": 1
        },
        {
          "name": "weirdnessConstraint",
          "type": "float",
          "default": 0,
          "title": "Weirdness Constraint",
          "description": "Controls experimental/creative deviation. Optional. Range 0–1, up to 2 decimal places.",
          "required": false,
          "min": 0,
          "max": 1
        },
        {
          "name": "audioWeight",
          "type": "float",
          "default": 0,
          "title": "Audio Weight",
          "description": "Balance weight for audio features vs. other factors. Optional. Range 0–1, up to 2 decimal places.",
          "required": false,
          "min": 0,
          "max": 1
        },
        {
          "name": "personaId",
          "type": "str",
          "default": "",
          "title": "Persona Id",
          "description": "Only available when Custom Mode (`defaultParamFlag: true`) is enabled. Persona ID to apply to the generated music. Optional. Use this to apply a specific persona style to your music generation. To generate a persona ID, use the [Generate Persona](https://docs.kie.ai/suno-api/generate-persona) endpoint to create a personalized music Persona based on generated music.",
          "required": false
        }
      ],
      "uploads": [
        {
          "field": "uploadUrl",
          "kind": "audio",
          "paramName": "uploadUrl"
        }
      ],
      "validation": [
        {
          "field": "model",
          "rule": "not_empty",
          "message": "Model is required"
        }
      ]
    },
    {
      "className": "AddInstrumental",
      "modelId": "add-instrumental",
      "title": "Add Instrumental to Music",
      "description": "Add Instrumental to Music via Kie.ai.\n\n    kie, audio, ai\n\n    Generate instrumental accompaniment based on uploaded audio files. This interface allows you to upload audio files and add instrumental tracks to them.",
      "outputType": "audio",
      "useSuno": true,
      "sunoEndpoint": "/api/v1/generate/add-instrumental",
      "fields": [
        {
          "name": "uploadUrl",
          "type": "audio",
          "default": {
            "type": "audio",
            "uri": "",
            "asset_id": null,
            "data": null,
            "metadata": null
          },
          "title": "Upload Url",
          "description": "URL of the uploaded audio file. Specifies the source audio file location for adding accompaniment.",
          "required": true
        },
        {
          "name": "model",
          "type": "enum",
          "default": "V4_5PLUS",
          "title": "Model",
          "description": "The AI model version to use for generation. - Available options: - **`V5_5`**：Custom Models Tailored to Your Unique Taste. - **`V5`**: Superior musical expression, faster generation. - **`V4_5PLUS`**: V4.5+ is richer sound, new ways to create.",
          "required": false,
          "values": [
            "V4_5PLUS",
            "V5",
            "V5_5"
          ]
        },
        {
          "name": "title",
          "type": "str",
          "default": "",
          "title": "Title",
          "description": "Title of the generated music. Will be displayed in the player interface and file name.",
          "required": true
        },
        {
          "name": "negativeTags",
          "type": "str",
          "default": "",
          "title": "Negative Tags",
          "description": "Music styles or characteristics to exclude from the generated audio. Used to avoid specific unwanted music elements.",
          "required": true
        },
        {
          "name": "tags",
          "type": "str",
          "default": "",
          "title": "Tags",
          "description": "Music styles or tags to include in the generated music. Defines the desired music style and characteristics.",
          "required": true
        },
        {
          "name": "vocalGender",
          "type": "enum",
          "default": "",
          "title": "Vocal Gender",
          "description": "Vocal gender preference. Optional. 'm' for male, 'f' for female. Based on practice, this parameter can only increase the probability but cannot guarantee adherence to male/female voice instructions.",
          "required": false,
          "values": [
            "m",
            "f"
          ]
        },
        {
          "name": "styleWeight",
          "type": "float",
          "default": 0,
          "title": "Style Weight",
          "description": "Adherence strength to specified style. Optional. Range 0–1, up to 2 decimal places.",
          "required": false,
          "min": 0,
          "max": 1
        },
        {
          "name": "weirdnessConstraint",
          "type": "float",
          "default": 0,
          "title": "Weirdness Constraint",
          "description": "Controls experimental/creative deviation level. Optional. Range 0–1, up to 2 decimal places.",
          "required": false,
          "min": 0,
          "max": 1
        },
        {
          "name": "audioWeight",
          "type": "float",
          "default": 0,
          "title": "Audio Weight",
          "description": "Relative weight of audio elements. Optional. Range 0–1, up to 2 decimal places.",
          "required": false,
          "min": 0,
          "max": 1
        }
      ],
      "uploads": [
        {
          "field": "uploadUrl",
          "kind": "audio",
          "paramName": "uploadUrl"
        }
      ],
      "validation": [
        {
          "field": "title",
          "rule": "not_empty",
          "message": "Title is required"
        },
        {
          "field": "negativeTags",
          "rule": "not_empty",
          "message": "Negative Tags is required"
        },
        {
          "field": "tags",
          "rule": "not_empty",
          "message": "Tags is required"
        }
      ]
    },
    {
      "className": "AddVocals",
      "modelId": "add-vocals",
      "title": "Add Vocals to Music",
      "description": "Add Vocals to Music via Kie.ai.\n\n    kie, audio, ai\n\n    Generate music with vocals based on uploaded audio files. This interface allows you to upload audio files and add vocal singing to them.",
      "outputType": "audio",
      "useSuno": true,
      "sunoEndpoint": "/api/v1/generate/add-vocals",
      "fields": [
        {
          "name": "prompt",
          "type": "str",
          "default": "",
          "title": "Prompt",
          "description": "Prompt for generating audio. Usually text describing audio content, used to guide vocal singing content and style.",
          "required": true
        },
        {
          "name": "model",
          "type": "enum",
          "default": "V4_5PLUS",
          "title": "Model",
          "description": "The AI model version to use for generation. - Available options: - **`V5_5`**：Custom Models Tailored to Your Unique Taste. - **`V5`**: Superior musical expression, faster generation. - **`V4_5PLUS`**: V4.5+ is richer sound, new ways to create.",
          "required": false,
          "values": [
            "V4_5PLUS",
            "V5",
            "V5_5"
          ]
        },
        {
          "name": "title",
          "type": "str",
          "default": "",
          "title": "Title",
          "description": "Music title. Will be displayed in the player interface and file name.",
          "required": true
        },
        {
          "name": "negativeTags",
          "type": "str",
          "default": "",
          "title": "Negative Tags",
          "description": "Excluded music styles. Used to avoid including specific styles or elements in the generated music.",
          "required": true
        },
        {
          "name": "style",
          "type": "str",
          "default": "",
          "title": "Style",
          "description": "Music style. Such as jazz, electronic, classical and other music types.",
          "required": true
        },
        {
          "name": "vocalGender",
          "type": "enum",
          "default": "",
          "title": "Vocal Gender",
          "description": "Vocal gender preference. Optional. 'm' for male, 'f' for female. Based on practice, this parameter can only increase the probability but cannot guarantee adherence to male/female voice instructions.",
          "required": false,
          "values": [
            "m",
            "f"
          ]
        },
        {
          "name": "styleWeight",
          "type": "float",
          "default": 0,
          "title": "Style Weight",
          "description": "Adherence strength to specified style. Optional. Range 0–1, up to 2 decimal places.",
          "required": false,
          "min": 0,
          "max": 1
        },
        {
          "name": "weirdnessConstraint",
          "type": "float",
          "default": 0,
          "title": "Weirdness Constraint",
          "description": "Controls experimental/creative deviation level. Optional. Range 0–1, up to 2 decimal places.",
          "required": false,
          "min": 0,
          "max": 1
        },
        {
          "name": "audioWeight",
          "type": "float",
          "default": 0,
          "title": "Audio Weight",
          "description": "Relative weight of audio elements. Optional. Range 0–1, up to 2 decimal places.",
          "required": false,
          "min": 0,
          "max": 1
        },
        {
          "name": "uploadUrl",
          "type": "audio",
          "default": {
            "type": "audio",
            "uri": "",
            "asset_id": null,
            "data": null,
            "metadata": null
          },
          "title": "Upload Url",
          "description": "URL of the uploaded audio file. Specifies the source audio file location for adding vocals.",
          "required": true
        }
      ],
      "uploads": [
        {
          "field": "uploadUrl",
          "kind": "audio",
          "paramName": "uploadUrl"
        }
      ],
      "validation": [
        {
          "field": "prompt",
          "rule": "not_empty",
          "message": "Prompt is required"
        },
        {
          "field": "title",
          "rule": "not_empty",
          "message": "Title is required"
        },
        {
          "field": "negativeTags",
          "rule": "not_empty",
          "message": "Negative Tags is required"
        },
        {
          "field": "style",
          "rule": "not_empty",
          "message": "Style is required"
        }
      ]
    },
    {
      "className": "GetTimestampedLyrics",
      "modelId": "get-timestamped-lyrics",
      "title": "Get Timestamped Lyrics",
      "description": "Get Timestamped Lyrics via Kie.ai.\n\n    kie, audio, ai\n\n    Retrieve synchronized lyrics with precise timestamps for music tracks.",
      "outputType": "audio",
      "useSuno": true,
      "sunoEndpoint": "/api/v1/generate/get-timestamped-lyrics",
      "fields": [
        {
          "name": "taskId",
          "type": "str",
          "default": "",
          "title": "Task Id",
          "description": "Unique identifier of the music generation task. This should be a taskId returned from either the \"Generate Music\" or \"Extend Music\" endpoints.",
          "required": true
        },
        {
          "name": "audioId",
          "type": "str",
          "default": "",
          "title": "Audio Id",
          "description": "Unique identifier of the specific audio track for which to retrieve lyrics. This ID is returned in the callback data after music generation completes.",
          "required": true
        }
      ],
      "validation": [
        {
          "field": "taskId",
          "rule": "not_empty",
          "message": "Task Id is required"
        },
        {
          "field": "audioId",
          "rule": "not_empty",
          "message": "Audio Id is required"
        }
      ]
    },
    {
      "className": "BoostMusicStyle",
      "modelId": "boost-music-style",
      "title": "Boost Music Style",
      "description": "Boost Music Style via Kie.ai.\n\n    kie, audio, ai\n\n    Boost Music Style",
      "outputType": "audio",
      "useSuno": true,
      "sunoEndpoint": "/api/v1/style/generate",
      "fields": [
        {
          "name": "content",
          "type": "str",
          "default": "",
          "title": "Content",
          "description": "Style description. Please describe in concise and clear language the music style you expect to generate. Example: 'Pop, Mysterious'",
          "required": true
        }
      ],
      "validation": [
        {
          "field": "content",
          "rule": "not_empty",
          "message": "Content is required"
        }
      ]
    },
    {
      "className": "GenerateCover",
      "modelId": "generate-cover",
      "title": "Generate Music Cover",
      "description": "Generate Music Cover via Kie.ai.\n\n    kie, audio, ai\n\n    Generate personalized cover images based on original music tasks.",
      "outputType": "audio",
      "useSuno": true,
      "sunoEndpoint": "/api/v1/suno/cover/generate",
      "fields": [
        {
          "name": "taskId",
          "type": "str",
          "default": "",
          "title": "Task Id",
          "description": "Original music task ID, should be the taskId returned by the music generation interface.",
          "required": true
        }
      ],
      "validation": [
        {
          "field": "taskId",
          "rule": "not_empty",
          "message": "Task Id is required"
        }
      ]
    },
    {
      "className": "ReplaceSection",
      "modelId": "replace-section",
      "title": "Replace Music Section",
      "description": "Replace Music Section via Kie.ai.\n\n    kie, audio, ai\n\n    > Replace a specific time segment within existing music.",
      "outputType": "audio",
      "useSuno": true,
      "sunoEndpoint": "/api/v1/generate/replace-section",
      "fields": [
        {
          "name": "taskId",
          "type": "str",
          "default": "",
          "title": "Task Id",
          "description": "Original task ID (parent task), used to identify the source music for section replacement",
          "required": true
        },
        {
          "name": "audioId",
          "type": "str",
          "default": "",
          "title": "Audio Id",
          "description": "Unique identifier of the audio track to replace. This ID is returned in the callback data after music generation completes.",
          "required": true
        },
        {
          "name": "prompt",
          "type": "str",
          "default": "",
          "title": "Prompt",
          "description": "Replaced lyrics",
          "required": true
        },
        {
          "name": "tags",
          "type": "str",
          "default": "",
          "title": "Tags",
          "description": "Music style tags, such as jazz, electronic, etc.",
          "required": true
        },
        {
          "name": "title",
          "type": "str",
          "default": "",
          "title": "Title",
          "description": "Music title",
          "required": true
        },
        {
          "name": "negativeTags",
          "type": "str",
          "default": "",
          "title": "Negative Tags",
          "description": "Excluded music styles, used to avoid specific style elements in the replacement segment",
          "required": false
        },
        {
          "name": "infillStartS",
          "type": "float",
          "default": 0,
          "title": "Infill Start S",
          "description": "Start time point for replacement (seconds), 2 decimal places. Must be less than infillEndS. The time interval (infillEndS - infillStartS) must be between 6 and 60 seconds.",
          "required": true,
          "min": 0
        },
        {
          "name": "infillEndS",
          "type": "float",
          "default": 0,
          "title": "Infill End S",
          "description": "End time point for replacement (seconds), 2 decimal places. Must be greater than infillStartS. The time interval (infillEndS - infillStartS) must be between 6 and 60 seconds.",
          "required": true,
          "min": 0
        },
        {
          "name": "fullLyrics",
          "type": "str",
          "default": "",
          "title": "Full Lyrics",
          "description": "Complete lyrics after modification, combining both modified and unmodified lyrics. This parameter contains the full lyrics text that will be used for the entire song after the section replacement.",
          "required": true
        }
      ],
      "validation": [
        {
          "field": "taskId",
          "rule": "not_empty",
          "message": "Task Id is required"
        },
        {
          "field": "audioId",
          "rule": "not_empty",
          "message": "Audio Id is required"
        },
        {
          "field": "prompt",
          "rule": "not_empty",
          "message": "Prompt is required"
        },
        {
          "field": "tags",
          "rule": "not_empty",
          "message": "Tags is required"
        },
        {
          "field": "title",
          "rule": "not_empty",
          "message": "Title is required"
        },
        {
          "field": "fullLyrics",
          "rule": "not_empty",
          "message": "Full Lyrics is required"
        }
      ]
    },
    {
      "className": "GenerateMashup",
      "modelId": "generate-mashup",
      "title": "Generate Mashup Music",
      "description": "Generate Mashup Music via Kie.ai.\n\n    kie, audio, ai\n\n    > Create remix music using AI models by combining multiple audio tracks.",
      "outputType": "audio",
      "useSuno": true,
      "sunoEndpoint": "/api/v1/generate/mashup",
      "fields": [
        {
          "name": "uploadUrlList",
          "type": "list[audio]",
          "default": [],
          "title": "Upload Url List",
          "description": "Array of audio file URLs to mashup. Must contain exactly 2 URLs. Each URL must be publicly accessible.",
          "required": true
        },
        {
          "name": "prompt",
          "type": "str",
          "default": "",
          "title": "Prompt",
          "description": "A description of the desired audio content. - In Custom Mode (`customMode: true`): Required if `instrumental` is `false`. The prompt will be strictly used as the lyrics and sung in the generated track. Character limits by model: - **V4**: Maximum 3000 characters - **V4_5 & V4_5PLUS**: Maximum 5000 characters - **V4_5ALL**: Maximum 5000 characters - **V5 & V5_5**: Maximum 5000 characters Example: \"A calm and relaxing piano track with soft melodies\" - In Non-custom Mode (`customMode: false`): Always required. The prompt serves as the core idea, and lyrics will be automatically generated based on it (not strictly matching the input). Maximum 500 characters. Example: \"A short relaxing piano tune\"",
          "required": false
        },
        {
          "name": "style",
          "type": "str",
          "default": "",
          "title": "Style",
          "description": "Music style specification for the generated audio. - Only available and required in Custom Mode (`customMode: true`). Defines the genre, mood, or artistic direction. - Character limits by model: - **V4**: Maximum 200 characters - **V4_5 & V4_5PLUS**: Maximum 1000 characters - **V4_5ALL**: Maximum 1000 characters - **V5 & V5_5**: Maximum 1000 characters - Common examples: Jazz, Classical, Electronic, Pop, Rock, Hip-hop, etc.",
          "required": true
        },
        {
          "name": "title",
          "type": "str",
          "default": "",
          "title": "Title",
          "description": "Title for the generated music track. - Only available and required in Custom Mode (`customMode: true`). - Max length: 80 characters. - Will be displayed in player interfaces and filenames.",
          "required": true
        },
        {
          "name": "customMode",
          "type": "bool",
          "default": false,
          "title": "Custom Mode",
          "description": "Determines if advanced parameter customization is enabled. - If `true`: Allows detailed control with specific requirements for `style` and `title` fields. - If `false`: Simplified mode where only `prompt` is required and other parameters are ignored.",
          "required": true
        },
        {
          "name": "instrumental",
          "type": "bool",
          "default": false,
          "title": "Instrumental",
          "description": "Determines if the audio should be instrumental (no lyrics). - In Custom Mode (`customMode: true`): - If `true`: Only `style` and `title` are required. - If `false`: `style`, `title`, and `prompt` are required (with prompt used as the exact lyrics). - In Non-custom Mode (`customMode: false`): No impact on required fields (prompt only).",
          "required": false
        },
        {
          "name": "model",
          "type": "enum",
          "default": "",
          "title": "Model",
          "description": "The AI model version to use for generation. - Required for all requests. - Available options: - **`V5_5`**: Custom Models Tailored to Your Unique Taste. - **`V5`**: Superior musical expression, faster generation. - **`V4_5PLUS`**: V4.5+ delivers richer sound, new ways to create, max 8 min. - **`V4_5`**: V4.5 enables smarter prompts, faster generations, max 8 min. - **`V4_5ALL`**: V4.5ALL enables smarter prompts, faster generations, max 8 min. - **`V4`**: V4 improves vocal quality, max 4 min.",
          "required": true,
          "values": [
            "V4",
            "V4_5",
            "V4_5PLUS",
            "V4_5ALL",
            "V5",
            "V5_5"
          ]
        },
        {
          "name": "vocalGender",
          "type": "enum",
          "default": "",
          "title": "Vocal Gender",
          "description": "Vocal gender preference for the singing voice. - Only available in Custom Mode (`customMode: true`). Optional. Use 'm' for male and 'f' for female. Based on practice, this parameter can only increase the probability but cannot guarantee adherence to male/female voice instructions.",
          "required": false,
          "values": [
            "m",
            "f"
          ]
        },
        {
          "name": "styleWeight",
          "type": "float",
          "default": 0,
          "title": "Style Weight",
          "description": "Strength of adherence to the specified style. - Only available in Custom Mode (`customMode: true`). Optional. Range 0–1, up to 2 decimal places.",
          "required": false,
          "min": 0,
          "max": 1
        },
        {
          "name": "weirdnessConstraint",
          "type": "float",
          "default": 0,
          "title": "Weirdness Constraint",
          "description": "Controls experimental/creative deviation. - Only available in Custom Mode (`customMode: true`). Optional. Range 0–1, up to 2 decimal places.",
          "required": false,
          "min": 0,
          "max": 1
        },
        {
          "name": "audioWeight",
          "type": "float",
          "default": 0,
          "title": "Audio Weight",
          "description": "Balance weight for audio features vs. other factors. - Only available in Custom Mode (`customMode: true`). Optional. Range 0–1, up to 2 decimal places.",
          "required": false,
          "min": 0,
          "max": 1
        }
      ],
      "uploads": [
        {
          "field": "uploadUrlList",
          "kind": "audio",
          "isList": true,
          "paramName": "uploadUrlList"
        }
      ],
      "validation": [
        {
          "field": "style",
          "rule": "not_empty",
          "message": "Style is required"
        },
        {
          "field": "title",
          "rule": "not_empty",
          "message": "Title is required"
        },
        {
          "field": "model",
          "rule": "not_empty",
          "message": "Model is required"
        }
      ]
    },
    {
      "className": "GenerateLyrics",
      "modelId": "generate-lyrics",
      "title": "Generate Lyrics",
      "description": "Generate Lyrics via Kie.ai.\n\n    kie, audio, ai\n\n    Generate creative lyrics content based on a text prompt.",
      "outputType": "audio",
      "useSuno": true,
      "sunoEndpoint": "/api/v1/lyrics",
      "fields": [
        {
          "name": "prompt",
          "type": "str",
          "default": "",
          "title": "Prompt",
          "description": "Description of the desired lyrics content. Be specific about theme, mood, style, or story elements you want in the lyrics. More detailed prompts yield better results. The maximum word limit is 200 characters.",
          "required": true
        }
      ],
      "validation": [
        {
          "field": "prompt",
          "rule": "not_empty",
          "message": "Prompt is required"
        }
      ]
    },
    {
      "className": "ConvertToWav",
      "modelId": "convert-to-wav",
      "title": "Convert to WAV Format",
      "description": "Convert to WAV Format via Kie.ai.\n\n    kie, audio, ai\n\n    Convert an existing music track to high-quality WAV format.",
      "outputType": "audio",
      "useSuno": true,
      "sunoEndpoint": "/api/v1/wav/generate",
      "fields": [
        {
          "name": "taskId",
          "type": "str",
          "default": "",
          "title": "Task Id",
          "description": "Unique identifier of the music generation task. This should be a taskId returned from either the \"Generate Music\" or \"Extend Music\" endpoints.",
          "required": true
        },
        {
          "name": "audioId",
          "type": "str",
          "default": "",
          "title": "Audio Id",
          "description": "Unique identifier of the specific audio track to convert. This ID is returned in the callback data after music generation completes.",
          "required": true
        }
      ],
      "validation": [
        {
          "field": "taskId",
          "rule": "not_empty",
          "message": "Task Id is required"
        },
        {
          "field": "audioId",
          "rule": "not_empty",
          "message": "Audio Id is required"
        }
      ]
    },
    {
      "className": "SeparateVocals",
      "modelId": "separate-vocals",
      "title": "Vocal & Instrument Stem Separation",
      "description": "Vocal & Instrument Stem Separation via Kie.ai.\n\n    kie, audio, ai\n\n    Separate music into vocal, instrumental, and individual instrument tracks using advanced audio processing technology.",
      "outputType": "audio",
      "useSuno": true,
      "sunoEndpoint": "/api/v1/vocal-removal/generate",
      "fields": [
        {
          "name": "taskId",
          "type": "str",
          "default": "",
          "title": "Task Id",
          "description": "Unique identifier of the music generation task. This should be a taskId returned from either the \"Generate Music\" or \"Extend Music\" endpoints.",
          "required": true
        },
        {
          "name": "audioId",
          "type": "str",
          "default": "",
          "title": "Audio Id",
          "description": "Unique identifier of the specific audio track to process for vocal separation. This ID is returned in the callback data after music generation completes.",
          "required": true
        },
        {
          "name": "type",
          "type": "enum",
          "default": "separate_vocal",
          "title": "Type",
          "description": "Separation type with the following options: - **separate_vocal**: Separate vocals and accompaniment, generating vocal and instrumental tracks - **split_stem**: Separate various instrument sounds, generating vocals, backing vocals, drums, bass, guitar, keyboard, strings, brass, woodwinds, percussion, synthesizer, effects, and other tracks",
          "required": false,
          "values": [
            "separate_vocal",
            "split_stem"
          ]
        }
      ],
      "validation": [
        {
          "field": "taskId",
          "rule": "not_empty",
          "message": "Task Id is required"
        },
        {
          "field": "audioId",
          "rule": "not_empty",
          "message": "Audio Id is required"
        }
      ]
    },
    {
      "className": "GenerateMidi",
      "modelId": "generate-midi",
      "title": "Generate MIDI from Audio",
      "description": "Generate MIDI from Audio via Kie.ai.\n\n    kie, audio, ai\n\n    > Convert separated audio tracks into MIDI format with detailed note information for each instrument.",
      "outputType": "audio",
      "useSuno": true,
      "sunoEndpoint": "/api/v1/midi/generate",
      "fields": [
        {
          "name": "taskId",
          "type": "str",
          "default": "",
          "title": "Task Id",
          "description": "Task ID from a completed vocal separation. This should be the taskId returned from the Vocal & Instrument Stem Separation endpoint.",
          "required": true
        },
        {
          "name": "audioId",
          "type": "str",
          "default": "",
          "title": "Audio Id",
          "description": "Optional. Specifies which separated audio track to generate MIDI from. This audioId can be obtained from the `originData` array in the Get Vocal Separation Details endpoint response. Each item in `originData` contains an `id` field that can be used here. If not provided, MIDI will be generated from all separated tracks.",
          "required": false
        }
      ],
      "validation": [
        {
          "field": "taskId",
          "rule": "not_empty",
          "message": "Task Id is required"
        }
      ]
    },
    {
      "className": "CreateMusicVideo",
      "modelId": "create-music-video",
      "title": "Create Music Video",
      "description": "Create Music Video via Kie.ai.\n\n    kie, audio, ai\n\n    Create a video with visualizations based on your generated music track.",
      "outputType": "audio",
      "useSuno": true,
      "sunoEndpoint": "/api/v1/mp4/generate",
      "fields": [
        {
          "name": "taskId",
          "type": "str",
          "default": "",
          "title": "Task Id",
          "description": "Unique identifier of the music generation task. This should be a taskId returned from either the \"Generate Music\" or \"Extend Music\" endpoints.",
          "required": true
        },
        {
          "name": "audioId",
          "type": "str",
          "default": "",
          "title": "Audio Id",
          "description": "Unique identifier of the specific audio track to visualize. This ID is returned in the callback data after music generation completes.",
          "required": true
        },
        {
          "name": "author",
          "type": "str",
          "default": "",
          "title": "Author",
          "description": "Artist or creator name to display as a signature on the video cover. Maximum 50 characters. This creates attribution for the music creator.",
          "required": false
        },
        {
          "name": "domainName",
          "type": "str",
          "default": "",
          "title": "Domain Name",
          "description": "Website or brand to display as a watermark at the bottom of the video. Maximum 50 characters. Useful for promotional branding or attribution.",
          "required": false
        }
      ],
      "validation": [
        {
          "field": "taskId",
          "rule": "not_empty",
          "message": "Task Id is required"
        },
        {
          "field": "audioId",
          "rule": "not_empty",
          "message": "Audio Id is required"
        }
      ]
    },
    {
      "className": "GenerateSounds",
      "modelId": "generate-sounds",
      "title": "Generate sounds",
      "description": "Generate sounds via Kie.ai.\n\n    kie, audio, ai\n\n    Used for creating a sound generation task (Sounds Task). It supports settings for looping, tempo (BPM), pitch (Key), as well as lyrics subtitle capture, etc.",
      "outputType": "audio",
      "useSuno": true,
      "sunoEndpoint": "/api/v1/generate/sounds",
      "fields": [
        {
          "name": "prompt",
          "type": "str",
          "default": "",
          "title": "Prompt",
          "description": "Sound task type limit: 500 characters",
          "required": true
        },
        {
          "name": "model",
          "type": "enum",
          "default": "",
          "title": "Model",
          "description": "Model Name",
          "required": true,
          "values": [
            "V5",
            "V5_5"
          ]
        },
        {
          "name": "soundLoop",
          "type": "bool",
          "default": false,
          "title": "Sound Loop",
          "description": "Is it a cycle?",
          "required": false
        },
        {
          "name": "soundTempo",
          "type": "int",
          "default": null,
          "title": "Sound Tempo",
          "description": "Do not broadcast.",
          "required": false,
          "min": 1,
          "max": 300
        },
        {
          "name": "soundKey",
          "type": "enum",
          "default": "Any",
          "title": "Sound Key",
          "description": "",
          "required": false,
          "values": [
            "Cm",
            "C#m",
            "Dm",
            "D#m",
            "Em",
            "Fm",
            "F#m",
            "Gm",
            "G#m",
            "Am",
            "A#m",
            "Bm",
            "C",
            "C#",
            "D",
            "D#",
            "E",
            "F",
            "F#",
            "G",
            "G#",
            "A",
            "A#",
            "B"
          ]
        },
        {
          "name": "grabLyrics",
          "type": "bool",
          "default": false,
          "title": "Grab Lyrics",
          "description": "Whether to capture the lyrics subtitles Will the interface be called after completion to obtain the lyrics subtitles?",
          "required": false
        }
      ],
      "validation": [
        {
          "field": "prompt",
          "rule": "not_empty",
          "message": "Prompt is required"
        },
        {
          "field": "model",
          "rule": "not_empty",
          "message": "Model is required"
        }
      ]
    }
  ]
};
