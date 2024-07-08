# nodetool.nodes.nodetool.audio.transform

## ConcatAudio

Concatenates two audio files together.

Use cases:
- Combine multiple audio clips into a single file
- Create longer audio tracks from shorter segments

**Tags:** audio, edit, join

- **a**: The first audio file. (AudioRef)
- **b**: The second audio file. (AudioRef)

## NormalizeAudio

Normalizes the volume of an audio file.

Use cases:
- Ensure consistent volume across multiple audio files
- Adjust overall volume level before further processing

**Tags:** audio, fix, dynamics

- **audio**: The audio file to normalize. (AudioRef)

## OverlayAudio

Overlays two audio files together.

Use cases:
- Mix background music with voice recording
- Layer sound effects over an existing audio track

**Tags:** audio, edit, transform

- **a**: The first audio file. (AudioRef)
- **b**: The second audio file. (AudioRef)

## RemoveSilence

Removes or shortens silence in an audio file with smooth transitions.

Use cases:
- Trim silent parts from beginning/end of recordings
- Remove or shorten long pauses between speech segments
- Apply crossfade for smooth transitions

**Tags:** audio, edit, clean

- **audio**: The audio file to process. (AudioRef)
- **min_length**: Minimum length of silence to be processed (in milliseconds). (int)
- **threshold**: Silence threshold in dB (relative to full scale). Higher values detect more silence. (int)
- **reduction_factor**: Factor to reduce silent parts (0.0 to 1.0). 0.0 keeps silence as is, 1.0 removes it completely. (float)
- **crossfade**: Duration of crossfade in milliseconds to apply between segments for smooth transitions. (int)
- **min_silence_between_parts**: Minimum silence duration in milliseconds to maintain between non-silent segments (int)

## SliceAudio

Extracts a section of an audio file.

Use cases:
- Cut out a specific clip from a longer audio file
- Remove unwanted portions from beginning or end

**Tags:** audio, edit, trim

- **audio**: The audio file. (AudioRef)
- **start**: The start time in seconds. (float)
- **end**: The end time in seconds. (float)

## Tone

Generates a constant tone signal.

Use cases:
- Create test tones for audio equipment calibration
- Produce reference pitches for musical applications

**Tags:** audio, generate, sound

- **frequency**: Frequency of the tone in Hertz. (float)
- **sampling_rate**: Sampling rate. (int)
- **duration**: Duration of the tone in seconds. (float)
- **phi**: Initial phase of the waveform in radians. (float)

