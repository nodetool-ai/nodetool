# nodetool.nodes.luma.video

## ImageToVideo

Generate a video from an image using Luma AI.

Use cases:
1. Animate still images
2. Create dynamic content from static visuals
3. Extend single frame concepts into full motion videos

**Tags:** AI, video generation, image-to-video

**Fields:**
- **prompt**: The text prompt for video generation. (str)
- **image**: The input image for video generation. (ImageRef)
- **loop**: Whether the video should loop. (bool)
- **aspect_ratio**: Aspect ratio of the generated video. (LumaAspectRatio)


## LumaAspectRatio

## TextToVideo

Generate a video from a text prompt using Luma AI.

Use cases:
1. Create animated content from textual descriptions
2. Generate video assets for creative projects
3. Visualize concepts or ideas in video form

**Tags:** AI, video generation, text-to-video

**Fields:**
- **prompt**: The text prompt for video generation. (str)
- **loop**: Whether the video should loop. (bool)
- **aspect_ratio**: Aspect ratio of the generated video. (LumaAspectRatio)


### poll_for_completion

**Args:**
- **client (AsyncLumaAI)**
- **generation_id (str)**
- **max_attempts (int) (default: 600)**
- **delay (int) (default: 1)**

**Returns:** str

