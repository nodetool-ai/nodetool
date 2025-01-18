# nodetool.nodes.fal.text_to_audio

## F5TTS

F5 TTS (Text-to-Speech) model for generating natural-sounding speech from text with voice cloning capabilities.

Use cases:
- Generate natural speech from text
- Clone and replicate voices
- Create custom voiceovers
- Produce multilingual speech content
- Generate personalized audio content

**Tags:** audio, tts, voice-cloning, speech, synthesis, text-to-speech, tts, text-to-audio

**Fields:**
- **gen_text**: The text to be converted to speech (str)
- **ref_audio_url**: URL of the reference audio file to clone the voice from (str)
- **ref_text**: Optional reference text. If not provided, ASR will be used (str)
- **model_type**: Model type to use (F5-TTS or E2-TTS) (str)
- **remove_silence**: Whether to remove silence from the generated audio (bool)


## MMAudioV2

MMAudio V2 generates synchronized audio given text inputs. It can generate sounds described by a prompt.

Use cases:
- Generate synchronized audio from text descriptions
- Create custom sound effects
- Produce ambient soundscapes
- Generate audio for multimedia content
- Create sound design elements

**Tags:** audio, generation, synthesis, text-to-audio, synchronization

**Fields:**
- **prompt**: The prompt to generate the audio for (str)
- **negative_prompt**: The negative prompt to avoid certain elements in the generated audio (str)
- **num_steps**: The number of steps to generate the audio for (int)
- **duration**: The duration of the audio to generate in seconds (float)
- **cfg_strength**: The strength of Classifier Free Guidance (float)
- **mask_away_clip**: Whether to mask away the clip (bool)
- **seed**: The same seed will output the same audio every time (int)


## StableAudio

Stable Audio generates audio from text prompts. Open source text-to-audio model from fal.ai.

Use cases:
- Generate custom audio content from text
- Create background music and sounds
- Produce audio assets for projects
- Generate sound effects
- Create experimental audio content

**Tags:** audio, generation, synthesis, text-to-audio, open-source

**Fields:**
- **prompt**: The prompt to generate the audio from (str)
- **seconds_start**: The start point of the audio clip to generate (int)
- **seconds_total**: The duration of the audio clip to generate in seconds (int)
- **steps**: The number of steps to denoise the audio for (int)


