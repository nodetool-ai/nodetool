# nodetool.nodes.huggingface.image_to_image

## BaseImageToImage

Base class for image-to-image transformation tasks.

**Tags:** image, transformation, generation, huggingface

**Fields:**
- **image**: The input image to transform (ImageRef)
- **prompt**: The text prompt to guide the image transformation (if applicable) (str)

### get_model_id

**Args:**

### initialize

**Args:**
- **context (ProcessingContext)**

### move_to_device

**Args:**
- **device (str)**

### required_inputs

**Args:**


## Kandinsky3Img2Img

Transforms existing images using the Kandinsky-3 model based on text prompts.

Use cases:
- Modify existing images based on text descriptions
- Apply specific styles or concepts to photographs or artwork
- Create variations of existing visual content
- Blend AI-generated elements with existing images

**Tags:** image, generation, image-to-image

**Fields:**
- **prompt**: A text prompt describing the desired image transformation. (str)
- **num_inference_steps**: The number of denoising steps. (int)
- **strength**: The strength of the transformation. Use a value between 0.0 and 1.0. (float)
- **image**: The input image to transform (ImageRef)
- **seed**: Seed for the random number generator. Use -1 for a random seed. (int)

### get_model_id

**Args:**

**Returns:** str

### initialize

**Args:**
- **context (ProcessingContext)**

### move_to_device

**Args:**
- **device (str)**

### required_inputs

**Args:**


## RealESRGANNode

Performs image super-resolution using the RealESRGAN model.

Use cases:
- Enhance low-resolution images
- Improve image quality for printing or display
- Upscale images for better detail

**Tags:** image, super-resolution, enhancement, huggingface

**Fields:**
- **image**: The input image to transform (ImageRef)
- **model**: The RealESRGAN model to use for image super-resolution (HFRealESRGAN)

### initialize

**Args:**
- **context (ProcessingContext)**

### move_to_device

**Args:**
- **device (str)**

### required_inputs

**Args:**


## StableDiffusionControlNetImg2ImgNode

Transforms existing images using Stable Diffusion with ControlNet guidance.

Use cases:
- Modify existing images with precise control over composition and structure
- Apply specific styles or concepts to photographs or artwork with guided transformations
- Create variations of existing visual content while maintaining certain features
- Enhance image editing capabilities with AI-guided transformations

**Tags:** image, generation, image-to-image, controlnet, SD

**Fields:**
- **model**: The model to use for image generation. (HFStableDiffusion)
- **prompt**: The prompt for image generation. (str)
- **negative_prompt**: The negative prompt to guide what should not appear in the generated image. (str)
- **seed**: Seed for the random number generator. Use -1 for a random seed. (int)
- **num_inference_steps**: Number of denoising steps. (int)
- **guidance_scale**: Guidance scale for generation. (float)
- **scheduler**: The scheduler to use for the diffusion process. (StableDiffusionScheduler)
- **loras**: The LoRA models to use for image processing (list)
- **ip_adapter_model**: The IP adapter model to use for image processing (HFIPAdapter)
- **ip_adapter_image**: When provided the image will be fed into the IP adapter (ImageRef)
- **ip_adapter_scale**: The strength of the IP adapter (float)
- **detail_level**: Level of detail for the hi-res pass. 0.0 is low detail, 1.0 is high detail. (float)
- **enable_tiling**: Enable tiling for the VAE. This can reduce VRAM usage. (bool)
- **enable_cpu_offload**: Enable CPU offload for the pipeline. This can reduce VRAM usage. (bool)
- **upscaler**: The upscaler to use for 2-pass generation. (StableDiffusionUpscaler)
- **image**: The input image to be transformed. (ImageRef)
- **strength**: Similarity to the input image (float)
- **controlnet**: The ControlNet model to use for guidance. (HFControlNet)
- **control_image**: The control image to guide the transformation. (ImageRef)

### initialize

**Args:**
- **context (ProcessingContext)**

### required_inputs

**Args:**


## StableDiffusionControlNetInpaintNode

Performs inpainting on images using Stable Diffusion with ControlNet guidance.

Use cases:
- Remove unwanted objects from images with precise control
- Fill in missing parts of images guided by control images
- Modify specific areas of images while preserving the rest and maintaining structure

