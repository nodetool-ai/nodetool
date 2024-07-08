# nodetool.nodes.replicate.audio.transcribe

## IncrediblyFastWhisper

whisper-large-v3, incredibly fast, powered by Hugging Face Transformers! 🤗

- **task**: Task to perform: transcribe or translate to another language. (Task)
- **audio**: Audio file (AudioRef)
- **hf_token**: Provide a hf.co/settings/token for Pyannote.audio to diarise the audio clips. You need to agree to the terms in 'https://huggingface.co/pyannote/speaker-diarization-3.1' and 'https://huggingface.co/pyannote/segmentation-3.0' first. (str | None)
- **language**: Language spoken in the audio, specify 'None' to perform language detection. (Language)
- **timestamp**: Whisper supports both chunked as well as word level timestamps. (Timestamp)
- **batch_size**: Number of parallel batches you want to compute. Reduce if you face OOMs. (int)
- **diarise_audio**: Use Pyannote.audio to diarise the audio clips. You will need to provide hf_token below too. (bool)

## Whisper

Convert speech in audio to text

- **audio**: Audio file (AudioRef)
- **model**: This version only supports Whisper-large-v3. (str)
- **language**: language spoken in the audio, specify None to perform language detection (typing.Optional[nodetool.nodes.replicate.audio.transcribe.Whisper.Language])
- **patience**: optional patience value to use in beam decoding, as in https://arxiv.org/abs/2204.05424, the default (1.0) is equivalent to conventional beam search (float | None)
- **translate**: Translate the text to English when set to True (bool)
- **temperature**: temperature to use for sampling (float)
- **transcription**: Choose the format for the transcription (Transcription)
- **initial_prompt**: optional text to provide as a prompt for the first window. (str | None)
- **suppress_tokens**: comma-separated list of token ids to suppress during sampling; '-1' will suppress most special characters except common punctuations (str)
- **logprob_threshold**: if the average log probability is lower than this value, treat the decoding as failed (float)
- **no_speech_threshold**: if the probability of the <|nospeech|> token is higher than this value AND the decoding has failed due to `logprob_threshold`, consider the segment as silence (float)
- **condition_on_previous_text**: if True, provide the previous output of the model as a prompt for the next window; disabling may make the text inconsistent across windows, but the model becomes less prone to getting stuck in a failure loop (bool)
- **compression_ratio_threshold**: if the gzip compression ratio is higher than this value, treat the decoding as failed (float)
- **temperature_increment_on_fallback**: temperature to increase when falling back when the decoding fails to meet either of the thresholds below (float)

