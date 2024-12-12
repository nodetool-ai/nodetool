# nodetool.nodes.huggingface.text_to_image

## Kandinsky3

Generates images using the Kandinsky-3 model from text prompts.

Use cases:
- Create detailed images from text descriptions
- Generate unique illustrations for creative projects
- Produce visual content for digital media and art
- Explore AI-generated imagery for concept development

**Tags:** image, generation, AI, text-to-image

**Fields:**
- **prompt**: A text prompt describing the desired image. (str)
- **num_inference_steps**: The number of denoising steps. (int)
- **width**: The width of the generated image. (int)
- **height**: The height of the generated image. (int)
- **seed**: Seed for the random number generator. Use -1 for a random seed. (int)

### get_model_id

**Args:**

### initialize

**Args:**
- **context (ProcessingContext)**

### move_to_device

**Args:**
- **device (str)**


## PixArtAlpha

Generates images from text prompts using the PixArt-Alpha model.

Use cases:
- Create unique images from detailed text descriptions
- Generate concept art for creative projects
- Produce visual content for digital media and marketing
- Explore AI-generated imagery for artistic inspiration

**Tags:** image, generation, AI, text-to-image

**Fields:**
- **prompt**: A text prompt describing the desired image. (str)
- **negative_prompt**: A text prompt describing what to avoid in the image. (str)
- **num_inference_steps**: The number of denoising steps. (int)
- **guidance_scale**: The scale for classifier-free guidance. (float)
- **width**: The width of the generated image. (int)
- **height**: The height of the generated image. (int)
- **seed**: Seed for the random number generator. Use -1 for a random seed. (int)

### initialize

**Args:**
- **context (ProcessingContext)**

### move_to_device

**Args:**
- **device (str)**


## PixArtSigma

Generates images from text prompts using the PixArt-Sigma model.

Use cases:
- Create unique images from detailed text descriptions
- Generate concept art for creative projects
- Produce visual content for digital media and marketing
- Explore AI-generated imagery for artistic inspiration

**Tags:** image, generation, AI, text-to-image

**Fields:**
- **prompt**: A text prompt describing the desired image. (str)
- **negative_prompt**: A text prompt describing what to avoid in the image. (str)
- **num_inference_steps**: The number of denoising steps. (int)
- **guidance_scale**: The scale for classifier-free guidance. (float)
- **width**: The width of the generated image. (int)
- **height**: The height of the generated image. (int)
- **seed**: Seed for the random number generator. Use -1 for a random seed. (int)

### initialize

**Args:**
- **context (ProcessingContext)**


## StableDiffusion

Generates images from text prompts using Stable Diffusion.

Use cases:
- Creating custom illustrations for various projects
- Generating concept art for creative endeavors
- Producing unique visual content for marketing materials
- Exploring AI-generated art for personal or professional use

**Tags:** image, generation, AI, text-to-image

**Fields:**
- **model**: The model to use for image generation. (HFStableDiffusion)
- **prompt**: The prompt for image generation. (str)
- **negative_prompt**: The negative prompt to guide what should not appear in the generated image. (str)
- **seed**: Seed for the random number generator. Use -1 for a random seed. (int)
- **num_inference_steps**: Number of denoising steps. (int)
- **guidance_scale**: Guidance scale for generation. (float)
- **scheduler**: The scheduler to use for the diffusion process. (StableDiffusionScheduler)
- **loras**: The LoRA models to use for image processing (list[nodetool.metadata.types.HFLoraSDConfig])
- **ip_adapter_model**: The IP adapter model to use for image processing (HFIPAdapter)
- **ip_adapter_image**: When provided the image will be fed into the IP adapter (ImageRef)
- **ip_adapter_scale**: The strength of the IP adapter (float)
- **detail_level**: Level of detail for the hi-res pass. 0.0 is low detail, 1.0 is high detail. (float)
- **enable_tiling**: Enable tiling for the VAE. This can reduce VRAM usage. (bool)
- **enable_cpu_offload**: Enable CPU offload for the pipeline. This can reduce VRAM usage. (bool)
- **width**: Width of the generated image. (int)
- **height**: Height of the generated image (int)

### initialize

**Args:**
- **context (ProcessingContext)**

### move_to_device

**Args:**
- **device (str)**

### pre_process

**Args:**
- **context (ProcessingContext)**

### progress_callback

**Args:**
- **context (ProcessingContext)**
- **offset (int | None) (default: None)**
- **total (int | None) (default: None)**

### run_pipeline

**Args:**
- **context (ProcessingContext)**
- **kwargs**

**Returns:** ImageRef

### should_skip_cache

**Args:**


## StableDiffusionXL

Generates images from text prompts using Stable Diffusion XL.

Use cases:
- Creating custom illustrations for marketing materials
- Generating concept art for game and film development
- Producing unique stock imagery for websites and publications
- Visualizing interior design concepts for clients

**Tags:** image, generation, AI, text-to-image

**Fields:**
- **model**: The Stable Diffusion XL model to use for generation. (HFStableDiffusionXL)
- **prompt**: The prompt for image generation. (str)
- **negative_prompt**: The negative prompt to guide what should not appear in the generated image. (str)
- **seed**: Seed for the random number generator. (int)
- **num_inference_steps**: Number of inference steps. (int)
- **guidance_scale**: Guidance scale for generation. (float)
- **width**: Width of the generated image. (int)
- **height**: Height of the generated image (int)
- **scheduler**: The scheduler to use for the diffusion process. (StableDiffusionScheduler)
- **loras**: The LoRA models to use for image processing (list[nodetool.metadata.types.HFLoraSDXLConfig])
- **lora_scale**: Strength of the LoRAs (float)
- **ip_adapter_model**: The IP adapter model to use for image processing (HFIPAdapter)
- **ip_adapter_image**: When provided the image will be fed into the IP adapter (ImageRef)
- **ip_adapter_scale**: Strength of the IP adapter image (float)
- **enable_tiling**: Enable tiling for the VAE. This can reduce VRAM usage. (bool)
- **enable_cpu_offload**: Enable CPU offload for the pipeline. This can reduce VRAM usage. (bool)

### initialize

**Args:**
- **context (ProcessingContext)**

### move_to_device

**Args:**
- **device (str)**

### pre_process

**Args:**
- **context (ProcessingContext)**

### progress_callback

**Args:**
- **context (ProcessingContext)**

### run_pipeline

**Args:**
- **context (ProcessingContext)**
- **kwargs**

**Returns:** ImageRef

### should_skip_cache

**Args:**