**Tags:** image, inpainting, controlnet, SD

**Fields:**
- **model**: The model to use for image generation. (HFStableDiffusion)
- **prompt**: The prompt for image generation. (str)
- **negative_prompt**: The negative prompt to guide what should not appear in the generated image. (str)
- **seed**: Seed for the random number generator. Use -1 for a random seed. (int)
- **num_inference_steps**: Number of denoising steps. (int)
- **guidance_scale**: Guidance scale for generation. (float)
- **scheduler**: The scheduler to use for the diffusion process. (StableDiffusionScheduler)
- **loras**: The LoRA models to use for image processing (list)
- **ip_adapter_model**: The IP adapter model to use for image processing (HFIPAdapter)
- **ip_adapter_image**: When provided the image will be fed into the IP adapter (ImageRef)
- **ip_adapter_scale**: The strength of the IP adapter (float)
- **detail_level**: Level of detail for the hi-res pass. 0.0 is low detail, 1.0 is high detail. (float)
- **enable_tiling**: Enable tiling for the VAE. This can reduce VRAM usage. (bool)
- **enable_cpu_offload**: Enable CPU offload for the pipeline. This can reduce VRAM usage. (bool)
- **upscaler**: The upscaler to use for 2-pass generation. (StableDiffusionUpscaler)
- **controlnet**: The ControlNet model to use for guidance. (StableDiffusionControlNetModel)
- **init_image**: The initial image to be inpainted. (ImageRef)
- **mask_image**: The mask image indicating areas to be inpainted. (ImageRef)
- **control_image**: The control image to guide the inpainting process. (ImageRef)
- **controlnet_conditioning_scale**: The scale for ControlNet conditioning. (float)

### initialize

**Args:**
- **context (ProcessingContext)**

### required_inputs

**Args:**


## StableDiffusionControlNetNode

Generates images using Stable Diffusion with ControlNet guidance.

Use cases:
- Generate images with precise control over composition and structure
- Create variations of existing images while maintaining specific features
- Artistic image generation with guided outputs

**Tags:** image, generation, text-to-image, controlnet, SD

**Fields:**
- **model**: The model to use for image generation. (HFStableDiffusion)
- **prompt**: The prompt for image generation. (str)
- **negative_prompt**: The negative prompt to guide what should not appear in the generated image. (str)
- **seed**: Seed for the random number generator. Use -1 for a random seed. (int)
- **num_inference_steps**: Number of denoising steps. (int)
- **guidance_scale**: Guidance scale for generation. (float)
- **scheduler**: The scheduler to use for the diffusion process. (StableDiffusionScheduler)
- **loras**: The LoRA models to use for image processing (list)
- **ip_adapter_model**: The IP adapter model to use for image processing (HFIPAdapter)
- **ip_adapter_image**: When provided the image will be fed into the IP adapter (ImageRef)
- **ip_adapter_scale**: The strength of the IP adapter (float)
- **detail_level**: Level of detail for the hi-res pass. 0.0 is low detail, 1.0 is high detail. (float)
- **enable_tiling**: Enable tiling for the VAE. This can reduce VRAM usage. (bool)
- **enable_cpu_offload**: Enable CPU offload for the pipeline. This can reduce VRAM usage. (bool)
- **upscaler**: The upscaler to use for 2-pass generation. (StableDiffusionUpscaler)
- **controlnet**: The ControlNet model to use for guidance. (HFControlNet)
- **control_image**: The control image to guide the generation process. (ImageRef)
- **controlnet_conditioning_scale**: The scale for ControlNet conditioning. (float)

### initialize

**Args:**
- **context (ProcessingContext)**

### move_to_device

**Args:**
- **device (str)**

### required_inputs

**Args:**


## StableDiffusionImg2ImgNode

Transforms existing images based on text prompts using Stable Diffusion.

Use cases:
- Modifying existing images to fit a specific style or theme
- Enhancing or altering photographs
- Creating variations of existing artwork
- Applying text-guided edits to images

**Tags:** image, generation, image-to-image, SD, img2img

