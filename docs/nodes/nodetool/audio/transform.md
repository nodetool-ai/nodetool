# nodetool.nodes.nodetool.audio.transform

## ConcatAudio

Concatenates two audio files together.

- Combine multiple audio clips into a single file
- Create longer audio tracks from shorter segments

**Tags:** audio, edit, join

**Inherits from:** BaseNode

- **a**: The first audio file. (`AudioRef`)
- **b**: The second audio file. (`AudioRef`)

## NormalizeAudio

Normalizes the volume of an audio file.

- Ensure consistent volume across multiple audio files
- Adjust overall volume level before further processing

**Tags:** audio, fix, dynamics

**Inherits from:** BaseNode

- **audio**: The audio file to normalize. (`AudioRef`)

## OverlayAudio

Overlays two audio files together.

- Mix background music with voice recording
- Layer sound effects over an existing audio track

**Tags:** audio, edit, transform

**Inherits from:** BaseNode

- **a**: The first audio file. (`AudioRef`)
- **b**: The second audio file. (`AudioRef`)

## RemoveSilence

Removes silence from an audio file.

- Trim silent parts from beginning/end of recordings
- Remove long pauses between speech segments

**Tags:** audio, edit, clean

**Inherits from:** BaseNode

- **audio**: The audio file to remove silence from. (`AudioRef`)
- **min_length**: Minimum length of silence to be removed (in milliseconds). (`int`, default: 100)
- **threshold**: Silence threshold in dB. (`float`, default: -32)
- **reduction_factor**: Factor to reduce silent parts (0.0 to 1.0). (`float`, default: 1.0)
- **crossfade**: Duration of crossfade in milliseconds to apply between segments for smooth transitions. (`int`, default: 10)
- **min_silence_between_parts**: Minimum silence duration in milliseconds to maintain between non-silent segments. (`int`, default: 100)

## SliceAudio

Extracts a section of an audio file.

- Cut out a specific clip from a longer audio file
- Remove unwanted portions from beginning or end

**Tags:** audio, edit, trim

**Inherits from:** BaseNode

- **audio**: The audio file. (`AudioRef`)
- **start**: The start time in seconds. (`float`)
- **end**: The end time in seconds. (`float`)

## Tone

Generates a constant tone signal.

- Create test tones for audio equipment calibration
- Produce reference pitches for musical applications

**Tags:** audio, generate, sound

**Inherits from:** BaseNode

- **frequency**: Frequency of the tone in Hertz. (`float`)
- **sampling_rate**: Sampling rate. (`int`)
- **duration**: Duration of the tone in seconds. (`float`)
- **phi**: Initial phase of the waveform in radians. (`float`)
