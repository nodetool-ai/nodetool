# nodetool.nodes.fal.image_to_video

## AMTInterpolation

Interpolate between image frames to create smooth video transitions. Supports configurable FPS and recursive interpolation passes for higher quality results.

Use cases:
- Create smooth frame transitions
- Generate fluid animations
- Enhance video frame rates
- Produce slow-motion effects
- Create seamless video blends

**Tags:** video, interpolation, transitions, frames, smoothing, img2vid, image-to-video

**Fields:**
- **frames**: List of frames to interpolate between (minimum 2 frames required) (list)
- **output_fps**: Output frames per second (int)
- **recursive_interpolation_passes**: Number of recursive interpolation passes (higher = smoother) (int)


## AspectRatio

An enumeration.

## CogVideoX

Generate videos from images using CogVideoX-5B. Features high-quality motion synthesis with configurable parameters for fine-tuned control over the output.

Use cases:
- Create controlled video animations
- Generate precise motion effects
- Produce customized video content
- Create fine-tuned animations
- Generate motion sequences

**Tags:** video, generation, motion, synthesis, control, img2vid, image-to-video

**Fields:**
- **image**: The image to transform into a video (ImageRef)
- **prompt**: A description of the desired video motion and style (str)
- **video_size**: The size/aspect ratio of the generated video (VideoSize)
- **negative_prompt**: What to avoid in the generated video (str)
- **num_inference_steps**: Number of denoising steps (higher = better quality but slower) (int)
- **guidance_scale**: How closely to follow the prompt (higher = more faithful but less creative) (float)
- **use_rife**: Whether to use RIFE for video interpolation (bool)
- **export_fps**: Target frames per second for the output video (int)
- **seed**: The same seed will output the same video every time (int)


## FaceModelResolution

An enumeration.

## FastSVD

Generate short video clips from your images using SVD v1.1 at Lightning Speed. Features high-quality motion synthesis with configurable parameters for rapid video generation.

Use cases:
- Create quick video animations
- Generate rapid motion content
- Produce fast video transitions
- Create instant visual effects
- Generate quick previews

**Tags:** video, generation, fast, motion, synthesis, img2vid, image-to-video

**Fields:**
- **image**: The image to transform into a video (ImageRef)
- **motion_bucket_id**: Controls motion intensity (higher = more motion) (int)
- **cond_aug**: Amount of noise added to conditioning (higher = more motion) (float)
- **steps**: Number of inference steps (higher = better quality but slower) (int)
- **fps**: Frames per second of the output video (total length is 25 frames) (int)
- **seed**: The same seed will output the same video every time (int)


## HaiperImageToVideo

Transform images into hyper-realistic videos with Haiper 2.0. Experience industry-leading resolution, fluid motion, and rapid generation for stunning AI videos.

Use cases:
- Create cinematic animations
- Generate dynamic video content
- Transform static images into motion
- Produce high-resolution videos
- Create visual effects

**Tags:** video, generation, hyper-realistic, motion, animation, image-to-video, img2vid

**Fields:**
- **image**: The image to transform into a video (ImageRef)
- **prompt**: A description of the desired video motion and style (str)
- **duration**: The duration of the generated video in seconds (VideoDuration)
- **prompt_enhancer**: Whether to use the model's prompt enhancer (bool)
- **seed**: The same seed will output the same video every time (int)


## KlingDuration

An enumeration.

## KlingVideo

Generate video clips from your images using Kling 1.6. Supports multiple durations and aspect ratios.

Use cases:
- Create custom video content
- Generate video animations
- Transform static images
- Produce motion graphics
- Create visual presentations

**Tags:** video, generation, animation, duration, aspect-ratio, img2vid, image-to-video

**Fields:**
- **image**: The image to transform into a video (ImageRef)
- **prompt**: A description of the desired video motion and style (str)
- **duration**: The duration of the generated video (KlingDuration)
- **aspect_ratio**: The aspect ratio of the generated video frame (AspectRatio)


## KlingVideoPro

Generate video clips from your images using Kling 1.6 Pro. The professional version offers enhanced quality and performance compared to the standard version.

Use cases:
- Create professional video content
- Generate high-quality animations
- Produce commercial video assets
- Create advanced motion graphics
- Generate premium visual content

**Tags:** video, generation, professional, quality, performance, img2vid, image-to-video