**Fields:**
- **model**: The model to use for image generation. (HFStableDiffusion)
- **prompt**: The prompt for image generation. (str)
- **negative_prompt**: The negative prompt to guide what should not appear in the generated image. (str)
- **seed**: Seed for the random number generator. Use -1 for a random seed. (int)
- **num_inference_steps**: Number of denoising steps. (int)
- **guidance_scale**: Guidance scale for generation. (float)
- **scheduler**: The scheduler to use for the diffusion process. (StableDiffusionScheduler)
- **loras**: The LoRA models to use for image processing (list)
- **ip_adapter_model**: The IP adapter model to use for image processing (HFIPAdapter)
- **ip_adapter_image**: When provided the image will be fed into the IP adapter (ImageRef)
- **ip_adapter_scale**: The strength of the IP adapter (float)
- **detail_level**: Level of detail for the hi-res pass. 0.0 is low detail, 1.0 is high detail. (float)
- **enable_tiling**: Enable tiling for the VAE. This can reduce VRAM usage. (bool)
- **enable_cpu_offload**: Enable CPU offload for the pipeline. This can reduce VRAM usage. (bool)
- **upscaler**: The upscaler to use for 2-pass generation. (StableDiffusionUpscaler)
- **init_image**: The initial image for Image-to-Image generation. (ImageRef)
- **strength**: Strength for Image-to-Image generation. Higher values allow for more deviation from the original image. (float)

### initialize

**Args:**
- **context (ProcessingContext)**

### required_inputs

**Args:**


## StableDiffusionInpaintNode

Performs inpainting on images using Stable Diffusion.

Use cases:
- Remove unwanted objects from images
- Fill in missing parts of images
- Modify specific areas of images while preserving the rest

**Tags:** image, inpainting, AI, SD

**Fields:**
- **model**: The model to use for image generation. (HFStableDiffusion)
- **prompt**: The prompt for image generation. (str)
- **negative_prompt**: The negative prompt to guide what should not appear in the generated image. (str)
- **seed**: Seed for the random number generator. Use -1 for a random seed. (int)
- **num_inference_steps**: Number of denoising steps. (int)
- **guidance_scale**: Guidance scale for generation. (float)
- **scheduler**: The scheduler to use for the diffusion process. (StableDiffusionScheduler)
- **loras**: The LoRA models to use for image processing (list)
- **ip_adapter_model**: The IP adapter model to use for image processing (HFIPAdapter)
- **ip_adapter_image**: When provided the image will be fed into the IP adapter (ImageRef)
- **ip_adapter_scale**: The strength of the IP adapter (float)
- **detail_level**: Level of detail for the hi-res pass. 0.0 is low detail, 1.0 is high detail. (float)
- **enable_tiling**: Enable tiling for the VAE. This can reduce VRAM usage. (bool)
- **enable_cpu_offload**: Enable CPU offload for the pipeline. This can reduce VRAM usage. (bool)
- **upscaler**: The upscaler to use for 2-pass generation. (StableDiffusionUpscaler)
- **init_image**: The initial image to be inpainted. (ImageRef)
- **mask_image**: The mask image indicating areas to be inpainted. (ImageRef)
- **strength**: Strength for inpainting. Higher values allow for more deviation from the original image. (float)

### initialize

**Args:**
- **context (ProcessingContext)**

### required_inputs

**Args:**


## StableDiffusionUpscale

Upscales an image using Stable Diffusion 4x upscaler.

Use cases:
- Enhance low-resolution images
- Improve image quality for printing or display
- Create high-resolution versions of small images

**Tags:** image, upscaling, stable-diffusion, SD

**Fields:**
- **prompt**: The prompt for image generation. (str)
- **negative_prompt**: The negative prompt to guide what should not appear in the generated image. (str)
- **num_inference_steps**: Number of upscaling steps. (int)
- **guidance_scale**: Guidance scale for generation. (float)
- **image**: The initial image for Image-to-Image generation. (ImageRef)
- **scheduler**: The scheduler to use for the diffusion process. (StableDiffusionScheduler)
- **seed**: Seed for the random number generator. Use -1 for a random seed. (int)
- **enable_tiling**: Enable tiling to save VRAM (bool)

### initialize

**Args:**
- **context (ProcessingContext)**

### move_to_device

**Args:**
- **device (str)**

### required_inputs

**Args:**


## StableDiffusionXLControlNetNode

Transforms existing images using Stable Diffusion XL with ControlNet guidance.

