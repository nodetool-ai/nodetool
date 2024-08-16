# nodetool.nodes.replicate.audio.generate

## Bark

🔊 Text-Prompted Generative Audio Model

**Fields:**
- **prompt**: Input prompt (str)
- **text_temp**: generation temperature (1.0 more diverse, 0.0 more conservative) (float)
- **output_full**: return full generation as a .npz file to be used as a history prompt (bool)
- **waveform_temp**: generation temperature (1.0 more diverse, 0.0 more conservative) (float)
- **history_prompt**: history choice for audio cloning, choose from the list (nodetool.nodes.replicate.audio.generate.Bark.History_prompt | None)
- **custom_history_prompt**: Provide your own .npz file with history choice for audio cloning, this will override the previous history_prompt setting (str | None)

### output_key

**Args:**


## MusicGen

Generate music from a prompt or melody

**Fields:**
- **seed**: Seed for random number generator. If None or -1, a random seed will be used. (int | None)
- **top_k**: Reduces sampling to the k most likely tokens. (int)
- **top_p**: Reduces sampling to tokens with cumulative probability of p. When set to  `0` (default), top_k sampling is used. (float)
- **prompt**: A description of the music you want to generate. (str | None)
- **duration**: Duration of the generated audio in seconds. (int)
- **input_audio**: An audio file that will influence the generated music. If `continuation` is `True`, the generated music will be a continuation of the audio file. Otherwise, the generated music will mimic the audio file's melody. (str | None)
- **temperature**: Controls the 'conservativeness' of the sampling process. Higher temperature means more diversity. (float)
- **continuation**: If `True`, generated music will continue from `input_audio`. Otherwise, generated music will mimic `input_audio`'s melody. (bool)
- **model_version**: Model to use for generation (Model_version)
- **output_format**: Output format for generated audio. (Output_format)
- **continuation_end**: End time of the audio file to use for continuation. If -1 or None, will default to the end of the audio clip. (int | None)
- **continuation_start**: Start time of the audio file to use for continuation. (int)
- **multi_band_diffusion**: If `True`, the EnCodec tokens will be decoded with MultiBand Diffusion. Only works with non-stereo models. (bool)
- **normalization_strategy**: Strategy for normalizing audio. (Normalization_strategy)
- **classifier_free_guidance**: Increases the influence of inputs on the output. Higher values produce lower-varience outputs that adhere more closely to inputs. (int)


## RealisticVoiceCloning

Create song covers with any RVC v2 trained AI voice from audio files.

**Fields:**
- **protect**: Control how much of the original vocals' breath and voiceless consonants to leave in the AI vocals. Set 0.5 to disable. (float)
- **rvc_model**: RVC model for a specific voice. If using a custom model, this should match the name of the downloaded model. If a 'custom_rvc_model_download_url' is provided, this will be automatically set to the name of the downloaded model. (Rvc_model)
- **index_rate**: Control how much of the AI's accent to leave in the vocals. (float)
- **song_input**: Upload your audio file here. (AudioRef)
- **reverb_size**: The larger the room, the longer the reverb time. (float)
- **pitch_change**: Adjust pitch of AI vocals. Options: `no-change`, `male-to-female`, `female-to-male`. (Pitch_change)
- **rms_mix_rate**: Control how much to use the original vocal's loudness (0) or a fixed loudness (1). (float)
- **filter_radius**: If >=3: apply median filtering median filtering to the harvested pitch results. (int)
- **output_format**: wav for best quality and large file size, mp3 for decent quality and small file size. (Output_format)
- **reverb_damping**: Absorption of high frequencies in the reverb. (float)
- **reverb_dryness**: Level of AI vocals without reverb. (float)
- **reverb_wetness**: Level of AI vocals with reverb. (float)
- **crepe_hop_length**: When `pitch_detection_algo` is set to `mangio-crepe`, this controls how often it checks for pitch changes in milliseconds. Lower values lead to longer conversions and higher risk of voice cracks, but better pitch accuracy. (int)
- **pitch_change_all**: Change pitch/key of background music, backup vocals and AI vocals in semitones. Reduces sound quality slightly. (float)
- **main_vocals_volume_change**: Control volume of main AI vocals. Use -3 to decrease the volume by 3 decibels, or 3 to increase the volume by 3 decibels. (float)
- **pitch_detection_algorithm**: Best option is rmvpe (clarity in vocals), then mangio-crepe (smoother vocals). (Pitch_detection_algorithm)
- **instrumental_volume_change**: Control volume of the background music/instrumentals. (float)
- **backup_vocals_volume_change**: Control volume of backup AI vocals. (float)
- **custom_rvc_model_download_url**: URL to download a custom RVC model. If provided, the model will be downloaded (if it doesn't already exist) and used for prediction, regardless of the 'rvc_model' value. (str | None)


## Riffusion

Stable diffusion for real-time music generation

**Fields:**
- **alpha**: Interpolation alpha if using two prompts. A value of 0 uses prompt_a fully, a value of 1 uses prompt_b fully (float)
- **prompt_a**: The prompt for your audio (str)
- **prompt_b**: The second prompt to interpolate with the first, leave blank if no interpolation (str | None)
- **denoising**: How much to transform input spectrogram (float)
- **seed_image_id**: Seed spectrogram to use (Seed_image_id)
- **num_inference_steps**: Number of steps to run the diffusion model (int)

### output_key

**Args:**


## StyleTTS2

Generates speech from text

**Fields:**
- **beta**: Only used for long text inputs or in case of reference speaker,             determines the prosody of the speaker. Use lower values to sample style based             on previous or reference speech instead of text. (float)
- **seed**: Seed for reproducibility (int)
- **text**: Text to convert to speech (str | None)
- **alpha**: Only used for long text inputs or in case of reference speaker,             determines the timbre of the speaker. Use lower values to sample style based             on previous or reference speech instead of text. (float)
- **weights**: Replicate weights url for inference with model that is fine-tuned on new speakers.            If provided, a reference speech must also be provided.             If not provided, the default model will be used. (str | None)
- **reference**: Reference speech to copy style from (AudioRef)
- **diffusion_steps**: Number of diffusion steps (int)
- **embedding_scale**: Embedding scale, use higher values for pronounced emotion (float)


## TortoiseTTS

Generate speech from text, clone voices from mp3 files. From James Betker AKA "neonbjb".

**Fields:**
- **seed**: Random seed which can be used to reproduce results. (int)
- **text**: Text to speak. (str)
- **preset**: Which voice preset to use. See the documentation for more information. (Preset)
- **voice_a**: Selects the voice to use for generation. Use `random` to select a random voice. Use `custom_voice` to use a custom voice. (Voice_a)
- **voice_b**: (Optional) Create new voice from averaging the latents for `voice_a`, `voice_b` and `voice_c`. Use `disabled` to disable voice mixing. (Voice_b)
- **voice_c**: (Optional) Create new voice from averaging the latents for `voice_a`, `voice_b` and `voice_c`. Use `disabled` to disable voice mixing. (Voice_c)
- **cvvp_amount**: How much the CVVP model should influence the output. Increasing this can in some cases reduce the likelyhood of multiple speakers. Defaults to 0 (disabled) (float)
- **custom_voice**: (Optional) Create a custom voice based on an mp3 file of a speaker. Audio should be at least 15 seconds, only contain one speaker, and be in mp3 format. Overrides the `voice_a` input. (AudioRef)


