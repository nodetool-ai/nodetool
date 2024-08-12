# nodetool.nodes.huggingface.image

## AuraFlow

Generates images using the AuraFlow pipeline.

Use cases:
- Create unique images from text descriptions
- Generate illustrations for creative projects
- Produce visual content for digital media

**Tags:** image, generation, AI, text-to-image

- **prompt**: A text prompt describing the desired image. (str)
- **negative_prompt**: A text prompt describing what to avoid in the image. (str)
- **guidance_scale**: The guidance scale for the transformation. (float)
- **num_inference_steps**: The number of denoising steps. (int)
- **width**: The width of the generated image. (int)
- **height**: The height of the generated image. (int)
- **seed**: Seed for the random number generator. Use -1 for a random seed. (int)

### initialize

**Args:**
- **context (ProcessingContext)**

### move_to_device

**Args:**
- **device (str)**

## BaseImageToImage

Base class for image-to-image transformation tasks.

**Tags:** image, transformation, generation, huggingface

- **inputs**: The input image to transform (ImageRef)
- **prompt**: The text prompt to guide the image transformation (if applicable) (str)

### get_inputs

**Args:**
- **context (ProcessingContext)**

### process_local_result

**Args:**
- **context (ProcessingContext)**
- **result (typing.Any)**

**Returns:** ImageRef

### process_remote_result

**Args:**
- **context (ProcessingContext)**
- **result (typing.Any)**

**Returns:** ImageRef

## DepthEstimation

Estimates depth from a single image.

Use cases:
- Generate depth maps for 3D modeling
- Assist in augmented reality applications
- Enhance computer vision systems for robotics
- Improve scene understanding in autonomous vehicles

**Tags:** image, depth estimation, 3D, huggingface

- **model**: The model ID to use for depth estimation (DepthEstimationModelId)
- **inputs**: The input image for depth estimation (ImageRef)

### get_inputs

**Args:**
- **context (ProcessingContext)**

### get_model_id

**Args:**

### process_local_result

**Args:**
- **context (ProcessingContext)**
- **result (typing.Any)**

**Returns:** ImageRef

### process_remote_result

**Args:**
- **context (ProcessingContext)**
- **result (typing.Any)**

**Returns:** ImageRef

## FindSegment

Extracts a specific segment from a list of segmentation masks.

- **segments**: The segmentation masks to search (list)
- **segment_label**: The label of the segment to extract (str)

## IPAdapter_SD15_Model

An enumeration.

## IPAdapter_SDXL_Model

An enumeration.

## ImageClassifier

Classifies images into predefined categories.

Use cases:
- Content moderation by detecting inappropriate images
- Organizing photo libraries by automatically tagging images
- Visual quality control in manufacturing to identify defective products
- Medical image analysis to assist in diagnosing conditions

**Tags:** image, classification, labeling, categorization

- **model**: The model ID to use for the classification (ImageClassifierModelId)
- **inputs**: The input image to classify (ImageRef)

### get_inputs

**Args:**
- **context (ProcessingContext)**

### get_model_id

**Args:**

### process_local_result

**Args:**
- **context (ProcessingContext)**
- **result (typing.Any)**

**Returns:** dict

### process_remote_result

**Args:**
- **context (ProcessingContext)**
- **result (typing.Any)**

**Returns:** dict

## InstructPix2Pix

Performs image editing based on text instructions using the InstructPix2Pix model.

Use cases:
- Apply specific edits to images based on text instructions
- Modify image content or style guided by text prompts
- Create variations of existing images with controlled changes

**Tags:** image, editing, transformation, huggingface

- **inputs**: The input image to transform (ImageRef)
- **prompt**: The text prompt to guide the image transformation. (str)
- **negative_prompt**: The negative text prompt to avoid in the transformation. (str)
- **num_inference_steps**: The number of denoising steps. (int)
- **guidance_scale**: The guidance scale for the transformation. (float)
- **image_guidance_scale**: The image guidance scale for the transformation. (float)

### get_model_id

**Args:**

### get_params

**Args:**

## Kandinsky2

Generates images using the Kandinsky 2.2 model from text prompts.

