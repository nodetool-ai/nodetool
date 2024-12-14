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

**Tags:** Supports optional high-resolution upscaling while maintaining the same ControlNet strength.

**Fields:**
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
- **canny_image**: Canny edge detection image for ControlNet (ImageRef)
- **depth_image**: Depth map image for ControlNet (ImageRef)
- **canny_strength**: Strength of Canny ControlNet (used for both low and high resolution) (float)
- **depth_strength**: Strength of Depth ControlNet (used for both low and high resolution) (float)

### apply_controlnet

**Args:**
- **context (ProcessingContext)**
- **width (int)**
- **height (int)**
- **conditioning (list)**

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

**Fields:**
- **model**: The Flux model to use. (UNetFile)
- **prompt**: The prompt to use. (str)
- **width** (int)
- **height** (int)
- **batch_size** (int)
- **steps**: Number of sampling steps. (int)
- **guidance_scale** (float)
- **scheduler** (Scheduler)
- **sampler** (Sampler)
- **denoise** (float)
- **input_image**: Input image for img2img (optional) (ImageRef)
- **noise_seed** (int)
- **lora**: The Lora model to use. (LORAFile)
- **lora_strength** (float)

### initialize

**Args:**
- **context (ProcessingContext)**

### move_to_device

**Args:**
- **device (str)**


## StableDiffusion

Generates images based on an input image and text prompts using Stable Diffusion.
image, image-to-image, generative AI, stable diffusion, high-resolution

Use cases:
- Modifying existing images based on text descriptions
- Applying artistic styles to photographs
- Generating variations of existing artwork or designs
- Enhancing or altering stock images for specific needs
- Creating high-resolution images from lower resolution inputs

**Tags:** Works with 1.5 and XL models. Supports optional high-resolution upscaling.

**Fields:**
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

### get_conditioning

**Args:**

### get_latent

**Args:**
- **context (ProcessingContext)**
- **width (int)**
- **height (int)**

### initialize

**Args:**
- **context (ProcessingContext)**

### sample

**Args:**
- **model**
- **latent**
- **positive**
- **negative**
- **num_steps**


- [nodetool.nodes.stable_diffusion.enums](stable_diffusion/enums.md)
