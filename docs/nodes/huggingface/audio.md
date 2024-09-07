# nodetool.nodes.huggingface.audio

## AudioClassifier

Classifies audio into predefined categories.

Use cases:
- Classify music genres
- Detect speech vs. non-speech audio
- Identify environmental sounds
- Emotion recognition in speech

Recommended models
- MIT/ast-finetuned-audioset-10-10-0.4593
- ehcalabres/wav2vec2-lg-xlsr-en-speech-emotion-recognition

**Tags:** audio, classification, labeling, categorization

**Fields:**
- **model**: The model ID to use for audio classification (HFAudioClassification)
- **inputs**: The input audio to classify (AudioRef)

### get_inputs

**Args:**
- **context (ProcessingContext)**

### get_model_id

**Args:**

### get_torch_dtype

**Args:**

### process_local_result

**Args:**
- **context (ProcessingContext)**
- **result (Any)**

**Returns:** dict[str, float]

### process_remote_result

**Args:**
- **context (ProcessingContext)**
- **result (Any)**

**Returns:** dict[str, float]

### required_inputs

**Args:**


## AudioLDM

Generates audio using the AudioLDM model based on text prompts.

Use cases:
- Create custom music or sound effects from text descriptions
- Generate background audio for videos, games, or other media
- Produce audio content for creative projects
- Explore AI-generated audio for music production or sound design

**Tags:** audio, generation, AI, text-to-audio

**Fields:**
- **prompt**: A text prompt describing the desired audio. (str)
- **num_inference_steps**: Number of denoising steps. More steps generally improve quality but increase generation time. (int)
- **audio_length_in_s**: The desired duration of the generated audio in seconds. (float)
- **seed**: Seed for the random number generator. Use -1 for a random seed. (int)

### initialize

**Args:**
- **context (ProcessingContext)**

### move_to_device

**Args:**
- **device (str)**


## AudioLDM2

Generates audio using the AudioLDM2 model based on text prompts.

Use cases:
- Create custom sound effects based on textual descriptions
- Generate background audio for videos or games
- Produce audio content for multimedia projects
- Explore AI-generated audio for creative sound design

**Tags:** audio, generation, AI, text-to-audio

**Fields:**
- **prompt**: A text prompt describing the desired audio. (str)
- **negative_prompt**: A text prompt describing what you don't want in the audio. (str)
- **num_inference_steps**: Number of denoising steps. More steps generally improve quality but increase generation time. (int)
- **audio_length_in_s**: The desired duration of the generated audio in seconds. (float)
- **num_waveforms_per_prompt**: Number of audio samples to generate per prompt. (int)
- **seed**: Seed for the random number generator. Use -1 for a random seed. (int)

### initialize

**Args:**
- **context (ProcessingContext)**

### move_to_device

**Args:**
- **device (str)**


## AutomaticSpeechRecognition

Transcribes spoken audio to text.

Use cases:
- Transcribe interviews or meetings
- Create subtitles for videos
- Implement voice commands in applications

**Tags:** asr, speech-to-text, audio, huggingface

**Fields:**
- **model**: The model ID to use for the speech recognition (HFAutomaticSpeechRecognition)
- **inputs**: The input audio to transcribe (AudioRef)

### get_inputs

**Args:**
- **context (ProcessingContext)**

### get_model_id

**Args:**

### process_local_result

**Args:**
- **context (ProcessingContext)**
- **result (Any)**

**Returns:** AudioRef

### process_remote_result

**Args:**
- **context (ProcessingContext)**
- **result (Any)**

**Returns:** AudioRef

### required_inputs

**Args:**


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

### get_inputs

**Args:**
- **context (ProcessingContext)**

### get_model_id

**Args:**

### process_local_result

**Args:**
- **context (ProcessingContext)**
- **result (Any)**

**Returns:** AudioRef

### process_remote_result

**Args:**
- **context (ProcessingContext)**
- **result (Any)**

**Returns:** AudioRef


## DanceDiffusion

Generates audio using the DanceDiffusion model.

Use cases:
- Create AI-generated music samples
- Produce background music for videos or games
- Generate audio content for creative projects
- Explore AI-composed musical ideas

**Tags:** audio, generation, AI, music

**Fields:**
- **audio_length_in_s**: The desired duration of the generated audio in seconds. (float)
- **num_inference_steps**: Number of denoising steps. More steps generally improve quality but increase generation time. (int)
- **seed**: Seed for the random number generator. Use -1 for a random seed. (int)

### initialize

**Args:**
- **context (ProcessingContext)**

### move_to_device

**Args:**
- **device (str)**


## MusicGen

Generates audio (music or sound effects) from text descriptions.

Use cases:
- Create custom background music for videos or games
- Generate sound effects based on textual descriptions
- Prototype musical ideas quickly

**Tags:** audio, music, generation, huggingface

**Fields:**
- **model**: The model ID to use for the audio generation (HFTextToAudio)
- **prompt**: The input text to the model (str)
- **max_new_tokens**: The maximum number of tokens to generate (int)

### get_model_id

**Args:**

### initialize

**Args:**
- **context (ProcessingContext)**

### move_to_device

**Args:**
- **device (str)**


## MusicLDM

Generates audio (music or sound effects) from text descriptions.

Use cases:
- Create custom background music for videos or games
- Generate sound effects based on textual descriptions
- Prototype musical ideas quickly

Recommended models:
- ucsd-reach/musicldm

**Tags:** audio, music, generation, huggingface

**Fields:**
- **model**: The model ID to use for the audio generation (HFTextToAudio)
- **prompt**: The input text to the model (str)
- **num_inference_steps**: The number of inference steps to use for the generation (int)
- **audio_length_in_s**: The length of the generated audio in seconds (float)

### initialize

**Args:**
- **context (ProcessingContext)**

### move_to_device

**Args:**
- **device (str)**


## StableAudioNode

Generates audio using the Stable Audio Pipeline based on a text prompt.

Use cases:
- Creating custom sound effects based on textual descriptions
- Generating background audio for videos or games
- Exploring AI-generated audio for creative projects

**Tags:** audio, generation, AI, text-to-audio

**Fields:**
- **prompt**: A text prompt describing the desired audio. (str)
- **negative_prompt**: A text prompt describing what you don't want in the audio. (str)
- **duration**: The desired duration of the generated audio in seconds. (float)
- **num_inference_steps**: Number of denoising steps. More steps generally improve quality but increase generation time. (int)
- **seed**: Seed for the random number generator. Use -1 for a random seed. (int)

### initialize

**Args:**
- **context (ProcessingContext)**

### move_to_device

**Args:**
- **device (str)**


## ZeroShotAudioClassifier

Classifies audio into categories without the need for training data.

Use cases:
- Quickly categorize audio without training data
- Identify sounds or music genres without predefined labels
- Automate audio tagging for large datasets

**Tags:** audio, classification, labeling, categorization, zero-shot

**Fields:**
- **model**: The model ID to use for the classification (HFZeroShotAudioClassification)
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
- **result (Any)**

**Returns:** dict[str, float]

### process_remote_result

**Args:**
- **context (ProcessingContext)**
- **result (Any)**

**Returns:** dict[str, float]

### required_inputs

**Args:**


