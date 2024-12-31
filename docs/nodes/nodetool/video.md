# nodetool.nodes.nodetool.video

## AddAudio

Add an audio track to a video, replacing or mixing with existing audio.

Use cases:
1. Add background music or narration to a silent video
2. Replace original audio with a new soundtrack
3. Mix new audio with existing video sound

**Tags:** video, audio, soundtrack, merge

**Fields:**
- **video**: The input video to add audio to. (VideoRef)
- **audio**: The audio file to add to the video. (AudioRef)
- **volume**: Volume adjustment for the added audio. 1.0 is original volume. (float)
- **mix**: If True, mix new audio with existing. If False, replace existing audio. (bool)


## AddSubtitles

Add subtitles to a video.

Use cases:
1. Add translations or closed captions to videos
2. Include explanatory text or commentary in educational videos
3. Create lyric videos for music content

**Tags:** video, subtitles, text, caption

**Fields:**
- **video**: The input video to add subtitles to. (VideoRef)
- **chunks**: Audio chunks to add as subtitles. (list[nodetool.metadata.types.AudioChunk])
- **font**: The font to use. (SubtitleTextFont)
- **align**: Vertical alignment of subtitles. (SubtitleTextAlignment)
- **font_size**: The font size. (int)
- **font_color**: The font color. (ColorRef)
- **outline_color**: The outline color for better text visibility. (ColorRef)


## Blur

Apply a blur effect to a video.

Use cases:
1. Create a dreamy or soft focus effect
2. Obscure or censor specific areas of the video
3. Reduce noise or grain in low-quality footage

**Tags:** video, blur, smooth, soften

**Fields:**
- **video**: The input video to apply blur effect. (VideoRef)
- **strength**: The strength of the blur effect. Higher values create a stronger blur. (float)


## ChromaKey

Apply chroma key (green screen) effect to a video.

Use cases:
1. Remove green or blue background from video footage
2. Create special effects by compositing video onto new backgrounds
3. Produce professional-looking videos for presentations or marketing

**Tags:** video, chroma key, green screen, compositing

**Fields:**
- **video**: The input video to apply chroma key effect. (VideoRef)
- **key_color**: The color to key out (e.g., '#00FF00' for green). (ColorRef)
- **similarity**: Similarity threshold for the key color. (float)
- **blend**: Blending of the keyed area edges. (float)


## ColorBalance

Adjust the color balance of a video.

Use cases:
1. Correct color casts in video footage
2. Enhance specific color tones for artistic effect
3. Normalize color balance across multiple video clips

**Tags:** video, color, balance, adjustment

**Fields:**
- **video**: The input video to adjust color balance. (VideoRef)
- **red_adjust**: Red channel adjustment factor. (float)
- **green_adjust**: Green channel adjustment factor. (float)
- **blue_adjust**: Blue channel adjustment factor. (float)


## Concat

Concatenate multiple video files into a single video, including audio when available.

**Tags:** video, concat, merge, combine, audio

**Fields:**
- **video_a**: The first video to concatenate. (VideoRef)
- **video_b**: The second video to concatenate. (VideoRef)


## CreateVideo

Combine a sequence of frames into a single video file.

Use cases:
1. Create time-lapse videos from image sequences
2. Compile processed frames back into a video
3. Generate animations from individual images

**Tags:** video, frames, combine, sequence

**Fields:**
- **frames**: The frames to combine into a video. (list[nodetool.metadata.types.ImageRef])
- **fps**: The FPS of the output video. (float)


## Denoise

Apply noise reduction to a video.

Use cases:
1. Improve video quality by reducing unwanted noise
2. Enhance low-light footage
3. Prepare video for further processing or compression

**Tags:** video, denoise, clean, enhance

**Fields:**
- **video**: The input video to denoise. (VideoRef)
- **strength**: Strength of the denoising effect. Higher values mean more denoising. (float)


## ExtractAudio

Separate audio from a video file.

**Fields:**
- **video**: The input video to separate. (VideoRef)


## ExtractFrames

Extract frames from a video file using OpenCV.

Use cases:
1. Generate image sequences for further processing
2. Extract specific frame ranges from a video
3. Create thumbnails or previews from video content

**Tags:** video, frames, extract, sequence

**Fields:**
- **video**: The input video to extract frames from. (VideoRef)
- **start**: The frame to start extracting from. (int)
- **end**: The frame to stop extracting from. (int)

### result_for_client

**Args:**
- **result (dict[str, typing.Any])**

**Returns:** dict[str, typing.Any]


## Fps

Get the frames per second (FPS) of a video file.

Use cases:
1. Analyze video properties for quality assessment
2. Determine appropriate playback speed for video editing
3. Ensure compatibility with target display systems

**Tags:** video, analysis, frames, fps

**Fields:**
- **video**: The input video to adjust the brightness for. (VideoRef)


## Overlay

Overlay one video on top of another, including audio overlay when available.

**Tags:** video, overlay, composite, picture-in-picture, audio

