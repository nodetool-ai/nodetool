# nodetool.nodes.nodetool.video

## ExtractVideoFrames

Extracts frames from a video file.

**Tags:** video, frames, extract, sequence

**Inherits from:** BaseNode

- **video**: The input video to adjust the brightness for. (`VideoRef`)
- **start**: The frame to start extracting from. (`int`)
- **end**: The frame to stop extracting from. (`int`)

## FramesToVideo

Combines a sequence of frames into a single video file.
Returns a video file from the provided frame sequence.

**Tags:** video, frames, combine, sequence

**Inherits from:** BaseNode

- **frames**: The frames to combine into a video. (`list[nodetool.metadata.types.ImageRef]`)
- **fps**: The FPS of the output video. (`float`)

## SaveVideo

Save a video to a file.

**Tags:** video, save, file, output

**Inherits from:** BaseNode

- **value**: The video to save. (`VideoRef`)
- **folder**: Name of the output folder. (`FolderRef`)
- **name**: Name of the output video. (`str`)

## VideoFps

Returns the frames per second (FPS) of a video file.
Outputs the numerical FPS value of the input video.

**Tags:** video, analysis, frames, fps

**Inherits from:** BaseNode

- **video**: The input video to adjust the brightness for. (`VideoRef`)

