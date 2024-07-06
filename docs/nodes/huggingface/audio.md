# nodetool.nodes.huggingface.audio

## AutomaticSpeechRecognition

Transcribes spoken audio to text.

Use cases:
- Transcribe interviews or meetings
- Create subtitles for videos
- Implement voice commands in applications

**Tags:** asr, speech-to-text, audio, huggingface

- **model**: The model ID to use for the speech recognition (`ModelId`)
- **audio**: The input audio to transcribe (`AudioRef`)

## TextToAudio

Generates audio (music or sound effects) from text descriptions.

Use cases:
- Create custom background music for videos or games
- Generate sound effects based on textual descriptions
- Prototype musical ideas quickly

**Tags:** audio, music, generation, huggingface

- **model**: The model ID to use for the audio generation (`ModelId`)
- **inputs**: The input text to the model (`str`)

## TextToSpeech

Generates natural-sounding speech from text input.

Use cases:
- Create voice content for apps and websites
- Develop voice assistants with natural-sounding speech
- Generate automated announcements for public spaces

**Tags:** tts, audio, speech, huggingface

- **model**: The model ID to use for the image generation (`ModelId`)
- **inputs**: The input text to the model (`str`)

