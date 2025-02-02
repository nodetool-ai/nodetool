# nodetool.nodes.lib.audio.librosa.segmentation

## DetectOnsets

Detect onsets in an audio file.

Use cases:
- Identify beat locations in music
- Segment audio based on changes in energy or spectral content
- Prepare audio for further processing or analysis

**Tags:** audio, analysis, segmentation

**Fields:**
- **audio**: The input audio file to analyze. (AudioRef)
- **hop_length**: Number of samples between successive frames. (int)


## SaveAudioSegments

Save a list of audio segments to a specified folder.

Use cases:
- Export segmented audio files for further processing or analysis
- Create a dataset of audio clips from a longer recording
- Organize audio segments into a structured format

**Tags:** audio, save, export

**Fields:**
- **segments**: The list of audio segments to save. (list[nodetool.metadata.types.AudioRef])
- **output_folder**: The folder to save the audio segments in. (FolderRef)
- **name_prefix**: Prefix for the saved audio file names. (str)


## SegmentAudioByOnsets

Segment an audio file based on detected onsets.

Use cases:
- Split a long audio recording into individual segments
- Prepare audio clips for further analysis or processing
- Extract specific parts of an audio file based on onset locations

**Tags:** audio, segmentation, processing

**Fields:**
- **audio**: The input audio file to segment. (AudioRef)
- **onsets**: The onset times detected in the audio. (NPArray)
- **min_segment_length**: Minimum length of a segment in seconds. (float)


