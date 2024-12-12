# nodetool.nodes.kling.video

## KlingAspectRatio

## KlingImageToVideo

Generate a video from an image using Kling AI.

Use cases:
1. Animate still images
2. Create dynamic content from static visuals
3. Extend single frame concepts into full motion videos

**Tags:** AI, video generation, image-to-video

**Fields:**
- **image**: The input image for video generation. (ImageRef)
- **image_tail**: The image tail for video generation. (str)
- **prompt**: The text prompt for video generation. (str)
- **negative_prompt**: The negative prompt for video generation. (str)
- **cfg_scale**: The cfg scale for video generation. (float)
- **mode**: The mode for video generation. (KlingVideoMode)
- **duration**: Duration of the generated video. (KlingVideoDuration)


## KlingTextToVideo

Generate a video from a text prompt using Kling AI.

Use cases:
1. Create animated content from textual descriptions
2. Generate video assets for creative projects
3. Visualize concepts or ideas in video form

**Tags:** AI, video generation, text-to-video

**Fields:**
- **prompt**: The text prompt for video generation. (str)
- **negative_prompt**: The negative prompt for video generation. (str)
- **cfg_scale**: The cfg scale for video generation. (float)
- **mode**: The mode for video generation. (KlingVideoMode)
- **aspect_ratio**: Aspect ratio of the generated video. (KlingAspectRatio)
- **duration**: Duration of the generated video. (KlingVideoDuration)


## KlingVideoDuration

## KlingVideoMode

