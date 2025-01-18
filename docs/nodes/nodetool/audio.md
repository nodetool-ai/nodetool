# nodetool.nodes.nodetool.audio

## SaveAudio

Save an audio file to a specified folder.

Use cases:
- Save generated audio files with timestamps
- Organize outputs into specific folders
- Create backups of generated audio

**Tags:** audio, folder, name

**Fields:**
- **audio** (AudioRef)
- **folder**: The folder to save the audio file to.  (FolderRef)
- **name**: 
        The name of the audio file.
        You can use time and date variables to create unique names:
        %Y - Year
        %m - Month
        %d - Day
        %H - Hour
        %M - Minute
        %S - Second
         (str)

### required_inputs

**Args:**


- [nodetool.nodes.nodetool.audio.analysis](audio/analysis.md)
- [nodetool.nodes.nodetool.audio.audio_helpers](audio/audio_helpers.md)
- [nodetool.nodes.nodetool.audio.conversion](audio/conversion.md)
- [nodetool.nodes.nodetool.audio.effects](audio/effects.md)
- [nodetool.nodes.nodetool.audio.segmentation](audio/segmentation.md)
- [nodetool.nodes.nodetool.audio.synthesis](audio/synthesis.md)
- [nodetool.nodes.nodetool.audio.transform](audio/transform.md)
