# nodetool.nodes.huggingface.text_to_speech

## Bark

Bark is a text-to-audio model created by Suno. Bark can generate highly realistic, multilingual speech as well as other audio - including music, background noise and simple sound effects. The model can also produce nonverbal communications like laughing, sighing and crying.

Use cases:
- Create voice content for apps and websites
- Develop voice assistants with natural-sounding speech
- Generate automated announcements for public spaces

**Tags:** tts, audio, speech, huggingface

**Fields:**
- **model**: The model ID to use for the image generation (HFTextToSpeech)
- **prompt**: The input text to the model (str)

### get_model_id

**Args:**

### initialize

**Args:**
- **context (ProcessingContext)**

### move_to_device

**Args:**
- **device (str)**


## TextToSpeech

A generic Text-to-Speech node that can work with various Hugging Face TTS models.

Use cases:
- Generate speech from text for various applications
- Create voice content for apps, websites, or virtual assistants
- Produce audio narrations for videos, presentations, or e-learning content

**Tags:** tts, audio, speech, huggingface, speak, voice

**Fields:**
- **model**: The model ID to use for text-to-speech generation (HFTextToSpeech)
- **text**: The text to convert to speech (str)

### get_model_id

**Args:**

### initialize

**Args:**
- **context (ProcessingContext)**

### move_to_device

**Args:**
- **device (str)**


