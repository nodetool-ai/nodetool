# nodetool.nodes.replicate.video.generate

## AnimateDiff

🎨 AnimateDiff (w/ MotionLoRAs for Panning, Zooming, etc): Animate Your Personalized Text-to-Image Diffusion Models without Specific Tuning

- **seed**: Seed for different images and reproducibility. Use -1 to randomise seed (int)
- **steps**: Number of inference steps (int)
- **width**: Width in pixels (int)
- **frames**: Length of the video in frames (playback is at 8 fps e.g. 16 frames @ 8 fps is 2 seconds) (int)
- **height**: Height in pixels (int)
- **prompt** (str)
- **base_model**: Select a base model (DreamBooth checkpoint) (Base_model)
- **output_format**: Output format of the video. Can be 'mp4' or 'gif' (Output_format)
- **guidance_scale**: Guidance Scale. How closely do we want to adhere to the prompt and its contents (float)
- **negative_prompt** (str)
- **pan_up_motion_strength**: Strength of Pan Up Motion LoRA. 0 disables the LoRA (float)
- **zoom_in_motion_strength**: Strength of Zoom In Motion LoRA. 0 disables the LoRA (float)
- **pan_down_motion_strength**: Strength of Pan Down Motion LoRA. 0 disables the LoRA (float)
- **pan_left_motion_strength**: Strength of Pan Left Motion LoRA. 0 disables the LoRA (float)
- **zoom_out_motion_strength**: Strength of Zoom Out Motion LoRA. 0 disables the LoRA (float)
- **pan_right_motion_strength**: Strength of Pan Right Motion LoRA. 0 disables the LoRA (float)
- **rolling_clockwise_motion_strength**: Strength of Rolling Clockwise Motion LoRA. 0 disables the LoRA (float)
- **rolling_anticlockwise_motion_strength**: Strength of Rolling Anticlockwise Motion LoRA. 0 disables the LoRA (float)

## AnimateDiffIllusions

Monster Labs' Controlnet QR Code Monster v2 For SD-1.5 on top of AnimateDiff Prompt Travel (Motion Module SD 1.5 v2)

- **loop**: Flag to loop the video. Use when you have an 'infinitely' repeating video/gif ControlNet video (bool)
- **seed**: Seed for different images and reproducibility. Leave blank to randomise seed (int | None)
- **steps**: Number of inference steps (int)
- **width**: Width of generated video in pixels, must be divisable by 8 (int)
- **frames**: Length of the video in frames (playback is at 8 fps e.g. 16 frames @ 8 fps is 2 seconds) (int)
- **height**: Height of generated video in pixels, must be divisable by 8 (int)
- **context**: Number of frames to condition on (default: max of <length> or 32). max for motion module v1 is 24 (int)
- **clip_skip**: Skip the last N-1 layers of the CLIP text encoder (lower values follow prompt more closely) (int)
- **scheduler**: Diffusion scheduler (Scheduler)
- **base_model**: Choose the base model for animation generation. If 'CUSTOM' is selected, provide a custom model URL in the next parameter (Base_model)
- **prompt_map**: Prompt for changes in animation. Provide 'frame number : prompt at this frame', separate different prompts with '|'. Make sure the frame number does not exceed the length of video (frames) (str)
- **head_prompt**: Primary animation prompt. If a prompt map is provided, this will be prefixed at the start of every individual prompt in the map (str)
- **tail_prompt**: Additional prompt that will be appended at the end of the main prompt or individual prompts in the map (str)
- **output_format**: Output format of the video. Can be 'mp4' or 'gif' (Output_format)
- **guidance_scale**: Guidance Scale. How closely do we want to adhere to the prompt and its contents (float)
- **negative_prompt** (str)
- **controlnet_video**: A short video/gif that will be used as the keyframes for QR Code Monster to use, Please note, all of the frames will be used as keyframes (VideoRef)
- **film_interpolation**: Whether to use FILM for between-frame interpolation (film-net.github.io) (bool)
- **prompt_fixed_ratio**: Defines the ratio of adherence to the fixed part of the prompt versus the dynamic part (from prompt map). Value should be between 0 (only dynamic) to 1 (only fixed). (float)
- **custom_base_model_url**: Only used when base model is set to 'CUSTOM'. URL of the custom model to download if 'CUSTOM' is selected in the base model. Only downloads from 'https://civitai.com/api/download/models/' are allowed (str)
- **num_interpolation_steps**: Number of steps to interpolate between animation frames (int)
- **enable_qr_code_monster_v2**: Flag to enable QR Code Monster V2 ControlNet (bool)
- **playback_frames_per_second** (int)
- **controlnet_conditioning_scale**: Strength of ControlNet. The outputs of the ControlNet are multiplied by `controlnet_conditioning_scale` before they are added to the residual in the original UNet (float)
- **qr_code_monster_v2_guess_mode**: Flag to enable guess mode (un-guided) for QR Code Monster V2 ControlNet (bool)
- **qr_code_monster_v2_preprocessor**: Flag to pre-process keyframes for QR Code Monster V2 ControlNet (bool)

