# nodetool.nodes.huggingface.stable_diffusion_base

## IPAdapter_SD15_Model

## IPAdapter_SDXL_Model

## StableDiffusionBaseNode

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
- **upscaler**: The upscaler to use for 2-pass generation. (StableDiffusionUpscaler)

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


## StableDiffusionDetailLevel

## StableDiffusionScheduler

## StableDiffusionUpscaler

## StableDiffusionXLBase

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


### get_scheduler_class

**Args:**
- **scheduler (StableDiffusionScheduler)**

### load_loras

**Args:**
- **pipeline (Any)**
- **loras (list[nodetool.metadata.types.HFLoraSDConfig] | list[nodetool.metadata.types.HFLoraSDXLConfig])**

### quantize_to_multiple_of_64

**Args:**
- **value**

### upscale_latents

Upscale latents using torch interpolation.


**Args:**

- **latents**: Input latents tensor of shape (B, C, H, W)
- **scale_factor**: Factor to scale dimensions by


**Returns:**

Upscaled latents tensor
**Args:**
- **latents (Tensor)**
- **scale_factor (int) (default: 2)**

**Returns:** Tensor

