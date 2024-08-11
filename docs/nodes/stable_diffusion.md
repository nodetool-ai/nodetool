# nodetool.nodes.stable_diffusion

## ControlNet

Generates images using Stable Diffusion with ControlNet for additional image control.

Use cases:
- Generating images with specific structural guidance
- Creating images that follow edge maps or depth information
- Producing variations of images while maintaining certain features
- Enhancing image generation with additional control signals

**Tags:** image, controlnet, generative AI, stable diffusion

- **model**: Stable Diffusion checkpoint to load. (CheckpointFile)
- **prompt**: The prompt to use. (str)
- **negative_prompt**: The negative prompt to use. (str)
- **seed** (int)
- **guidance_scale** (float)
- **num_inference_steps** (int)
- **width** (int)
- **height** (int)
- **scheduler** (Scheduler)
- **sampler** (Sampler)
- **input_image**: Input image for img2img (optional) (typing.Optional[nodetool.metadata.types.ImageRef])
- **denoise** (float)
- **canny_image**: Canny edge detection image for ControlNet (typing.Optional[nodetool.metadata.types.ImageRef])
- **depth_image**: Depth map image for ControlNet (typing.Optional[nodetool.metadata.types.ImageRef])
- **canny_strength**: Strength of Canny ControlNet (float)
- **depth_strength**: Strength of Depth ControlNet (float)

### initialize

**Args:**
- **context (ProcessingContext)**

## Flux

Generates images from text prompts using a custom Stable Diffusion workflow.

Use cases:
- Creating custom illustrations with specific model configurations
- Generating images with fine-tuned control over the sampling process
- Experimenting with different VAE, CLIP, and UNET combinations

**Tags:** image, text-to-image, generative AI, stable diffusion, custom workflow

- **prompt**: The prompt to use. (str)
- **width** (int)
- **height** (int)
- **batch_size** (int)
- **steps**: Number of sampling steps. (int)
- **scheduler** (Scheduler)
- **sampler** (Sampler)
- **noise_seed** (int)

### initialize

**Args:**
- **context (ProcessingContext)**

## HiResStableDiffusion

Generates high-resolution images based on an input image and text prompts using Stable Diffusion.
image, image-to-image, generative AI, stable diffusion

Use cases:
- Modifying existing images based on text descriptions
- Applying artistic styles to photographs
- Generating variations of existing artwork or designs
- Enhancing or altering stock images for specific needs

**Tags:** Works with 1.5 and XL models.

- **model**: Stable Diffusion checkpoint to load. (CheckpointFile)
- **prompt**: The prompt to use. (str)
- **negative_prompt**: The negative prompt to use. (str)
- **seed** (int)
- **guidance_scale** (float)
- **num_inference_steps** (int)
- **width** (int)
- **height** (int)
- **scheduler** (Scheduler)
- **sampler** (Sampler)
- **input_image**: Input image for img2img (optional) (ImageRef)
- **mask_image**: Mask image for img2img (optional) (ImageRef)
- **grow_mask_by** (int)
- **denoise** (float)
- **hires_model**: Hires model checkpoint to load. (CheckpointFile)
- **num_hires_steps** (int)
- **hires_denoise** (float)

### initialize

**Args:**
- **context (ProcessingContext)**

## StableDiffusion

Generates images based on an input image and text prompts using Stable Diffusion.
image, image-to-image, generative AI, stable diffusion

Use cases:
- Modifying existing images based on text descriptions
- Applying artistic styles to photographs
- Generating variations of existing artwork or designs
- Enhancing or altering stock images for specific needs

**Tags:** Works with 1.5 and XL models.

- **model**: Stable Diffusion checkpoint to load. (CheckpointFile)
- **prompt**: The prompt to use. (str)
- **negative_prompt**: The negative prompt to use. (str)
- **seed** (int)
- **guidance_scale** (float)
- **num_inference_steps** (int)
- **width** (int)
- **height** (int)
- **scheduler** (Scheduler)
- **sampler** (Sampler)
- **input_image**: Input image for img2img (optional) (ImageRef)
- **mask_image**: Mask image for img2img (optional) (ImageRef)
- **grow_mask_by** (int)
- **denoise** (float)

### initialize

**Args:**
- **context (ProcessingContext)**

- [nodetool.nodes.stable_diffusion.enums](stable_diffusion/enums.md)