Use cases:
- Create high-quality images from text descriptions
- Generate detailed illustrations for creative projects
- Produce visual content for digital media and art
- Explore AI-generated imagery for concept development

**Tags:** image, generation, AI, text-to-image

- **prompt**: A text prompt describing the desired image. (str)
- **negative_prompt**: A text prompt describing what to avoid in the image. (str)
- **num_inference_steps**: The number of denoising steps. (int)
- **width**: The width of the generated image. (int)
- **height**: The height of the generated image. (int)
- **seed**: Seed for the random number generator. Use -1 for a random seed. (int)

### initialize

**Args:**
- **context (ProcessingContext)**

## Kandinsky2ControlNet

Transforms existing images based on text prompts and control images using the Kandinsky 2.2 model with ControlNet.

Use cases:
- Transform existing images based on text prompts with precise control
- Apply specific styles or concepts to existing images guided by control images
- Modify photographs or artworks with AI-generated elements while maintaining specific structures
- Create variations of existing visual content with controlled transformations

**Tags:** image, generation, AI, image-to-image, controlnet

- **prompt**: The prompt to guide the image generation. (str)
- **negative_prompt**: The prompt not to guide the image generation. (str)
- **hint**: The controlnet condition image. (ImageRef)
- **height**: The height in pixels of the generated image. (int)
- **width**: The width in pixels of the generated image. (int)
- **num_inference_steps**: The number of denoising steps. (int)
- **guidance_scale**: Guidance scale as defined in Classifier-Free Diffusion Guidance. (float)
- **seed**: Seed for the random number generator. Use -1 for a random seed. (int)
- **output_type**: The output format of the generated image. (str)

### initialize

**Args:**
- **context (ProcessingContext)**

## Kandinsky2Img2Img

Transforms existing images based on text prompts using the Kandinsky 2.2 model.

Use cases:
- Transform existing images based on text prompts
- Apply specific styles or concepts to existing images
- Modify photographs or artworks with AI-generated elements
- Create variations of existing visual content

**Tags:** image, generation, AI, image-to-image

- **prompt**: A text prompt describing the desired image transformation. (str)
- **negative_prompt**: A text prompt describing what to avoid in the image. (str)
- **num_inference_steps**: The number of denoising steps. (int)
- **strength**: The strength of the transformation. Use a value between 0.0 and 1.0. (float)
- **image**: The input image to transform (ImageRef)
- **seed**: Seed for the random number generator. Use -1 for a random seed. (int)

### initialize

**Args:**
- **context (ProcessingContext)**

## Kandinsky3

Generates images using the Kandinsky-3 model from text prompts.

Use cases:
- Create detailed images from text descriptions
- Generate unique illustrations for creative projects
- Produce visual content for digital media and art
- Explore AI-generated imagery for concept development

**Tags:** image, generation, AI, text-to-image

- **prompt**: A text prompt describing the desired image. (str)
- **num_inference_steps**: The number of denoising steps. (int)
- **width**: The width of the generated image. (int)
- **height**: The height of the generated image. (int)
- **seed**: Seed for the random number generator. Use -1 for a random seed. (int)

### initialize

**Args:**
- **context (ProcessingContext)**

### move_to_device

**Args:**
- **device (str)**

## Kandinsky3Img2Img

Transforms existing images using the Kandinsky-3 model based on text prompts.

Use cases:
- Modify existing images based on text descriptions
- Apply specific styles or concepts to photographs or artwork
- Create variations of existing visual content
- Blend AI-generated elements with existing images

**Tags:** image, generation, AI, image-to-image

- **prompt**: A text prompt describing the desired image transformation. (str)
- **num_inference_steps**: The number of denoising steps. (int)
- **strength**: The strength of the transformation. Use a value between 0.0 and 1.0. (float)
- **image**: The input image to transform (ImageRef)
- **seed**: Seed for the random number generator. Use -1 for a random seed. (int)

### initialize

**Args:**
- **context (ProcessingContext)**

### move_to_device

**Args:**
- **device (str)**

## ObjectDetection

Detects and localizes objects in images.

Use cases:
- Identify and count objects in images
- Locate specific items in complex scenes
- Assist in autonomous vehicle vision systems
- Enhance security camera footage analysis