**Fields:**
- **main_video**: The main (background) video. (VideoRef)
- **overlay_video**: The video to overlay on top. (VideoRef)
- **x**: X-coordinate for overlay placement. (int)
- **y**: Y-coordinate for overlay placement. (int)
- **scale**: Scale factor for the overlay video. (float)
- **overlay_audio_volume**: Volume of the overlay audio relative to the main audio. (float)


## ResizeNode

Resize a video to a specific width and height.

Use cases:
1. Adjust video resolution for different display requirements
2. Reduce file size by downscaling video
3. Prepare videos for specific platforms with size constraints

**Tags:** video, resize, scale, dimensions

**Fields:**
- **video**: The input video to resize. (VideoRef)
- **width**: The target width. Use -1 to maintain aspect ratio. (int)
- **height**: The target height. Use -1 to maintain aspect ratio. (int)


## Reverse

Reverse the playback of a video.

Use cases:
1. Create artistic effects by playing video in reverse
2. Analyze motion or events in reverse order
3. Generate unique transitions or intros for video projects

**Tags:** video, reverse, backwards, effect

**Fields:**
- **video**: The input video to reverse. (VideoRef)


## Rotate

Rotate a video by a specified angle.

Use cases:
1. Correct orientation of videos taken with a rotated camera
2. Create artistic effects by rotating video content
3. Adjust video for different display orientations

**Tags:** video, rotate, orientation, transform

**Fields:**
- **video**: The input video to rotate. (VideoRef)
- **angle**: The angle of rotation in degrees. (float)


## Saturation

Adjust the color saturation of a video.

Use cases:
1. Enhance color vibrancy in dull or flat-looking footage
2. Create stylistic effects by over-saturating or desaturating video
3. Correct oversaturated footage from certain cameras

**Tags:** video, saturation, color, enhance

**Fields:**
- **video**: The input video to adjust saturation. (VideoRef)
- **saturation**: Saturation level. 1.0 is original, <1 decreases saturation, >1 increases saturation. (float)


## SaveVideo

Save a video to a file.

Use cases:
1. Export processed video to a specific folder
2. Save video with a custom name
3. Create a copy of a video in a different location

**Tags:** video, save, file, output

**Fields:**
- **video**: The video to save. (VideoRef)
- **folder**: Name of the output folder. (FolderRef)
- **name**: Name of the output video. (str)

### required_inputs

**Args:**


## SetSpeed

Adjust the playback speed of a video.

Use cases:
1. Create slow-motion effects by decreasing video speed
2. Generate time-lapse videos by increasing playback speed
3. Synchronize video duration with audio or other timing requirements

**Tags:** video, speed, tempo, time

**Fields:**
- **video**: The input video to adjust speed. (VideoRef)
- **speed_factor**: The speed adjustment factor. Values > 1 speed up, < 1 slow down. (float)


## Sharpness

Adjust the sharpness of a video.

Use cases:
1. Enhance detail in slightly out-of-focus footage
2. Correct softness introduced by video compression
3. Create stylistic effects by over-sharpening

**Tags:** video, sharpen, enhance, detail

**Fields:**
- **video**: The input video to sharpen. (VideoRef)
- **luma_amount**: Amount of sharpening to apply to luma (brightness) channel. (float)
- **chroma_amount**: Amount of sharpening to apply to chroma (color) channels. (float)


## Stabilize

Apply video stabilization to reduce camera shake and jitter.

Use cases:
1. Improve quality of handheld or action camera footage
2. Smooth out panning and tracking shots
3. Enhance viewer experience by reducing motion sickness

**Tags:** video, stabilize, smooth, shake-reduction

**Fields:**
- **video**: The input video to stabilize. (VideoRef)
- **smoothing**: Smoothing strength. Higher values result in smoother but potentially more cropped video. (float)
- **crop_black**: Whether to crop black borders that may appear after stabilization. (bool)


## Transition

Create a transition effect between two videos, including audio transition when available.

Use cases:
1. Create smooth transitions between video clips in a montage
2. Add professional-looking effects to video projects
3. Blend scenes together for creative storytelling
4. Smoothly transition between audio tracks of different video clips

**Tags:** video, transition, effect, merge, audio

**Fields:**
- **video_a**: The first video in the transition. (VideoRef)
- **video_b**: The second video in the transition. (VideoRef)
- **transition_type**: Type of transition effect (TransitionType)
- **duration**: Duration of the transition effect in seconds. (float)


## Trim

Trim a video to a specific start and end time.

Use cases:
1. Extract specific segments from a longer video
2. Remove unwanted parts from the beginning or end of a video
3. Create shorter clips from a full-length video

**Tags:** video, trim, cut, segment

**Fields:**
- **video**: The input video to trim. (VideoRef)
- **start_time**: The start time in seconds for the trimmed video. (float)
- **end_time**: The end time in seconds for the trimmed video. Use -1 for the end of the video. (float)


### safe_unlink

**Args:**
- **path (str)**

