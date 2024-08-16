# nodetool.nodes.nodetool.audio.transform

## Concat

Concatenates two audio files together.

Use cases:
- Combine multiple audio clips into a single file
- Create longer audio tracks from shorter segments

**Fields:**
a: AudioRef
b: AudioRef

## FadeIn

Applies a fade-in effect to the beginning of an audio file.

Use cases:
- Create smooth introductions to audio tracks
- Gradually increase volume at the start of a clip

**Fields:**
audio: AudioRef
duration: float

## FadeOut

Applies a fade-out effect to the end of an audio file.

Use cases:
- Create smooth endings to audio tracks
- Gradually decrease volume at the end of a clip

**Fields:**
audio: AudioRef
duration: float

## MonoToStereo

Converts a mono audio signal to stereo.

Use cases:
- Expand mono recordings for stereo playback systems
- Prepare audio for further stereo processing

**Fields:**
audio: AudioRef

## Normalize

Normalizes the volume of an audio file.

Use cases:
- Ensure consistent volume across multiple audio files
- Adjust overall volume level before further processing

**Fields:**
audio: AudioRef

## OverlayAudio

Overlays two audio files together.

Use cases:
- Mix background music with voice recording
- Layer sound effects over an existing audio track

**Fields:**
a: AudioRef
b: AudioRef

## RemoveSilence

Removes or shortens silence in an audio file with smooth transitions.

Use cases:
- Trim silent parts from beginning/end of recordings
- Remove or shorten long pauses between speech segments
- Apply crossfade for smooth transitions

**Fields:**
audio: AudioRef
min_length: int
threshold: int
reduction_factor: float
crossfade: int
min_silence_between_parts: int

## Repeat

Loops an audio file a specified number of times.

Use cases:
- Create repeating background sounds or music
- Extend short audio clips to fill longer durations
- Generate rhythmic patterns from short samples

**Fields:**
audio: AudioRef
loops: int

## Reverse

Reverses an audio file.

Use cases:
- Create reverse audio effects
- Generate backwards speech or music

**Fields:**
audio: AudioRef

## SliceAudio

Extracts a section of an audio file.

Use cases:
- Cut out a specific clip from a longer audio file
- Remove unwanted portions from beginning or end

**Fields:**
audio: AudioRef
start: float
end: float

## StereoToMono

Converts a stereo audio signal to mono.

Use cases:
- Reduce file size for mono-only applications
- Simplify audio for certain processing tasks

**Fields:**
audio: AudioRef
method: str

## Tone

Generates a constant tone signal.

Use cases:
- Create test tones for audio equipment calibration
- Produce reference pitches for musical applications

**Fields:**
frequency: float
sampling_rate: int
duration: float
phi: float