**Tags:** image, object detection, bounding boxes, huggingface

- **model**: The model ID to use for object detection (ObjectDetectionModelId)
- **inputs**: The input image for object detection (ImageRef)
- **threshold**: Minimum confidence score for detected objects (float)
- **top_k**: The number of top predictions to return (int)

### get_inputs

**Args:**
- **context (ProcessingContext)**

### get_model_id

**Args:**

### get_params

**Args:**

### process_local_result

**Args:**
- **context (ProcessingContext)**
- **result (typing.Any)**

**Returns:** list

## PixArtAlpha

Generates images from text prompts using the PixArt-Alpha model.

Use cases:
- Create unique images from detailed text descriptions
- Generate concept art for creative projects
- Produce visual content for digital media and marketing
- Explore AI-generated imagery for artistic inspiration

**Tags:** image, generation, AI, text-to-image

- **prompt**: A text prompt describing the desired image. (str)
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

## RealESRGAN

Performs image super-resolution using the Real-ESRGAN model.

Use cases:
- Enhance low-resolution images
- Restore details in blurry or pixelated images
- Improve visual quality of old or compressed images

**Tags:** image, super-resolution, enhancement, huggingface

- **inputs**: The input image to transform (ImageRef)
- **prompt**: The text prompt to guide the image transformation (if applicable) (str)

### get_model_id

**Args:**

### get_params

**Args:**

## SDXLInpainting

Performs inpainting on images using Stable Diffusion XL.

Use cases:
- Removing unwanted objects from images
- Adding new elements to existing images
- Repairing damaged or incomplete images
- Creating creative image edits and modifications

**Tags:** image, inpainting, AI, image-editing

- **prompt**: The prompt describing what to paint in the masked area. (str)
- **image**: The input image to be inpainted. (ImageRef)
- **mask_image**: The mask image indicating the area to be inpainted. (ImageRef)
- **negative_prompt**: The negative prompt to guide what should not appear in the inpainted area. (str)
- **num_inference_steps**: Number of denoising steps. Values between 15 and 30 work well. (int)
- **guidance_scale**: Guidance scale for generation. (float)
- **strength**: Strength of the inpainting. Values below 1.0 work best. (float)
- **seed**: Seed for the random number generator. Use -1 for a random seed. (int)

### initialize

**Args:**
- **context (ProcessingContext)**

### move_to_device

**Args:**
- **device (str)**

## SDXLTurbo

Generates images from text prompts using SDXL Turbo.

Use cases:
- Rapid prototyping of visual concepts
- Real-time image generation for interactive applications
- Quick visualization of ideas for brainstorming sessions
- Creating multiple variations of an image concept quickly

**Tags:** image, generation, AI, text-to-image, fast

- **model**: The SDXL Turbo model to use for generation. (SDXLTurboModelId)
- **prompt**: The prompt for image generation. (str)
- **seed**: Seed for the random number generator. (int)
- **num_inference_steps**: Number of inference steps. (int)
- **guidance_scale**: Guidance scale for generation. (float)
- **width**: Width of the generated image. (int)
- **height**: Height of the generated image (int)

### initialize

**Args:**
- **context (ProcessingContext)**

### move_to_device

**Args:**
- **device (str)**

## SDXLTurboImg2Img

Transforms existing images based on text prompts using SDXL Turbo.

Use cases:
- Modifying existing images to fit a specific style or theme
- Enhancing or altering stock photos for unique marketing materials
- Transforming rough sketches into detailed illustrations
- Creating variations of existing artwork or designs

**Tags:** image, generation, AI, image-to-image

- **model**: The SDXL Turbo model to use for generation. (SDXLTurboModelId)
- **prompt**: The prompt for image generation. (str)
- **init_image**: The initial image for Image-to-Image generation. (ImageRef)
- **seed**: Seed for the random number generator. (int)
- **num_inference_steps**: Number of inference steps. (int)
- **guidance_scale**: Guidance scale for generation. (float)
- **width**: Width of the generated image. (int)
- **height**: Height of the generated image (int)
- **strength**: Strength for Image-to-Image generation. (float)

