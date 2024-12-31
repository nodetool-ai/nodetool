# nodetool.nodes.nodetool.audio.transform

## AudioMixer

Mix up to 5 audio tracks together with individual volume controls.

Use cases:
- Mix multiple audio tracks into a single output
- Create layered soundscapes
- Combine music, voice, and sound effects
- Adjust individual track volumes

**Tags:** audio, mix, volume, combine

**Fields:**
- **track1**: First audio track to mix. (AudioRef)
- **track2**: Second audio track to mix. (AudioRef)
- **track3**: Third audio track to mix. (AudioRef)
- **track4**: Fourth audio track to mix. (AudioRef)
- **track5**: Fifth audio track to mix. (AudioRef)
- **volume1**: Volume for track 1. 1.0 is original volume. (float)
- **volume2**: Volume for track 2. 1.0 is original volume. (float)
- **volume3**: Volume for track 3. 1.0 is original volume. (float)
- **volume4**: Volume for track 4. 1.0 is original volume. (float)
- **volume5**: Volume for track 5. 1.0 is original volume. (float)


## Concat

Concatenates two audio files together.

Use cases:
- Combine multiple audio clips into a single file
- Create longer audio tracks from shorter segments

**Tags:** audio, edit, join

**Fields:**
- **a**: The first audio file. (AudioRef)
- **b**: The second audio file. (AudioRef)


## ConcatList

Concatenates multiple audio files together in sequence.

Use cases:
- Combine multiple audio clips into a single file
- Create longer audio tracks from multiple segments
- Chain multiple audio files in order

**Tags:** audio, edit, join, multiple

**Fields:**
- **audio_files**: List of audio files to concatenate in sequence. (list[nodetool.metadata.types.AudioRef])


## FadeIn

Applies a fade-in effect to the beginning of an audio file.

Use cases:
- Create smooth introductions to audio tracks
- Gradually increase volume at the start of a clip

**Tags:** audio, edit, transition

**Fields:**
- **audio**: The audio file to apply fade-in to. (AudioRef)
- **duration**: Duration of the fade-in effect in seconds. (float)


## FadeOut

Applies a fade-out effect to the end of an audio file.

Use cases:
- Create smooth endings to audio tracks
- Gradually decrease volume at the end of a clip

**Tags:** audio, edit, transition

**Fields:**
- **audio**: The audio file to apply fade-out to. (AudioRef)
- **duration**: Duration of the fade-out effect in seconds. (float)


## MonoToStereo

Converts a mono audio signal to stereo.

Use cases:
- Expand mono recordings for stereo playback systems
- Prepare audio for further stereo processing

**Tags:** audio, convert, channels

**Fields:**
- **audio**: The mono audio file to convert. (AudioRef)


## Normalize

Normalizes the volume of an audio file.

Use cases:
- Ensure consistent volume across multiple audio files
- Adjust overall volume level before further processing

**Tags:** audio, fix, dynamics

**Fields:**
- **audio**: The audio file to normalize. (AudioRef)


## OverlayAudio

Overlays two audio files together.

Use cases:
- Mix background music with voice recording
- Layer sound effects over an existing audio track

**Tags:** audio, edit, transform

**Fields:**
- **a**: The first audio file. (AudioRef)
- **b**: The second audio file. (AudioRef)


## RemoveSilence

Removes or shortens silence in an audio file with smooth transitions.

Use cases:
- Trim silent parts from beginning/end of recordings
- Remove or shorten long pauses between speech segments
- Apply crossfade for smooth transitions

**Tags:** audio, edit, clean

**Fields:**
- **audio**: The audio file to process. (AudioRef)
- **min_length**: Minimum length of silence to be processed (in milliseconds). (int)
- **threshold**: Silence threshold in dB (relative to full scale). Higher values detect more silence. (int)
- **reduction_factor**: Factor to reduce silent parts (0.0 to 1.0). 0.0 keeps silence as is, 1.0 removes it completely. (float)
- **crossfade**: Duration of crossfade in milliseconds to apply between segments for smooth transitions. (int)
- **min_silence_between_parts**: Minimum silence duration in milliseconds to maintain between non-silent segments (int)


## Repeat

Loops an audio file a specified number of times.

Use cases:
- Create repeating background sounds or music
- Extend short audio clips to fill longer durations
- Generate rhythmic patterns from short samples

**Tags:** audio, edit, repeat

**Fields:**
- **audio**: The audio file to loop. (AudioRef)
- **loops**: Number of times to loop the audio. Minimum 1 (plays once), maximum 100. (int)


## Reverse

Reverses an audio file.

Use cases:
- Create reverse audio effects
- Generate backwards speech or music

**Tags:** audio, edit, transform

**Fields:**
- **audio**: The audio file to reverse. (AudioRef)


## SliceAudio

Extracts a section of an audio file.

Use cases:
- Cut out a specific clip from a longer audio file
- Remove unwanted portions from beginning or end

**Tags:** audio, edit, trim

**Fields:**
- **audio**: The audio file. (AudioRef)
- **start**: The start time in seconds. (float)
- **end**: The end time in seconds. (float)


## StereoToMono

Converts a stereo audio signal to mono.

Use cases:
- Reduce file size for mono-only applications
- Simplify audio for certain processing tasks

**Tags:** audio, convert, channels

**Fields:**
- **audio**: The stereo audio file to convert. (AudioRef)
- **method**: Method to use for conversion: 'average', 'left', or 'right'. (str)


## Tone

Generates a constant tone signal.

Use cases:
- Create test tones for audio equipment calibration
- Produce reference pitches for musical applications

**Tags:** audio, generate, sound

**Fields:**
- **frequency**: Frequency of the tone in Hertz. (float)
- **sampling_rate**: Sampling rate. (int)
- **duration**: Duration of the tone in seconds. (float)
- **phi**: Initial phase of the waveform in radians. (float)


