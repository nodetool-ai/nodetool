# nodetool.nodes.nodetool.audio.conversion

## ConvertToTensor

Converts an audio file to a tensor for further processing.

Use cases:
- Prepare audio data for machine learning models
- Enable signal processing operations on audio
- Convert audio to a format suitable for spectral analysisr

**Fields:**
audio: AudioRef

## CreateSilence

Creates a silent audio file with a specified duration.

Use cases:
- Generate placeholder audio files
- Create audio segments for padding or spacing
- Add silence to the beginning or end of audio files

**Fields:**
duration: float

## Trim

Trim an audio file to a specified duration.

Use cases:
- Remove silence from the beginning or end of audio files
- Extract specific segments from audio files
- Prepare audio data for machine learning models

**Fields:**
audio: AudioRef
start: float
end: float