### initialize

**Args:**
- **context (ProcessingContext)**

### move_to_device

**Args:**
- **device (str)**

## SDXLTurboModelId

An enumeration.

## Segmentation

Performs semantic segmentation on images, identifying and labeling different regions.

Use cases:
- Segmenting objects in images
- Segmenting facial features in images

**Tags:** image, segmentation, object detection, scene parsing

- **model**: The model ID to use for the segmentation (SegmentationModelId)
- **image**: The input image to segment (ImageRef)

### get_inputs

**Args:**
- **context (ProcessingContext)**

### get_model_id

**Args:**

### process_local_result

**Args:**
- **context (ProcessingContext)**
- **result (typing.Any)**

**Returns:** list

## StableCascade

Generates images using the Stable Cascade model, which involves a two-stage process with a prior and a decoder.

Use cases:
- Create high-quality images from text descriptions
- Generate detailed illustrations for creative projects
- Produce visual content for digital media and art

**Tags:** image, generation, AI, text-to-image

- **prompt**: A text prompt describing the desired image. (str)
- **negative_prompt**: A text prompt describing what to avoid in the image. (str)
- **width**: The width of the generated image. (int)
- **height**: The height of the generated image. (int)
- **prior_num_inference_steps**: The number of denoising steps for the prior. (int)
- **decoder_num_inference_steps**: The number of denoising steps for the decoder. (int)
- **prior_guidance_scale**: Guidance scale for the prior. (float)
- **decoder_guidance_scale**: Guidance scale for the decoder. (float)
- **seed**: Seed for the random number generator. Use -1 for a random seed. (int)

### initialize

**Args:**
- **context (ProcessingContext)**

### move_to_device

**Args:**
- **device (str)**

## StableDiffusion

Generates images from text prompts using Stable Diffusion.

Use cases:
- Creating custom illustrations for various projects
- Generating concept art for creative endeavors
- Producing unique visual content for marketing materials
- Exploring AI-generated art for personal or professional use

**Tags:** image, generation, AI, text-to-image

- **prompt**: The prompt for image generation. (str)
- **negative_prompt**: The negative prompt to guide what should not appear in the generated image. (str)
- **seed**: Seed for the random number generator. Use -1 for a random seed. (int)
- **num_inference_steps**: Number of denoising steps. (int)
- **guidance_scale**: Guidance scale for generation. (float)
- **scheduler**: The scheduler to use for the diffusion process. (StableDiffusionScheduler)
- **ip_adapter_model**: The IP adapter model to use for image processing (IPAdapter_SD15_Model)
- **ip_adapter_image**: When provided the image will be fed into the IP adapter (ImageRef)
- **ip_adapter_scale**: Strength of the IP adapter image (float)
- **model**: The Stable Diffusion model to use for generation. (StableDiffusionModelId)
- **width**: Width of the generated image. (int)
- **height**: Height of the generated image (int)

### initialize

**Args:**
- **context (ProcessingContext)**

### move_to_device

**Args:**
- **device (str)**

### progress_callback

**Args:**
- **context (ProcessingContext)**

## StableDiffusion3ControlNetNode

Generates images using Stable Diffusion 3 with ControlNet.

Use cases:
- Generate images with precise control over composition and structure
- Create variations of existing images while maintaining specific features
- Artistic image generation with guided outputs

**Tags:** image, generation, AI, text-to-image, controlnet

- **prompt**: A text prompt describing the desired image. (str)
- **control_model**: The ControlNet model to use for image generation. (StableDiffusion3ControlNetModelId)
- **control_image**: The control image to guide the generation process. (ImageRef)
- **controlnet_conditioning_scale**: The scale of the ControlNet conditioning. (float)
- **num_inference_steps**: The number of denoising steps. (int)
- **seed**: Seed for the random number generator. Use -1 for a random seed. (int)

### initialize

**Args:**
- **context (ProcessingContext)**

### move_to_device

**Args:**
- **device (str)**

## StableDiffusionBaseNode

