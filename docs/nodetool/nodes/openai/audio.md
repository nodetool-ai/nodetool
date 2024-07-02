# nodetool.nodes.openai.audio

## TextToSpeech

Converts text into spoken voice using OpenAI TTS models.
Returns an audio file from the provided text.

**Tags:** audio, tts, t2s, text-to-speech, voiceover, speak, voice, read

**Inherits from:** BaseNode

- **model** (`TtsModel`)
- **voice** (`Voice`)
- **input** (`str`)
- **speed** (`float`)

## Transcribe

Converts spoken words in an audio file to written text.
Returns a text of the detected words from the input audio file.

**Tags:** audio, stt, s2t, speech-to-text, transcription, audio-to-text, analysis

**Inherits from:** BaseNode

- **audio**: The audio file to transcribe. (`AudioRef`)
- **temperature**: The temperature to use for the transcription. (`float`)

## Translate

Translates spoken words in an audio file to English text.
Outputs the english translation of an audio file as text.

**Tags:** audio, stt, s2t, speech-to-text, translation, english

**Inherits from:** BaseNode

- **audio**: The audio file to translate. (`AudioRef`)
- **temperature**: The temperature to use for the translation. (`float`)

