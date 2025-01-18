# nodetool.nodes.elevenlabs.text_to_speech

## LanguageID

Available languages for ElevenLabs models

## ModelID

Available ElevenLabs models

## TextNormalization

Text normalization options

## TextToSpeech

Generate natural-sounding speech using ElevenLabs' advanced text-to-speech technology. Features multiple voices and customizable parameters.

Use cases:
- Create professional voiceovers
- Generate character voices
- Produce multilingual content
- Create audiobooks
- Generate voice content

**Tags:** audio, tts, speech, synthesis, voice

**Fields:**
- **voice**: Voice ID to be used for generation (VoiceIDEnum)
- **text**: The text to convert to speech (str)
- **tts_model_id**: The TTS model to use for generation (ModelID)
- **voice_settings**: Optional voice settings to override defaults (dict)
- **language_code**: Language code to enforce (only works with Turbo v2.5) (LanguageID)
- **optimize_streaming_latency**: Latency optimization level (0-4). Higher values trade quality for speed (int)
- **seed**: Seed for deterministic generation (0-4294967295). -1 means random (int)
- **text_normalization**: Controls text normalization behavior (TextNormalization)
- **stability**: Voice stability (0-1). Higher values make output more consistent, lower values more varied (float)
- **similarity_boost**: Similarity to original voice (0-1). Higher values make output closer to original voice (float)
- **style**: Speaking style emphasis (0-1). Higher values increase style expression (float)
- **use_speaker_boost**: Whether to use speaker boost for clearer, more consistent output (bool)


## VoiceIDEnum

Available ElevenLabs voices

