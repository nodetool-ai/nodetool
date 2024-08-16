# nodetool.nodes.stable_diffusion

## ControlNet

Generates images using Stable Diffusion with ControlNet for additional image control.
image, controlnet, generative AI, stable diffusion, high-resolution

Use cases:
- Generating images with specific structural guidance
- Creating images that follow edge maps or depth information
- Producing variations of images while maintaining certain features
- Enhancing image generation with additional control signals
- Creating high-resolution images with consistent controlled features

**Fields:**
model: CheckpointFile
prompt: str
negative_prompt: str
seed: int
guidance_scale: float
num_inference_steps: int
width: int
height: int
scheduler: Scheduler
sampler: Sampler
input_image: ImageRef
mask_image: ImageRef
grow_mask_by: int
denoise: float
canny_image: ImageRef
depth_image: ImageRef
canny_strength: float
depth_strength: float

## Flux

Generates images from text prompts using a custom Stable Diffusion workflow.

Use cases:
- Creating custom illustrations with specific model configurations
- Generating images with fine-tuned control over the sampling process
- Experimenting with different VAE, CLIP, and UNET combinations

**Fields:**
model: FluxModel
prompt: str
width: int
height: int
batch_size: int
steps: int
guidance_scale: float
realism_strength: float
scheduler: Scheduler
sampler: Sampler
denoise: float
input_image: ImageRef
noise_seed: int

## FluxModel

An enumeration.

## StableDiffusion

Generates images based on an input image and text prompts using Stable Diffusion.
image, image-to-image, generative AI, stable diffusion, high-resolution

Use cases:
- Modifying existing images based on text descriptions
- Applying artistic styles to photographs
- Generating variations of existing artwork or designs
- Enhancing or altering stock images for specific needs
- Creating high-resolution images from lower resolution inputs

**Fields:**
model: CheckpointFile
prompt: str
negative_prompt: str
seed: int
guidance_scale: float
num_inference_steps: int
width: int
height: int
scheduler: Scheduler
sampler: Sampler
input_image: ImageRef
mask_image: ImageRef
grow_mask_by: int
denoise: float

- [nodetool.nodes.stable_diffusion.enums](stable_diffusion/enums.md)
