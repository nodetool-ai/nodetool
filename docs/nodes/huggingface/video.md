# nodetool.nodes.huggingface.video

## AnimateDiffNode

Generates animated GIFs using the AnimateDiff pipeline.

Use cases:
- Create animated visual content from text descriptions
- Generate dynamic visual effects for creative projects
- Produce animated illustrations for digital media

**Tags:** image, animation, generation, AI

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

