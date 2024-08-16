# nodetool.nodes.nodetool.audio.segmentation

## DetectOnsets

Detect onsets in an audio file.

Use cases:
- Identify beat locations in music
- Segment audio based on changes in energy or spectral content
- Prepare audio for further processing or analysis

**Fields:**
audio: AudioRef
hop_length: int

## SaveAudioSegments

Save a list of audio segments to a specified folder.

Use cases:
- Export segmented audio files for further processing or analysis
- Create a dataset of audio clips from a longer recording
- Organize audio segments into a structured format

**Fields:**
segments: list
output_folder: FolderRef
name_prefix: str

## SegmentAudioByOnsets

Segment an audio file based on detected onsets.

Use cases:
- Split a long audio recording into individual segments
- Prepare audio clips for further analysis or processing
- Extract specific parts of an audio file based on onset locations

**Fields:**
audio: AudioRef
onsets: Tensor
min_segment_length: float

