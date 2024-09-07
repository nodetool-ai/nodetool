# nodetool.nodes.huggingface.video

## AnimateDiffNode

Generates animated GIFs using the AnimateDiff pipeline.

Use cases:
- Create animated visual content from text descriptions
- Generate dynamic visual effects for creative projects
- Produce animated illustrations for digital media

**Tags:** image, animation, generation, AI

**Fields:**
- **prompt**: A text prompt describing the desired animation. (str)
- **negative_prompt**: A text prompt describing what you don't want in the animation. (str)
- **num_frames**: The number of frames in the animation. (int)
- **guidance_scale**: Scale for classifier-free guidance. (float)
- **num_inference_steps**: The number of denoising steps. (int)
- **seed**: Seed for the random number generator. (int)

### initialize

**Args:**
- **context (ProcessingContext)**

### move_to_device

**Args:**
- **device (str)**


## StableVideoDiffusion

Generates a video from a single image using the Stable Video Diffusion model.

Use cases:
- Create short animations from static images
- Generate dynamic content for presentations or social media
- Prototype video ideas from still concept art

**Tags:** video, generation, AI, image-to-video, stable-diffusion

**Fields:**
- **input_image**: The input image to generate the video from, resized to 1024x576. (ImageRef)
- **num_frames**: Number of frames to generate. (int)
- **num_inference_steps**: Number of steps per generated frame (int)
- **fps**: Frames per second for the output video. (int)
- **decode_chunk_size**: Number of frames to decode at once. (int)
- **seed**: Random seed for generation. (int)

### initialize

**Args:**
- **context (ProcessingContext)**

### required_inputs

**Args:**


