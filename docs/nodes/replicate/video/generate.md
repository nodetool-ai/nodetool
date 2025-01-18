# nodetool.nodes.replicate.video.generate

## AudioToWaveform

Create a waveform video from audio

**Fields:**
- **audio**: Audio file to create waveform from (AudioRef)
- **bg_color**: Background color of waveform (str)
- **fg_alpha**: Opacity of foreground waveform (float)
- **bar_count**: Number of bars in waveform (int)
- **bar_width**: Width of bars in waveform. 1 represents full width, 0.5 represents half width, etc. (float)
- **bars_color**: Color of waveform bars (str)
- **caption_text**: Caption text for the video (str)


## HotshotXL

😊 Hotshot-XL is an AI text-to-GIF model trained to work alongside Stable Diffusion XL

**Fields:**
- **mp4**: Save as mp4, False for GIF (bool)
- **seed**: Random seed. Leave blank to randomize the seed (int | None)
- **steps**: Number of denoising steps (int)
- **width**: Width of the output (Width)
- **height**: Height of the output (Height)
- **prompt**: Input prompt (str)
- **scheduler**: Select a Scheduler (Scheduler)
- **negative_prompt**: Negative prompt (str)


## Hunyuan_Video

A state-of-the-art text-to-video generation model capable of creating high-quality videos with realistic motion from text descriptions

**Fields:**
- **fps**: Frames per second of the output video (int)
- **seed**: Random seed (leave empty for random) (int | None)
- **width**: Width of the video in pixels (must be divisible by 16) (int)
- **height**: Height of the video in pixels (must be divisible by 16) (int)
- **prompt**: The prompt to guide the video generation (str)
- **infer_steps**: Number of denoising steps (int)
- **video_length**: Number of frames to generate (must be 4k+1, ex: 49 or 129) (int)
- **embedded_guidance_scale**: Guidance scale (float)


## LTX_Video

LTX-Video is the first DiT-based video generation model capable of generating high-quality videos in real-time. It produces 24 FPS videos at a 768x512 resolution faster than they can be watched.

**Fields:**
- **cfg**: How strongly the video follows the prompt (float)
- **seed**: Set a seed for reproducibility. Random by default. (int | None)
- **image**: Optional input image to use as the starting frame (ImageRef)
- **model**: Model version to use (Model)
- **steps**: Number of steps (int)
- **length**: Length of the output video in frames (Length)
- **prompt**: Text prompt for the video. This model needs long descriptive prompts, if the prompt is too short the quality won't be good. (str)
- **target_size**: Target size for the output video (Target_size)
- **aspect_ratio**: Aspect ratio of the output video. Ignored if an image is provided. (Aspect_ratio)
- **negative_prompt**: Things you do not want to see in your video (str)
- **image_noise_scale**: Lower numbers stick more closely to the input image (float)


## Music_01

Quickly generate up to 1 minute of music with lyrics and vocals in the style of a reference track

**Fields:**
- **lyrics**: Lyrics with optional formatting. You can use a newline to separate each line of lyrics. You can use two newlines to add a pause between lines. You can use double hash marks (##) at the beginning and end of the lyrics to add accompaniment. (str)
- **bitrate**: Bitrate for the generated music (Bitrate)
- **voice_id**: Reuse a previously uploaded voice ID (str | None)
- **song_file**: Reference song, should contain music and vocals. Must be a .wav or .mp3 file longer than 15 seconds. (AudioRef)
- **voice_file**: Voice reference. Must be a .wav or .mp3 file longer than 15 seconds. If only a voice reference is given, an a cappella vocal hum will be generated. (AudioRef)
- **sample_rate**: Sample rate for the generated music (Sample_rate)
- **instrumental_id**: Reuse a previously uploaded instrumental ID (str | None)
- **instrumental_file**: Instrumental reference. Must be a .wav or .mp3 file longer than 15 seconds. If only an instrumental reference is given, a track without vocals will be generated. (str | None)


## Ray

Fast, high quality text-to-video and image-to-video (Also known as Dream Machine)

**Fields:**
- **loop**: Whether the video should loop (bool)
- **prompt**: Text prompt for video generation (str | None)
- **aspect_ratio**: Aspect ratio of the video (e.g. '16:9'). Ignored if a start or end frame or video ID is given. (Aspect_ratio)
- **end_video_id**: Prepend a new video generation to the beginning of an existing one (Also called 'reverse extend'). You can combine this with start_image_url, or start_video_id. (str | None)
- **end_image_url**: URL of an image to use as the ending frame (ImageRef)
- **start_video_id**: Continue or extend a video generation with a new generation. You can combine this with end_image_url, or end_video_id. (str | None)
- **start_image_url**: URL of an image to use as the starting frame (ImageRef)


## RobustVideoMatting

extract foreground of a video

**Fields:**
- **input_video**: Video to segment. (VideoRef)
- **output_type** (Output_type)


## Video_01

Generate 6s videos with prompts or images. (Also known as Hailuo)

**Fields:**
- **prompt**: Text prompt for image generation (str | None)
- **prompt_optimizer**: Use prompt optimizer (bool)
- **first_frame_image**: First frame image for video generation (str | None)


## Video_01_Live

An image-to-video (I2V) model specifically trained for Live2D and general animation use cases

**Fields:**
- **prompt**: Text prompt for image generation (str | None)
- **prompt_optimizer**: Use prompt optimizer (bool)
- **first_frame_image**: First frame image for video generation (str | None)


## Zeroscope_V2_XL

Zeroscope V2 XL & 576w

**Fields:**
- **fps**: fps for the output video (int)
- **seed**: Random seed. Leave blank to randomize the seed (int | None)
- **model**: Model to use (Model)
- **width**: Width of the output video (int)
- **height**: Height of the output video (int)
- **prompt**: Input prompt (str)
- **batch_size**: Batch size (int)
- **init_video**: URL of the initial video (optional) (str | None)
- **num_frames**: Number of frames for the output video (int)
- **init_weight**: Strength of init_video (float)
- **guidance_scale**: Guidance scale (float)
- **negative_prompt**: Negative prompt (str | None)
- **remove_watermark**: Remove watermark (bool)
- **num_inference_steps**: Number of denoising steps (int)


