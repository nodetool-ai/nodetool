# nodetool.nodes.nodetool.video

## AddAudio

Add an audio track to a video, replacing or mixing with existing audio.

Use cases:
1. Add background music or narration to a silent video
2. Replace original audio with a new soundtrack
3. Mix new audio with existing video sound

**Tags:** video, audio, soundtrack, merge

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

- **video**: The input video to add subtitles to. (VideoRef)
- **subtitles**: SRT Subtitles. (TextRef)
- **font_size**: Font size for the subtitles. (int)
- **font_color**: Color of the subtitle text. (str)
- **outline_color**: Color of the text outline. (str)
- **outline_width**: Width of the text outline. (int)

## Blur

Apply a blur effect to a video.

Use cases:
1. Create a dreamy or soft focus effect
2. Obscure or censor specific areas of the video
3. Reduce noise or grain in low-quality footage

**Tags:** video, blur, smooth, soften

- **video**: The input video to apply blur effect. (VideoRef)
- **strength**: The strength of the blur effect. Higher values create a stronger blur. (float)

## ChromaKey

Apply chroma key (green screen) effect to a video.

Use cases:
1. Remove green or blue background from video footage
2. Create special effects by compositing video onto new backgrounds
3. Produce professional-looking videos for presentations or marketing

**Tags:** video, chroma key, green screen, compositing

- **video**: The input video to apply chroma key effect. (VideoRef)
- **key_color**: The color to key out (e.g., '0x00FF00' for green). (str)
- **similarity**: Similarity threshold for the key color. (float)
- **blend**: Blending of the keyed area edges. (float)

## ColorBalance

Adjust the color balance of a video.

Use cases:
1. Correct color casts in video footage
2. Enhance specific color tones for artistic effect
3. Normalize color balance across multiple video clips

**Tags:** video, color, balance, adjustment

- **video**: The input video to adjust color balance. (VideoRef)
- **red_adjust**: Red channel adjustment factor. (float)
- **green_adjust**: Green channel adjustment factor. (float)
- **blue_adjust**: Blue channel adjustment factor. (float)

## Concat

Concatenate multiple video files into a single video.

Use cases:
1. Merge multiple video clips into a single continuous video
2. Create compilations from various video sources
3. Combine processed video segments back into a full video

**Tags:** video, concat, merge, combine

- **video_a**: The first video to concatenate. (VideoRef)
- **video_b**: The second video to concatenate. (VideoRef)

## CreateVideo

Combine a sequence of frames into a single video file.

Use cases:
1. Create time-lapse videos from image sequences
2. Compile processed frames back into a video
3. Generate animations from individual images

**Tags:** video, frames, combine, sequence

- **frames**: The frames to combine into a video. (list[nodetool.metadata.types.ImageRef])
- **fps**: The FPS of the output video. (float)

## Denoise

Apply noise reduction to a video.

Use cases:
1. Improve video quality by reducing unwanted noise
2. Enhance low-light footage
3. Prepare video for further processing or compression

**Tags:** video, denoise, clean, enhance

- **video**: The input video to denoise. (VideoRef)
- **strength**: Strength of the denoising effect. Higher values mean more denoising. (float)

## ExtractFrames

Extract frames from a video file.

Use cases:
1. Generate image sequences for further processing
2. Extract specific frame ranges from a video
3. Create thumbnails or previews from video content

**Tags:** video, frames, extract, sequence

- **video**: The input video to adjust the brightness for. (VideoRef)
- **start**: The frame to start extracting from. (int)
- **end**: The frame to stop extracting from. (int)

## Fps

Get the frames per second (FPS) of a video file.

Use cases:
1. Analyze video properties for quality assessment
2. Determine appropriate playback speed for video editing
3. Ensure compatibility with target display systems

**Tags:** video, analysis, frames, fps

- **video**: The input video to adjust the brightness for. (VideoRef)

## Overlay

Overlay one video on top of another.

Use cases:
1. Add watermarks or logos to videos
2. Create picture-in-picture effects
3. Combine multiple video streams into a single output

**Tags:** video, overlay, composite, picture-in-picture

- **main_video**: The main (background) video. (VideoRef)
- **overlay_video**: The video to overlay on top. (VideoRef)
- **x**: X-coordinate for overlay placement. (int)
- **y**: Y-coordinate for overlay placement. (int)
- **scale**: Scale factor for the overlay video. (float)

## Reverse

Reverse the playback of a video.

Use cases:
1. Create artistic effects by playing video in reverse
2. Analyze motion or events in reverse order
3. Generate unique transitions or intros for video projects

**Tags:** video, reverse, backwards, effect

- **video**: The input video to reverse. (VideoRef)

## Rotate

Rotate a video by a specified angle.

Use cases:
1. Correct orientation of videos taken with a rotated camera
2. Create artistic effects by rotating video content
3. Adjust video for different display orientations

**Tags:** video, rotate, orientation, transform

- **video**: The input video to rotate. (VideoRef)
- **angle**: The angle of rotation in degrees. (float)

## Saturation

Adjust the color saturation of a video.

Use cases:
1. Enhance color vibrancy in dull or flat-looking footage
2. Create stylistic effects by over-saturating or desaturating video
3. Correct oversaturated footage from certain cameras

**Tags:** video, saturation, color, enhance

- **video**: The input video to adjust saturation. (VideoRef)
- **saturation**: Saturation level. 1.0 is original, <1 decreases saturation, >1 increases saturation. (float)

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

## SetSpeed

Adjust the playback speed of a video.

Use cases:
1. Create slow-motion effects by decreasing video speed
2. Generate time-lapse videos by increasing playback speed
3. Synchronize video duration with audio or other timing requirements

**Tags:** video, speed, tempo, time

- **video**: The input video to adjust speed. (VideoRef)
- **speed_factor**: The speed adjustment factor. Values > 1 speed up, < 1 slow down. (float)

## Sharpness

Adjust the sharpness of a video.

Use cases:
1. Enhance detail in slightly out-of-focus footage
2. Correct softness introduced by video compression
3. Create stylistic effects by over-sharpening

**Tags:** video, sharpen, enhance, detail

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

- **video**: The input video to stabilize. (VideoRef)
- **smoothing**: Smoothing strength. Higher values result in smoother but potentially more cropped video. (float)
- **crop_black**: Whether to crop black borders that may appear after stabilization. (bool)

## Transition

Create a transition effect between two videos.

Use cases:
1. Create smooth transitions between video clips in a montage
2. Add professional-looking effects to video projects
3. Blend scenes together for creative storytelling

**Tags:** video, transition, effect, merge

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

- **video**: The input video to trim. (VideoRef)
- **start_time**: The start time in seconds for the trimmed video. (float)
- **end_time**: The end time in seconds for the trimmed video. Use -1 for the end of the video. (float)

## VideoResizeNode

Resize a video to a specific width and height.

Use cases:
1. Adjust video resolution for different display requirements
2. Reduce file size by downscaling video
3. Prepare videos for specific platforms with size constraints

**Tags:** video, resize, scale, dimensions

- **video**: The input video to resize. (VideoRef)
- **width**: The target width. Use -1 to maintain aspect ratio. (int)
- **height**: The target height. Use -1 to maintain aspect ratio. (int)