- **prompt**: The prompt for image generation. (str)
- **negative_prompt**: The negative prompt to guide what should not appear in the generated image. (str)
- **seed**: Seed for the random number generator. Use -1 for a random seed. (int)
- **num_inference_steps**: Number of denoising steps. (int)
- **guidance_scale**: Guidance scale for generation. (float)
- **scheduler**: The scheduler to use for the diffusion process. (StableDiffusionScheduler)
- **ip_adapter_model**: The IP adapter model to use for image processing (IPAdapter_SD15_Model)
- **ip_adapter_image**: When provided the image will be fed into the IP adapter (ImageRef)
- **ip_adapter_scale**: Strength of the IP adapter image (float)

### initialize

**Args:**
- **context (ProcessingContext)**

### move_to_device

**Args:**
- **device (str)**

### progress_callback

**Args:**
- **context (ProcessingContext)**

## StableDiffusionControlNetImg2ImgNode

Transforms existing images using Stable Diffusion with ControlNet guidance.

Use cases:
- Modify existing images with precise control over composition and structure
- Apply specific styles or concepts to photographs or artwork with guided transformations
- Create variations of existing visual content while maintaining certain features
- Enhance image editing capabilities with AI-guided transformations

**Tags:** image, generation, AI, image-to-image, controlnet

- **prompt**: The prompt for image generation. (str)
- **negative_prompt**: The negative prompt to guide what should not appear in the generated image. (str)
- **seed**: Seed for the random number generator. Use -1 for a random seed. (int)
- **num_inference_steps**: Number of denoising steps. (int)
- **guidance_scale**: Guidance scale for generation. (float)
- **scheduler**: The scheduler to use for the diffusion process. (StableDiffusionScheduler)
- **ip_adapter_model**: The IP adapter model to use for image processing (IPAdapter_SD15_Model)
- **ip_adapter_image**: When provided the image will be fed into the IP adapter (ImageRef)
- **ip_adapter_scale**: Strength of the IP adapter image (float)
- **model**: The Stable Diffusion model to use for generation. (StableDiffusionModelId)
- **controlnet**: The ControlNet model to use for guidance. (StableDiffusionControlNetModel)
- **image**: The input image to be transformed. (ImageRef)
- **control_image**: The control image to guide the transformation. (ImageRef)

### initialize

**Args:**
- **context (ProcessingContext)**

## StableDiffusionControlNetInpaintNode

Performs inpainting on images using Stable Diffusion with ControlNet guidance.

Use cases:
- Remove unwanted objects from images with precise control
- Fill in missing parts of images guided by control images
- Modify specific areas of images while preserving the rest and maintaining structure

**Tags:** image, inpainting, AI, controlnet

- **prompt**: The prompt for image generation. (str)
- **negative_prompt**: The negative prompt to guide what should not appear in the generated image. (str)
- **seed**: Seed for the random number generator. Use -1 for a random seed. (int)
- **num_inference_steps**: Number of denoising steps. (int)
- **guidance_scale**: Guidance scale for generation. (float)
- **scheduler**: The scheduler to use for the diffusion process. (StableDiffusionScheduler)
- **ip_adapter_model**: The IP adapter model to use for image processing (IPAdapter_SD15_Model)
- **ip_adapter_image**: When provided the image will be fed into the IP adapter (ImageRef)
- **ip_adapter_scale**: Strength of the IP adapter image (float)
- **model**: The Stable Diffusion model to use for generation. (StableDiffusionModelId)
- **controlnet**: The ControlNet model to use for guidance. (StableDiffusionControlNetModel)
- **init_image**: The initial image to be inpainted. (ImageRef)
- **mask_image**: The mask image indicating areas to be inpainted. (ImageRef)
- **control_image**: The control image to guide the inpainting process. (ImageRef)
- **controlnet_conditioning_scale**: The scale for ControlNet conditioning. (float)

### initialize

**Args:**
- **context (ProcessingContext)**

## StableDiffusionControlNetModel

An enumeration.

## StableDiffusionControlNetNode

Generates images using Stable Diffusion with ControlNet guidance.

Use cases:
- Generate images with precise control over composition and structure
- Create variations of existing images while maintaining specific features
- Artistic image generation with guided outputs

**Tags:** image, generation, AI, text-to-image, controlnet