Use cases:
- Modify existing images with precise control over composition and structure
- Apply specific styles or concepts to photographs or artwork with guided transformations
- Create variations of existing visual content while maintaining certain features
- Enhance image editing capabilities with AI-guided transformations

**Tags:** image, generation, image-to-image, controlnet, SDXL

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
- **loras**: The LoRA models to use for image processing (list)
- **lora_scale**: Strength of the LoRAs (float)
- **ip_adapter_model**: The IP adapter model to use for image processing (HFIPAdapter)
- **ip_adapter_image**: When provided the image will be fed into the IP adapter (ImageRef)
- **ip_adapter_scale**: Strength of the IP adapter image (float)
- **enable_tiling**: Enable tiling for the VAE. This can reduce VRAM usage. (bool)
- **enable_cpu_offload**: Enable CPU offload for the pipeline. This can reduce VRAM usage. (bool)
- **init_image**: The initial image for Image-to-Image generation. (ImageRef)
- **strength**: Strength for Image-to-Image generation. Higher values allow for more deviation from the original image. (float)
- **controlnet**: The ControlNet model to use for guidance. (HFControlNet)
- **control_image**: The control image to guide the transformation. (ImageRef)
- **controlnet_conditioning_scale**: The scale for ControlNet conditioning. (float)

### initialize

**Args:**
- **context (ProcessingContext)**

### required_inputs

**Args:**


## StableDiffusionXLImg2Img

Transforms existing images based on text prompts using Stable Diffusion XL.

Use cases:
- Modifying existing images to fit a specific style or theme
- Enhancing or altering photographs
- Creating variations of existing artwork
- Applying text-guided edits to images

**Tags:** image, generation, image-to-image, SDXL

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
- **loras**: The LoRA models to use for image processing (list)
- **lora_scale**: Strength of the LoRAs (float)
- **ip_adapter_model**: The IP adapter model to use for image processing (HFIPAdapter)
- **ip_adapter_image**: When provided the image will be fed into the IP adapter (ImageRef)
- **ip_adapter_scale**: Strength of the IP adapter image (float)
- **enable_tiling**: Enable tiling for the VAE. This can reduce VRAM usage. (bool)
- **enable_cpu_offload**: Enable CPU offload for the pipeline. This can reduce VRAM usage. (bool)
- **init_image**: The initial image for Image-to-Image generation. (ImageRef)
- **strength**: Strength for Image-to-Image generation. Higher values allow for more deviation from the original image. (float)

### initialize

**Args:**
- **context (ProcessingContext)**

### required_inputs

**Args:**


## StableDiffusionXLInpainting

Performs inpainting on images using Stable Diffusion XL.

Use cases:
- Remove unwanted objects from images
- Fill in missing parts of images
- Modify specific areas of images while preserving the rest

**Tags:** image, inpainting, SDXL

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
- **loras**: The LoRA models to use for image processing (list)
- **lora_scale**: Strength of the LoRAs (float)
- **ip_adapter_model**: The IP adapter model to use for image processing (HFIPAdapter)
- **ip_adapter_image**: When provided the image will be fed into the IP adapter (ImageRef)
- **ip_adapter_scale**: Strength of the IP adapter image (float)
- **enable_tiling**: Enable tiling for the VAE. This can reduce VRAM usage. (bool)
- **enable_cpu_offload**: Enable CPU offload for the pipeline. This can reduce VRAM usage. (bool)
- **image**: The initial image to be inpainted. (ImageRef)
- **mask_image**: The mask image indicating areas to be inpainted. (ImageRef)
- **strength**: Strength for inpainting. Higher values allow for more deviation from the original image. (float)

### initialize

**Args:**
- **context (ProcessingContext)**

### required_inputs

**Args:**


## Swin2SR

Performs image super-resolution using the Swin2SR model.

Use cases:
- Enhance low-resolution images
- Improve image quality for printing or display
- Upscale images for better detail

**Tags:** image, super-resolution, enhancement, huggingface

**Fields:**
- **image**: The input image to transform (ImageRef)
- **prompt**: The text prompt to guide the image transformation (if applicable) (str)
- **model**: The model ID to use for image super-resolution (HFImageToImage)

### get_model_id

**Args:**


