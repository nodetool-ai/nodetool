# nodetool.nodes.nodetool.audio.conversion

## AudioToTensor

Converts an audio file to a tensor for further processing.

Use cases:
- Prepare audio data for machine learning models
- Enable signal processing operations on audio
- Convert audio to a format suitable for spectral analysisr

**Tags:** audio, conversion, tensor

- **audio**: The audio file to convert to a tensor. (AudioRef)

## CreateSilence

Creates a silent audio file with a specified duration.

Use cases:
- Generate placeholder audio files
- Create audio segments for padding or spacing
- Add silence to the beginning or end of audio files

**Tags:** audio, silence, empty

- **duration**: The duration of the silence in seconds. (float)

## TensorToAudio

Converts a tensor object back to an audio file.

Use cases:
- Save processed audio data as a playable file
- Convert generated or modified audio tensors to audio format
- Output results of audio processing pipelinesr

**Tags:** audio, conversion, tensor

- **tensor**: The tensor to convert to an audio file. (Tensor)
- **sample_rate**: The sample rate of the audio file. (int)