- **prompt**: The prompt for image generation. (str)
- **negative_prompt**: The negative prompt to guide what should not appear in the generated image. (str)
- **seed**: Seed for the random number generator. Use -1 for a random seed. (int)
- **num_inference_steps**: Number of denoising steps. (int)
- **guidance_scale**: Guidance scale for generation. (float)
- **scheduler**: The scheduler to use for the diffusion process. (StableDiffusionScheduler)
- **ip_adapter_model**: The IP adapter model to use for image processing (IPAdapter_SD15_Model)
- **ip_adapter_image**: When provided the image will be fed into the IP adapter (ImageRef)
- **ip_adapter_scale**: Strength of the IP adapter image (float)
- **model**: The Stable Diffusion model to use for generation. (StableDiffusionModelId)
- **controlnet**: The ControlNet model to use for guidance. (StableDiffusionControlNetModel)
- **control_image**: The control image to guide the generation process. (ImageRef)
- **controlnet_conditioning_scale**: The scale for ControlNet conditioning. (float)

### initialize

**Args:**
- **context (ProcessingContext)**

## StableDiffusionImg2ImgNode

Transforms existing images based on text prompts using Stable Diffusion.

Use cases:
- Modifying existing images to fit a specific style or theme
- Enhancing or altering photographs
- Creating variations of existing artwork
- Applying text-guided edits to images

**Tags:** image, generation, AI, image-to-image

- **prompt**: The prompt for image generation. (str)
- **negative_prompt**: The negative prompt to guide what should not appear in the generated image. (str)
- **seed**: Seed for the random number generator. Use -1 for a random seed. (int)
- **num_inference_steps**: Number of denoising steps. (int)
- **guidance_scale**: Guidance scale for generation. (float)
- **scheduler**: The scheduler to use for the diffusion process. (StableDiffusionScheduler)
- **ip_adapter_model**: The IP adapter model to use for image processing (IPAdapter_SD15_Model)
- **ip_adapter_image**: When provided the image will be fed into the IP adapter (ImageRef)
- **ip_adapter_scale**: Strength of the IP adapter image (float)
- **model**: The Stable Diffusion model to use for generation. (StableDiffusionModelId)
- **init_image**: The initial image for Image-to-Image generation. (ImageRef)
- **strength**: Strength for Image-to-Image generation. Higher values allow for more deviation from the original image. (float)

### initialize

**Args:**
- **context (ProcessingContext)**

## StableDiffusionInpaintNode

Performs inpainting on images using Stable Diffusion.

Use cases:
- Remove unwanted objects from images
- Fill in missing parts of images
- Modify specific areas of images while preserving the rest

**Tags:** image, inpainting, AI

- **prompt**: The prompt for image generation. (str)
- **negative_prompt**: The negative prompt to guide what should not appear in the generated image. (str)
- **seed**: Seed for the random number generator. Use -1 for a random seed. (int)
- **num_inference_steps**: Number of denoising steps. (int)
- **guidance_scale**: Guidance scale for generation. (float)
- **scheduler**: The scheduler to use for the diffusion process. (StableDiffusionScheduler)
- **ip_adapter_model**: The IP adapter model to use for image processing (IPAdapter_SD15_Model)
- **ip_adapter_image**: When provided the image will be fed into the IP adapter (ImageRef)
- **ip_adapter_scale**: Strength of the IP adapter image (float)
- **init_image**: The initial image to be inpainted. (ImageRef)
- **mask_image**: The mask image indicating areas to be inpainted. (ImageRef)
- **strength**: Strength for inpainting. Higher values allow for more deviation from the original image. (float)

### initialize

**Args:**
- **context (ProcessingContext)**

## StableDiffusionLatentUpscale

Upscales an image using Stable Diffusion upscaler model.

Use cases:
- Enhance low-resolution images
- Improve image quality for printing or display
- Create high-resolution versions of small images

**Tags:** image, upscaling, AI, stable-diffusion

