# nodetool.nodes.nodetool.audio.transform

## ConcatAudio

The ConcatAudio Node concatenates two audio files together.
This node is a tool used to combine two separate audio files into a single, continuous audio file. This can be particularly useful in audio processing workflows where multiple audio snippets need to be joined together in a linear sequence.

#### Applications
- Combining voice recordings: If you have two separate voice recordings and you want them to play continuously as if it was one recording, you use this node.
- Building soundtracks: Sequentially join multiple short music files to create a longer soundtrack.

**Tags:** 

**Inherits from:** BaseNode

- **a**: The first audio file. (`AudioRef`)
- **b**: The second audio file. (`AudioRef`)

## NormalizeAudio

This node normalizes the volume of an audio file.
The Normalize Audio Node specifically helps in adjusting the volume of an audio file to a standard level. This process makes all audio files, irrespective of their original volume, of equal loudness for optimal listening. A key feature of this node is that it maintains the relative dynamic range within an audio file during normalization.

#### Applications
- Volume consistency: Ensures that all audio files output at the same volume level.
- Audio processing: Can be used in audio editing and processing to make sound consistent and balanced.

**Tags:** 

**Inherits from:** BaseNode

- **audio**: The audio file to normalize. (`AudioRef`)

## OverlayAudio

The OverlayAudioNode is used to overlay two audio files together.
The OverlayAudioNode is a node which purpose is to combine two audio files into one. This creates an interesting audio effect and can be used for mixing and producing audio. The node takes two audio files as inputs and overlays them, meaning that both audios play simultaneously in the final output.

#### Applications
- Audio Editing: Overlay two audio tracks to create a new, mixed audio clip.
- Music Production: Overlap different tracks to produce new musical compositions.

**Tags:** 

**Inherits from:** BaseNode

- **a**: The first audio file. (`AudioRef`)
- **b**: The second audio file. (`AudioRef`)

## RemoveSilence

Removes silence from an audio file.
This node is designed to clean up audio files by automatically detecting and removing sections with silence. It is primarily used for enhancing the quality of the audio files and making them more concise.

#### Applications
- Audio Editing: Remove silent parts to make the audio content more engaging and fluent.
- Speech Processing: Improve the efficiency of speech recognition systems by removing non-informative silent parts.
- Podcast Production: Enhance listener experience by eliminating awkward silent pauses.

**Tags:** 

**Inherits from:** BaseNode

- **audio**: The audio file to remove silence from. (`AudioRef`)

## SliceAudio

This node halves an audio file into two audio files.
The SliceAudioNode is designed to split an audio file from the start to the end time specified in seconds. By setting the desired start and end points, the node processes the input audio file and outputs another generated audio file which contains only the sliced audio.

Noteworthy features of this node include its ability to handle various audio file formats and the precision with which it slices the audio files in seconds.

#### Applications
- Audio Editing: Conveniently cut out specific sections from an audio file for use in different contexts or merely remove undesired parts.
- Audio Sampling: Extract particular sections from the entire audio file for creating samples in music production, sound design, etc.

**Tags:** 

**Inherits from:** BaseNode

- **audio**: The audio file. (`AudioRef`)
- **start**: The start time in seconds. (`float`)
- **end**: The end time in seconds. (`float`)

## Tone

**Inherits from:** BaseNode

- **frequency**: Frequency of the tone in Hertz. (`float`)
- **sampling_rate**: Sampling rate. (`int`)
- **duration**: Duration of the tone in seconds. (`float`)
- **phi**: Initial phase of the waveform in radians. (`float`)

