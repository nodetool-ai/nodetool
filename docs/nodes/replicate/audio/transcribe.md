# nodetool.nodes.replicate.audio.transcribe

## IncrediblyFastWhisper

whisper-large-v3, incredibly fast, powered by Hugging Face Transformers! 🤗

**Fields:**
- **task**: Task to perform: transcribe or translate to another language. (Task)
- **audio**: Audio file (AudioRef)
- **hf_token**: Provide a hf.co/settings/token for Pyannote.audio to diarise the audio clips. You need to agree to the terms in 'https://huggingface.co/pyannote/speaker-diarization-3.1' and 'https://huggingface.co/pyannote/segmentation-3.0' first. (str | None)
- **language**: Language spoken in the audio, specify 'None' to perform language detection. (Language)
- **timestamp**: Whisper supports both chunked as well as word level timestamps. (Timestamp)
- **batch_size**: Number of parallel batches you want to compute. Reduce if you face OOMs. (int)
- **diarise_audio**: Use Pyannote.audio to diarise the audio clips. You will need to provide hf_token below too. (bool)