- **prompt**: The prompt for image generation. (str)
- **negative_prompt**: The negative prompt to guide what should not appear in the generated image. (str)
- **seed**: Seed for the random number generator. Use -1 for a random seed. (int)
- **num_inference_steps**: Number of denoising steps. (int)
- **guidance_scale**: Guidance scale for generation. (float)
- **scheduler**: The scheduler to use for the diffusion process. (StableDiffusionScheduler)
- **ip_adapter_model**: The IP adapter model to use for image processing (IPAdapter_SD15_Model)
- **ip_adapter_image**: When provided the image will be fed into the IP adapter (ImageRef)
- **ip_adapter_scale**: Strength of the IP adapter image (float)
- **model**: The Stable Diffusion model to use for generation. (StableDiffusionModelId)
- **init_image**: The initial image for Image-to-Image generation. (ImageRef)
- **num_upscale_steps**: Number of upscaling steps. (int)
- **strength**: Strength for Image-to-Image generation. Higher values allow for more deviation from the original image. (float)

### initialize

**Args:**
- **context (ProcessingContext)**

### move_to_device

**Args:**
- **device (str)**

## StableDiffusionModelId

An enumeration.

## StableDiffusionScheduler

An enumeration.

## StableDiffusionUpscale

- **prompt**: The prompt for image generation. (str)
- **negative_prompt**: The negative prompt to guide what should not appear in the generated image. (str)
- **seed**: Seed for the random number generator. Use -1 for a random seed. (int)
- **num_inference_steps**: Number of denoising steps. (int)
- **guidance_scale**: Guidance scale for generation. (float)
- **scheduler**: The scheduler to use for the diffusion process. (StableDiffusionScheduler)
- **ip_adapter_model**: The IP adapter model to use for image processing (IPAdapter_SD15_Model)
- **ip_adapter_image**: When provided the image will be fed into the IP adapter (ImageRef)
- **ip_adapter_scale**: Strength of the IP adapter image (float)
- **model**: The Stable Diffusion model to use for generation. (StableDiffusionModelId)
- **init_image**: The initial image for Image-to-Image generation. (ImageRef)
- **num_upscale_steps**: Number of upscaling steps. (int)
- **strength**: Strength for Image-to-Image generation. Higher values allow for more deviation from the original image. (float)

## StableDiffusionXL

Generates images from text prompts using Stable Diffusion XL.

Use cases:
- Creating custom illustrations for marketing materials
- Generating concept art for game and film development
- Producing unique stock imagery for websites and publications
- Visualizing interior design concepts for clients

**Tags:** image, generation, AI, text-to-image

- **model**: The Stable Diffusion XL model to use for generation. (StableDiffusionXLModelId)
- **prompt**: The prompt for image generation. (str)
- **seed**: Seed for the random number generator. (int)
- **num_inference_steps**: Number of inference steps. (int)
- **guidance_scale**: Guidance scale for generation. (float)
- **width**: Width of the generated image. (int)
- **height**: Height of the generated image (int)
- **scheduler**: The scheduler to use for the diffusion process. (StableDiffusionScheduler)
- **ip_adapter_model**: The IP adapter model to use for image processing (IPAdapter_SDXL_Model)
- **ip_adapter_image**: When provided the image will be fed into the IP adapter (ImageRef)
- **ip_adapter_scale**: Strength of the IP adapter image (float)

### initialize

**Args:**
- **context (ProcessingContext)**

### move_to_device

**Args:**
- **device (str)**

## StableDiffusionXLControlNetNode

Generates images using Stable Diffusion XL with ControlNet.

Use cases:
- Generate high-quality images with precise control over structures and features
- Create variations of existing images while maintaining specific characteristics
- Artistic image generation with guided outputs based on various control types

**Tags:** image, generation, AI, text-to-image, controlnet

- **prompt**: A text prompt describing the desired image. (str)
- **negative_prompt**: A text prompt describing what to avoid in the image. (str)
- **control_image**: The control image to guide the generation process (already processed). (ImageRef)
- **control_model**: The type of ControlNet model to use. (StableDiffusionXLControlNetModel)
- **controlnet_conditioning_scale**: The scale of the ControlNet conditioning. (float)
- **num_inference_steps**: The number of denoising steps. (int)
- **seed**: Seed for the random number generator. Use -1 for a random seed. (int)

### initialize

