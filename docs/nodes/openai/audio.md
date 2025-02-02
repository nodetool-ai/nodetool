# nodetool.nodes.openai.audio

## SpeechToText

Converts speech to text using OpenAI's speech-to-text API.

Use cases:
- Generate accurate transcriptions of audio content
- Create searchable text from audio recordings
- Support multiple languages for transcription
- Enable automated subtitling and captioning

**Tags:** audio, transcription, speech-to-text, stt, whisper

**Fields:**
- **audio**: The audio file to transcribe (max 25 MB). (AudioRef)
- **language**: The language of the input audio (TTSLanguage)
- **timestamps**: Whether to return timestamps for the generated text. (bool)
- **prompt**: Optional text to guide the model's style or continue a previous audio segment. (str)
- **temperature**: The sampling temperature between 0 and 1. Higher values like 0.8 will make the output more random, while lower values like 0.2 will make it more focused and deterministic. (float)


## TTSLanguage

## TextToSpeech

Converts text to speech using OpenAI TTS models.

Use cases:
- Generate spoken content for videos or podcasts
- Create voice-overs for presentations
- Assist visually impaired users with text reading
- Produce audio versions of written content

**Tags:** audio, tts, text-to-speech, voice, synthesis

**Fields:**
- **model** (TtsModel)
- **voice** (Voice)
- **input** (str)
- **speed** (float)


## Transcribe

Transcribes speech from audio to text.

Use cases:
- Convert recorded meetings or lectures to text
- Generate subtitles for videos
- Create searchable archives of audio content
- Assist hearing-impaired users with audio content

**Tags:** audio, transcription, speech-to-text, stt

**Fields:**
- **audio**: The audio file to transcribe. (AudioRef)
- **temperature**: The temperature to use for the transcription. (float)


## Translate

Translates speech in audio to English text.

Use cases:
- Translate foreign language audio content to English
- Create English transcripts of multilingual recordings
- Assist non-English speakers in understanding audio content
- Enable cross-language communication in audio formats

**Tags:** audio, translation, speech-to-text, localization

**Fields:**
- **audio**: The audio file to translate. (AudioRef)
- **temperature**: The temperature to use for the translation. (float)


