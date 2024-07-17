# nodetool.nodes.nodetool.audio.conversion

## ConvertToTensor

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

## Trim

Trim an audio file to a specified duration.

Use cases:
- Remove silence from the beginning or end of audio files
- Extract specific segments from audio files
- Prepare audio data for machine learning models

**Tags:** audio, trim, cut

- **audio**: The audio file to trim. (AudioRef)
- **start**: The start time of the trimmed audio in seconds. (float)
- **end**: The end time of the trimmed audio in seconds. (float)