**Args:**
- **context (ProcessingContext)**

### move_to_device

**Args:**
- **device (str)**

## StableDiffusionXLImg2Img

Transforms existing images based on text prompts using Stable Diffusion XL.

Use cases:
- Modifying existing images to fit a specific style or theme
- Enhancing or altering stock photos for unique marketing materials
- Transforming rough sketches into detailed illustrations
- Creating variations of existing artwork or designs

**Tags:** image, generation, AI, image-to-image

- **model**: The Stable Diffusion XL model to use for generation. (StableDiffusionXLModelId)
- **prompt**: The prompt for image generation. (str)
- **init_image**: The initial image for Image-to-Image generation. (ImageRef)
- **seed**: Seed for the random number generator. (int)
- **num_inference_steps**: Number of inference steps. (int)
- **guidance_scale**: Guidance scale for generation. (float)
- **width**: Width of the generated image. (int)
- **height**: Height of the generated image (int)
- **scheduler**: The scheduler to use for the diffusion process. (StableDiffusionScheduler)
- **strength**: Strength for Image-to-Image generation. (float)

### initialize

**Args:**
- **context (ProcessingContext)**

### move_to_device

**Args:**
- **device (str)**

## StableDiffusionXLModelId

An enumeration.

## Swin2SR

Performs image super-resolution using the Swin2SR model.

Use cases:
- Enhance low-resolution images
- Improve image quality for printing or display
- Upscale images for better detail

**Tags:** image, super-resolution, enhancement, huggingface

- **inputs**: The input image to transform (ImageRef)
- **prompt**: The text prompt to guide the image transformation (if applicable) (str)

### get_model_id

**Args:**

### get_params

**Args:**

## VisualizeObjectDetection

Visualizes object detection results on images.

- **image**: The input image to visualize (ImageRef)
- **objects**: The detected objects to visualize (list)

## VisualizeSegmentation

Visualizes segmentation masks on images with labels.

Use cases:
- Visualize results of image segmentation models
- Analyze and compare different segmentation techniques
- Create labeled images for presentations or reports

**Tags:** image, segmentation, visualization

- **image**: The input image to visualize (ImageRef)
- **segments**: The segmentation masks to visualize (list)

### generate_color_map

Generate a list of distinct colors.
**Args:**
- **num_colors**

## ZeroShotImageClassifier

Classifies images into categories without the need for training data.

Use cases:
- Quickly categorize images without training data
- Identify objects in images without predefined labels
- Automate image tagging for large datasets

**Tags:** image, classification, labeling, categorization

- **model**: The model ID to use for the classification (ZeroShotImageClassifierModelId)
- **inputs**: The input image to classify (ImageRef)
- **candidate_labels**: The candidate labels to classify the image against, separated by commas (str)

### get_inputs

**Args:**
- **context (ProcessingContext)**

### get_model_id

**Args:**

### get_params

**Args:**

### process_local_result

**Args:**
- **context (ProcessingContext)**
- **result (typing.Any)**

**Returns:** dict

### process_remote_result

**Args:**
- **context (ProcessingContext)**
- **result (typing.Any)**

**Returns:** dict

## ZeroShotObjectDetection

Detects objects in images without the need for training data.

Use cases:
- Quickly detect objects in images without training data
- Identify objects in images without predefined labels
- Automate object detection for large datasets

**Tags:** image, object detection, bounding boxes, zero-shot

- **model**: The model ID to use for object detection (ZeroShotObjectDetectionModelId)
- **inputs**: The input image for object detection (ImageRef)
- **threshold**: Minimum confidence score for detected objects (float)
- **top_k**: The number of top predictions to return (int)
- **candidate_labels**: The candidate labels to detect in the image, separated by commas (str)

### get_inputs

**Args:**
- **context (ProcessingContext)**

### get_model_id

**Args:**

### get_params

**Args:**

### process_local_result

**Args:**
- **context (ProcessingContext)**
- **result (typing.Any)**

**Returns:** list

### get_scheduler_class

**Args:**
- **scheduler (StableDiffusionScheduler)**

### make_hint

**Args:**
- **image (Image)**

**Returns:** Tensor