**Fields:**
- **image**: The image to transform into a video (ImageRef)
- **prompt**: A description of the desired video motion and style (str)
- **duration**: The duration of the generated video (KlingDuration)
- **aspect_ratio**: The aspect ratio of the generated video frame (AspectRatio)


## LTXVideo

Generate videos from images using LTX Video. Best results with 768x512 images and detailed, chronological descriptions of actions and scenes.

Use cases:
- Create scene-based animations
- Generate sequential video content
- Produce narrative videos
- Create storyboard animations
- Generate action sequences

**Tags:** video, generation, chronological, scenes, actions, img2vid, image-to-video

**Fields:**
- **image**: The image to transform into a video (768x512 recommended) (ImageRef)
- **prompt**: A detailed description of the desired video motion and style (str)
- **negative_prompt**: What to avoid in the generated video (str)
- **num_inference_steps**: Number of inference steps (higher = better quality but slower) (int)
- **guidance_scale**: How closely to follow the prompt (higher = more faithful) (float)
- **seed**: The same seed will output the same video every time (int)


## LumaDreamMachine

Generate video clips from your images using Luma Dream Machine v1.5. Supports various aspect ratios and optional end-frame blending.

Use cases:
- Create seamless video loops
- Generate video transitions
- Transform images into animations
- Create motion graphics
- Produce video content

**Tags:** video, generation, animation, blending, aspect-ratio, img2vid, image-to-video

**Fields:**
- **image**: The image to transform into a video (ImageRef)
- **prompt**: A description of the desired video motion and style (str)
- **aspect_ratio**: The aspect ratio of the generated video (AspectRatio)
- **loop**: Whether the video should loop (end blends with beginning) (bool)
- **end_image**: Optional image to blend the end of the video with (nodetool.metadata.types.ImageRef | None)


## MiniMaxVideo

Generate video clips from your images using MiniMax Video model. Transform static art into dynamic masterpieces with enhanced smoothness and vivid motion.

Use cases:
- Transform artwork into videos
- Create smooth animations
- Generate artistic motion content
- Produce dynamic visualizations
- Create video art pieces

**Tags:** video, generation, art, motion, smoothness, img2vid, image-to-video

**Fields:**
- **image**: The image to transform into a video (ImageRef)
- **prompt**: A description of the desired video motion and style (str)
- **prompt_optimizer**: Whether to use the model's prompt optimizer (bool)


## MuseTalk

Real-time high quality audio-driven lip-syncing model. Animate a face video with custom audio for natural-looking speech animation.

Use cases:
- Create lip-synced videos
- Generate speech animations
- Produce dubbed content
- Create animated presentations
- Generate voice-over videos

**Tags:** video, lip-sync, animation, speech, real-time, wav2vid, audio-to-video

**Fields:**
- **video**: URL of the source video to animate (VideoRef)
- **audio**: URL of the audio file to drive the lip sync (AudioRef)


## PreprocessType

An enumeration.

## SadTalker

Generate talking face animations from a single image and audio file. Features configurable face model resolution and expression controls.

Use cases:
- Create talking head videos
- Generate lip-sync animations
- Produce character animations
- Create video presentations
- Generate facial expressions

**Tags:** video, animation, face, talking, expression, img2vid, image-to-video, audio-to-video, wav2vid

**Fields:**
- **image**: The source image to animate (ImageRef)
- **audio**: URL of the audio file to drive the animation (str)
- **face_model_resolution**: Resolution of the face model (FaceModelResolution)
- **expression_scale**: Scale of the expression (1.0 = normal) (float)
- **still_mode**: Reduce head motion (works with preprocess 'full') (bool)
- **preprocess**: Type of image preprocessing to apply (PreprocessType)


## StableVideo

Generate short video clips from your images using Stable Video Diffusion v1.1. Features high-quality motion synthesis with configurable parameters.

Use cases:
- Create stable video animations
- Generate motion content
- Transform images into videos
- Produce smooth transitions
- Create visual effects

**Tags:** video, generation, diffusion, motion, synthesis, img2vid, image-to-video

**Fields:**
- **image**: The image to transform into a video (ImageRef)
- **motion_bucket_id**: Controls motion intensity (higher = more motion) (int)
- **cond_aug**: Amount of noise added to conditioning (higher = more motion) (float)
- **fps**: Frames per second of the output video (int)
- **seed**: The same seed will output the same video every time (int)


## VideoDuration

An enumeration.

## VideoSize

An enumeration.

