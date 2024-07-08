# nodetool.nodes.nodetool.video

## ExtractVideoFrames

Extract frames from a video file.

Use cases:
1. Generate image sequences for further processing
2. Extract specific frame ranges from a video
3. Create thumbnails or previews from video content

**Tags:** video, frames, extract, sequence

- **video**: The input video to adjust the brightness for. (VideoRef)
- **start**: The frame to start extracting from. (int)
- **end**: The frame to stop extracting from. (int)

## FramesToVideo

Combine a sequence of frames into a single video file.

Use cases:
1. Create time-lapse videos from image sequences
2. Compile processed frames back into a video
3. Generate animations from individual images

**Tags:** video, frames, combine, sequence

- **frames**: The frames to combine into a video. (list[nodetool.metadata.types.ImageRef])
- **fps**: The FPS of the output video. (float)

## SaveVideo

Save a video to a file.

Use cases:
1. Export processed video to a specific folder
2. Save video with a custom name
3. Create a copy of a video in a different location

**Tags:** video, save, file, output

- **value**: The video to save. (VideoRef)
- **folder**: Name of the output folder. (FolderRef)
- **name**: Name of the output video. (str)

## VideoFps

Get the frames per second (FPS) of a video file.

Use cases:
1. Analyze video properties for quality assessment
2. Determine appropriate playback speed for video editing
3. Ensure compatibility with target display systems

**Tags:** video, analysis, frames, fps

- **video**: The input video to adjust the brightness for. (VideoRef)

