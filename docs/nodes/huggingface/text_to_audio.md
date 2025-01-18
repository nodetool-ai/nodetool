# nodetool.nodes.huggingface.text_to_audio

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


## DanceDiffusion

Generates audio using the DanceDiffusion model.

Use cases:
- Create AI-generated music samples
- Produce background music for videos or games
- Generate audio content for creative projects
- Explore AI-composed musical ideas

**Tags:** audio, generation, AI, music, text-to-audio

**Fields:**
- **audio_length_in_s**: The desired duration of the generated audio in seconds. (float)
- **num_inference_steps**: Number of denoising steps. More steps generally improve quality but increase generation time. (int)
- **seed**: Seed for the random number generator. Use -1 for a random seed. (int)

### initialize

**Args:**
- **context (ProcessingContext)**


## MusicGen

Generates audio (music or sound effects) from text descriptions.

Use cases:
- Create custom background music for videos or games
- Generate sound effects based on textual descriptions
- Prototype musical ideas quickly

**Tags:** audio, music, generation, huggingface, text-to-audio

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

**Tags:** audio, music, generation, huggingface, text-to-audio

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

Generate audio using Stable Audio model based on text prompts. Features high-quality audio synthesis with configurable parameters.

Use cases:
- Create custom audio content from text
- Generate background music and sounds
- Produce audio for multimedia projects
- Create sound effects and ambience
- Generate experimental audio content

**Tags:** audio, generation, synthesis, text-to-audio, text-to-audio

**Fields:**
- **prompt**: A text prompt describing the desired audio. (str)
- **negative_prompt**: A text prompt describing what you don't want in the audio. (str)
- **duration**: The desired duration of the generated audio in seconds. (float)
- **num_inference_steps**: Number of denoising steps. More steps generally improve quality but increase generation time. (int)
- **seed**: Seed for the random number generator. Use -1 for a random seed. (int)

### initialize

**Args:**
- **context (ProcessingContext)**


