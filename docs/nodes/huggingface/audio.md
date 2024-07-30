# nodetool.nodes.huggingface.audio

## AudioClassifier

Classifies audio into predefined categories.

Use cases:
- Classify music genres
- Detect speech vs. non-speech audio
- Identify environmental sounds
- Emotion recognition in speech

**Tags:** audio, classification, labeling, categorization

- **model**: The model ID to use for audio classification (AudioClassifierModelId)
- **inputs**: The input audio to classify (AudioRef)

### get_inputs

**Args:**
- **context (ProcessingContext)**

### get_model_id

**Args:**

### process_local_result

**Args:**
- **context (ProcessingContext)**
- **result (typing.Any)**

**Returns:** dict

### process_remote_result

**Args:**
- **context (ProcessingContext)**
- **result (typing.Any)**

**Returns:** dict

## AutomaticSpeechRecognition

Transcribes spoken audio to text.

Use cases:
- Transcribe interviews or meetings
- Create subtitles for videos
- Implement voice commands in applications

**Tags:** asr, speech-to-text, audio, huggingface

- **model**: The model ID to use for the speech recognition (ASRModelId)
- **inputs**: The input audio to transcribe (AudioRef)

### get_inputs

**Args:**
- **context (ProcessingContext)**

### get_model_id

**Args:**

### process_local_result

**Args:**
- **context (ProcessingContext)**
- **result (typing.Any)**

**Returns:** AudioRef

### process_remote_result

**Args:**
- **context (ProcessingContext)**
- **result (typing.Any)**

**Returns:** AudioRef

## TextToAudio

Generates audio (music or sound effects) from text descriptions.

Use cases:
- Create custom background music for videos or games
- Generate sound effects based on textual descriptions
- Prototype musical ideas quickly

**Tags:** audio, music, generation, huggingface

- **model**: The model ID to use for the audio generation (TextToAudioModelId)
- **inputs**: The input text to the model (str)

### get_model_id

**Args:**

## TextToSpeech

Generates natural-sounding speech from text input.

Use cases:
- Create voice content for apps and websites
- Develop voice assistants with natural-sounding speech
- Generate automated announcements for public spaces

**Tags:** tts, audio, speech, huggingface

- **model**: The model ID to use for the image generation (TTSModelId)
- **inputs**: The input text to the model (str)

### get_model_id

**Args:**

### process_local_result

**Args:**
- **context (ProcessingContext)**
- **result (typing.Any)**

**Returns:** AudioRef

### process_remote_result

**Args:**
- **context (ProcessingContext)**
- **result (typing.Any)**

**Returns:** AudioRef

## ZeroShotAudioClassifier

Classifies audio into categories without the need for training data.

Use cases:
- Quickly categorize audio without training data
- Identify sounds or music genres without predefined labels
- Automate audio tagging for large datasets

**Tags:** audio, classification, labeling, categorization, zero-shot

- **model**: The model ID to use for the classification (ZeroShotAudioClassifierModelId)
- **inputs**: The input audio to classify (AudioRef)
- **candidate_labels**: The candidate labels to classify the audio against, separated by commas (str)

### get_inputs

**Args:**
- **context (ProcessingContext)**

### get_model_id

**Args:**

### get_params

**Args:**

### process_local_result

**Args:**
- **context (ProcessingContext)**
- **result (typing.Any)**

**Returns:** dict

### process_remote_result

**Args:**
- **context (ProcessingContext)**
- **result (typing.Any)**

**Returns:** dict