## AudioToWaveform

Create a waveform video from audio

- **audio**: Audio file to create waveform from (AudioRef)
- **bg_color**: Background color of waveform (str)
- **fg_alpha**: Opacity of foreground waveform (float)
- **bar_count**: Number of bars in waveform (int)
- **bar_width**: Width of bars in waveform. 1 represents full width, 0.5 represents half width, etc. (float)
- **bars_color**: Color of waveform bars (str)
- **caption_text**: Caption text for the video (str)

## HotshotXL

😊 Hotshot-XL is an AI text-to-GIF model trained to work alongside Stable Diffusion XL

- **mp4**: Save as mp4, False for GIF (bool)
- **seed**: Random seed. Leave blank to randomize the seed (int | None)
- **steps**: Number of denoising steps (int)
- **width**: Width of the output (Width)
- **height**: Height of the output (Height)
- **prompt**: Input prompt (str)
- **scheduler**: Select a Scheduler (Scheduler)
- **negative_prompt**: Negative prompt (str)

## RobustVideoMatting

extract foreground of a video

- **input_video**: Video to segment. (VideoRef)
- **output_type** (Output_type)

## StableDiffusionInfiniteZoom

Use Runway's Stable-diffusion inpainting model to create an infinite loop video

- **prompt**: Prompt (str | None)
- **inpaint_iter**: Number of iterations of pasting the image in it's center and inpainting the boarders (int)
- **output_format**: infinite loop gif or mp4 video (Output_format)

## Tooncrafter

Create videos from illustrated input images

- **loop**: Loop the video (bool)
- **seed**: Set a seed for reproducibility. Random by default. (int | None)
- **prompt** (str)
- **image_1**: First input image (ImageRef)
- **image_2**: Second input image (ImageRef)
- **image_3**: Third input image (optional) (ImageRef)
- **image_4**: Fourth input image (optional) (ImageRef)
- **image_5**: Fifth input image (optional) (ImageRef)
- **image_6**: Sixth input image (optional) (ImageRef)
- **image_7**: Seventh input image (optional) (ImageRef)
- **image_8**: Eighth input image (optional) (ImageRef)
- **image_9**: Ninth input image (optional) (ImageRef)
- **image_10**: Tenth input image (optional) (ImageRef)
- **max_width**: Maximum width of the video (int)
- **max_height**: Maximum height of the video (int)
- **interpolate**: Enable 2x interpolation using FILM (bool)
- **negative_prompt**: Things you do not want to see in your video (str)
- **color_correction**: If the colors are coming out strange, or if the colors between your input images are very different, disable this (bool)

## VideoMorpher

Generate a video that morphs between subjects, with an optional style

- **mode**: Determines if you produce a quick experimental video or an upscaled interpolated one. (small ~20s, medium ~60s, upscaled ~2min, upscaled-and-interpolated ~4min) (Mode)
- **seed**: Set a seed for reproducibility. Random by default. (int | None)
- **prompt**: The prompt has a small effect, but most of the video is driven by the subject images (str)
- **checkpoint**: The checkpoint to use for the model (Checkpoint)
- **style_image**: Apply the style from this image to the whole video (ImageRef)
- **aspect_ratio**: The aspect ratio of the video (Aspect_ratio)
- **style_strength**: How strong the style is applied (float)
- **use_controlnet**: Use geometric circles to guide the generation (bool)
- **negative_prompt**: What you do not want to see in the video (str)
- **subject_image_1**: The first subject of the video (ImageRef)
- **subject_image_2**: The second subject of the video (ImageRef)
- **subject_image_3**: The third subject of the video (ImageRef)
- **subject_image_4**: The fourth subject of the video (ImageRef)

## Zeroscope_V2_XL

Zeroscope V2 XL & 576w

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

