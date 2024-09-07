# nodetool.nodes.huggingface.image

## BaseImageToImage

Base class for image-to-image transformation tasks.

**Tags:** image, transformation, generation, huggingface

**Fields:**
- **inputs**: The input image to transform (ImageRef)
- **prompt**: The text prompt to guide the image transformation (if applicable) (str)

### get_inputs

**Args:**
- **context (ProcessingContext)**

### process_local_result

**Args:**
- **context (ProcessingContext)**
- **result (Any)**

**Returns:** ImageRef

### process_remote_result

**Args:**
- **context (ProcessingContext)**
- **result (Any)**

**Returns:** ImageRef

### required_inputs

**Args:**


## DepthEstimation

Estimates depth from a single image.

Use cases:
- Generate depth maps for 3D modeling
- Assist in augmented reality applications
- Enhance computer vision systems for robotics
- Improve scene understanding in autonomous vehicles

Recommended models:
- LiheYoung/depth-anything-base-hf
- Intel/dpt-large

**Tags:** image, depth estimation, 3D, huggingface

**Fields:**
- **model**: The model ID to use for depth estimation (HFDepthEstimation)
- **inputs**: The input image for depth estimation (ImageRef)

### get_inputs

**Args:**
- **context (ProcessingContext)**

### get_model_id

**Args:**

### process_local_result

**Args:**
- **context (ProcessingContext)**
- **result (Any)**

**Returns:** ImageRef

### process_remote_result

**Args:**
- **context (ProcessingContext)**
- **result (Any)**

**Returns:** ImageRef

### required_inputs

**Args:**


## FindSegment

Extracts a specific segment from a list of segmentation masks.

**Fields:**
- **segments**: The segmentation masks to search (list[nodetool.metadata.types.ImageSegmentationResult])
- **segment_label**: The label of the segment to extract (str)

### required_inputs

**Args:**


## IPAdapter_SD15_Model

## IPAdapter_SDXL_Model

## ImageClassifier

Classifies images into predefined categories.

Use cases:
- Content moderation by detecting inappropriate images
- Organizing photo libraries by automatically tagging images

**Tags:** image, classification, labeling, categorization

**Fields:**
- **model**: The model ID to use for the classification (HFImageClassification)
- **inputs**: The input image to classify (ImageRef)

### get_inputs

**Args:**
- **context (ProcessingContext)**

### get_model_id

**Args:**

### process_local_result

**Args:**
- **context (ProcessingContext)**
- **result (Any)**

**Returns:** dict[str, float]

### process_remote_result

**Args:**
- **context (ProcessingContext)**
- **result (Any)**

**Returns:** dict[str, float]

### required_inputs

**Args:**


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


## LORA_Model

## LORA_SDXL_Model

## LatentConsistencyModel

Generates images using the Latent Consistency Model.

Use cases:
- Create AI-generated art and illustrations
- Produce concept art for creative projects
- Generate visual content for various applications
- Explore AI-assisted image creation

**Tags:** image, generation, AI, diffusion

**Fields:**
- **model**: The Stable Diffusion XL model to use for generation. (HFStableDiffusionXL)
- **prompt**: The prompt for image generation. (str)
- **negative_prompt**: The negative prompt to guide what should not appear in the generated image. (str)
- **seed**: Seed for the random number generator. (int)
- **num_inference_steps**: Number of denoising steps. LCM supports fast inference even with <=4 steps. Recommended: 1-8 steps. (int)
- **guidance_scale**: Guidance scale for generation. (float)
- **width**: Width of the generated image. (int)
- **height**: Height of the generated image (int)
- **scheduler**: The scheduler to use for the diffusion process. (StableDiffusionScheduler)
- **lora_model**: The LORA model to use for image processing (LORA_SDXL_Model)
- **lora_scale**: Strength of the LORA image (float)
- **ip_adapter_model**: The IP adapter model to use for image processing (IPAdapter_SDXL_Model)
- **ip_adapter_image**: When provided the image will be fed into the IP adapter (ImageRef)
- **ip_adapter_scale**: Strength of the IP adapter image (float)

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

Recommended models:
- facebook/detr-resnet-50

**Tags:** image, object detection, bounding boxes, huggingface

**Fields:**
- **model**: The model ID to use for object detection (HFObjectDetection)
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
- **result (Any)**

**Returns:** list[nodetool.metadata.types.ObjectDetectionResult]

### required_inputs

**Args:**


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

### get_model_id

**Args:**

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

### get_model_id

**Args:**

### initialize

**Args:**
- **context (ProcessingContext)**

### move_to_device

**Args:**
- **device (str)**


## PlaygroundV2

Playground v2.5 is the state-of-the-art open-source model in aesthetic quality.

Use cases:
- Create detailed images from text descriptions
- Generate unique illustrations for creative projects
- Produce visual content for digital media and art
- Explore AI-generated imagery for concept development

**Tags:** image, generation, AI, text-to-image

**Fields:**
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


## Proteus

Proteus is an open-source text-to-image generation model.

Use cases:
- Generate images from textual descriptions
- Create unique visual content for creative projects
- Explore AI-generated imagery for concept development
- Produce illustrations for various applications

**Tags:** image, generation, AI, text-to-image

**Fields:**
- **prompt**: A text prompt describing the desired image. (str)
- **num_inference_steps**: The number of denoising steps. (int)
- **guidance_scale**: The scale for classifier-free guidance. (float)
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

**Fields:**
- **model**: The SDXL Turbo model to use for generation. (HFStableDiffusionXLTurbo)
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

**Fields:**
- **model**: The SDXL Turbo model to use for generation. (HFStableDiffusionXLTurbo)
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

### required_inputs

**Args:**


## Segmentation

Performs semantic segmentation on images, identifying and labeling different regions.

Use cases:
- Segmenting objects in images
- Segmenting facial features in images

Recommended models:
- nvidia/segformer-b3-finetuned-ade-512-512
- mattmdjaga/segformer_b2_clothes

**Tags:** image, segmentation, object detection, scene parsing

**Fields:**
- **model**: The model ID to use for the segmentation (HFImageSegmentation)
- **image**: The input image to segment (ImageRef)

### get_inputs

**Args:**
- **context (ProcessingContext)**

### get_model_id

**Args:**

### process_local_result

**Args:**
- **context (ProcessingContext)**
- **result (Any)**

**Returns:** list[nodetool.metadata.types.ImageSegmentationResult]

### required_inputs

**Args:**


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
- **lora_model**: The LORA model to use for image processing (LORA_Model)
- **lora_scale**: Strength of the LORA image (float)
- **ip_adapter_model**: The IP adapter model to use for image processing (IPAdapter_SD15_Model)
- **ip_adapter_image**: When provided the image will be fed into the IP adapter (ImageRef)
- **ip_adapter_scale**: Strength of the IP adapter image (float)
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


## StableDiffusionBaseNode

**Fields:**
- **model**: The model to use for image generation. (HFStableDiffusion)
- **prompt**: The prompt for image generation. (str)
- **negative_prompt**: The negative prompt to guide what should not appear in the generated image. (str)
- **seed**: Seed for the random number generator. Use -1 for a random seed. (int)
- **num_inference_steps**: Number of denoising steps. (int)
- **guidance_scale**: Guidance scale for generation. (float)
- **scheduler**: The scheduler to use for the diffusion process. (StableDiffusionScheduler)
- **lora_model**: The LORA model to use for image processing (LORA_Model)
- **lora_scale**: Strength of the LORA image (float)
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

**Fields:**
- **model**: The model to use for image generation. (HFStableDiffusion)
- **prompt**: The prompt for image generation. (str)
- **negative_prompt**: The negative prompt to guide what should not appear in the generated image. (str)
- **seed**: Seed for the random number generator. Use -1 for a random seed. (int)
- **num_inference_steps**: Number of denoising steps. (int)
- **guidance_scale**: Guidance scale for generation. (float)
- **scheduler**: The scheduler to use for the diffusion process. (StableDiffusionScheduler)
- **lora_model**: The LORA model to use for image processing (LORA_Model)
- **lora_scale**: Strength of the LORA image (float)
- **ip_adapter_model**: The IP adapter model to use for image processing (IPAdapter_SD15_Model)
- **ip_adapter_image**: When provided the image will be fed into the IP adapter (ImageRef)
- **ip_adapter_scale**: Strength of the IP adapter image (float)
- **controlnet**: The ControlNet model to use for guidance. (HFControlNet)
- **image**: The input image to be transformed. (ImageRef)
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

**Tags:** image, inpainting, AI, controlnet

**Fields:**
- **model**: The model to use for image generation. (HFStableDiffusion)
- **prompt**: The prompt for image generation. (str)
- **negative_prompt**: The negative prompt to guide what should not appear in the generated image. (str)
- **seed**: Seed for the random number generator. Use -1 for a random seed. (int)
- **num_inference_steps**: Number of denoising steps. (int)
- **guidance_scale**: Guidance scale for generation. (float)
- **scheduler**: The scheduler to use for the diffusion process. (StableDiffusionScheduler)
- **lora_model**: The LORA model to use for image processing (LORA_Model)
- **lora_scale**: Strength of the LORA image (float)
- **ip_adapter_model**: The IP adapter model to use for image processing (IPAdapter_SD15_Model)
- **ip_adapter_image**: When provided the image will be fed into the IP adapter (ImageRef)
- **ip_adapter_scale**: Strength of the IP adapter image (float)
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

**Tags:** image, generation, AI, text-to-image, controlnet

**Fields:**
- **model**: The model to use for image generation. (HFStableDiffusion)
- **prompt**: The prompt for image generation. (str)
- **negative_prompt**: The negative prompt to guide what should not appear in the generated image. (str)
- **seed**: Seed for the random number generator. Use -1 for a random seed. (int)
- **num_inference_steps**: Number of denoising steps. (int)
- **guidance_scale**: Guidance scale for generation. (float)
- **scheduler**: The scheduler to use for the diffusion process. (StableDiffusionScheduler)
- **lora_model**: The LORA model to use for image processing (LORA_Model)
- **lora_scale**: Strength of the LORA image (float)
- **ip_adapter_model**: The IP adapter model to use for image processing (IPAdapter_SD15_Model)
- **ip_adapter_image**: When provided the image will be fed into the IP adapter (ImageRef)
- **ip_adapter_scale**: Strength of the IP adapter image (float)
- **controlnet**: The ControlNet model to use for guidance. (HFControlNet)
- **control_image**: The control image to guide the generation process. (ImageRef)
- **controlnet_conditioning_scale**: The scale for ControlNet conditioning. (float)

### initialize

**Args:**
- **context (ProcessingContext)**

### required_inputs

**Args:**


## StableDiffusionImg2ImgNode

Transforms existing images based on text prompts using Stable Diffusion.

Use cases:
- Modifying existing images to fit a specific style or theme
- Enhancing or altering photographs
- Creating variations of existing artwork
- Applying text-guided edits to images

**Tags:** image, generation, AI, image-to-image

**Fields:**
- **model**: The model to use for image generation. (HFStableDiffusion)
- **prompt**: The prompt for image generation. (str)
- **negative_prompt**: The negative prompt to guide what should not appear in the generated image. (str)
- **seed**: Seed for the random number generator. Use -1 for a random seed. (int)
- **num_inference_steps**: Number of denoising steps. (int)
- **guidance_scale**: Guidance scale for generation. (float)
- **scheduler**: The scheduler to use for the diffusion process. (StableDiffusionScheduler)
- **lora_model**: The LORA model to use for image processing (LORA_Model)
- **lora_scale**: Strength of the LORA image (float)
- **ip_adapter_model**: The IP adapter model to use for image processing (IPAdapter_SD15_Model)
- **ip_adapter_image**: When provided the image will be fed into the IP adapter (ImageRef)
- **ip_adapter_scale**: Strength of the IP adapter image (float)
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

**Tags:** image, inpainting, AI

**Fields:**
- **model**: The model to use for image generation. (HFStableDiffusion)
- **prompt**: The prompt for image generation. (str)
- **negative_prompt**: The negative prompt to guide what should not appear in the generated image. (str)
- **seed**: Seed for the random number generator. Use -1 for a random seed. (int)
- **num_inference_steps**: Number of denoising steps. (int)
- **guidance_scale**: Guidance scale for generation. (float)
- **scheduler**: The scheduler to use for the diffusion process. (StableDiffusionScheduler)
- **lora_model**: The LORA model to use for image processing (LORA_Model)
- **lora_scale**: Strength of the LORA image (float)
- **ip_adapter_model**: The IP adapter model to use for image processing (IPAdapter_SD15_Model)
- **ip_adapter_image**: When provided the image will be fed into the IP adapter (ImageRef)
- **ip_adapter_scale**: Strength of the IP adapter image (float)
- **init_image**: The initial image to be inpainted. (ImageRef)
- **mask_image**: The mask image indicating areas to be inpainted. (ImageRef)
- **strength**: Strength for inpainting. Higher values allow for more deviation from the original image. (float)

### initialize

**Args:**
- **context (ProcessingContext)**

### required_inputs

**Args:**


## StableDiffusionScheduler

## StableDiffusionUpscale

Upscales an image using Stable Diffusion 4x upscaler.

Use cases:
- Enhance low-resolution images
- Improve image quality for printing or display
- Create high-resolution versions of small images

**Tags:** image, upscaling, AI, stable-diffusion

**Fields:**
- **prompt**: The prompt for image generation. (str)
- **negative_prompt**: The negative prompt to guide what should not appear in the generated image. (str)
- **num_inference_steps**: Number of upscaling steps. (int)
- **guidance_scale**: Guidance scale for generation. (float)
- **image**: The initial image for Image-to-Image generation. (ImageRef)
- **scheduler**: The scheduler to use for the diffusion process. (StableDiffusionScheduler)
- **seed**: Seed for the random number generator. Use -1 for a random seed. (int)

### initialize

**Args:**
- **context (ProcessingContext)**

### move_to_device

**Args:**
- **device (str)**

### required_inputs

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
- **lora_model**: The LORA model to use for image processing (LORA_SDXL_Model)
- **lora_scale**: Strength of the LORA image (float)
- **ip_adapter_model**: The IP adapter model to use for image processing (IPAdapter_SDXL_Model)
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
- **lora_model**: The LORA model to use for image processing (LORA_SDXL_Model)
- **lora_scale**: Strength of the LORA image (float)
- **ip_adapter_model**: The IP adapter model to use for image processing (IPAdapter_SDXL_Model)
- **ip_adapter_image**: When provided the image will be fed into the IP adapter (ImageRef)
- **ip_adapter_scale**: Strength of the IP adapter image (float)

### move_to_device

**Args:**
- **device (str)**

### progress_callback

**Args:**
- **context (ProcessingContext)**


## StableDiffusionXLControlNetNode

Generates images using Stable Diffusion XL with ControlNet.

Use cases:
- Generate high-quality images with precise control over structures and features
- Create variations of existing images while maintaining specific characteristics
- Artistic image generation with guided outputs based on various control types

**Tags:** image, generation, AI, text-to-image, controlnet

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
- **lora_model**: The LORA model to use for image processing (LORA_SDXL_Model)
- **lora_scale**: Strength of the LORA image (float)
- **ip_adapter_model**: The IP adapter model to use for image processing (IPAdapter_SDXL_Model)
- **ip_adapter_image**: When provided the image will be fed into the IP adapter (ImageRef)
- **ip_adapter_scale**: Strength of the IP adapter image (float)
- **init_image**: The initial image for Image-to-Image generation. (ImageRef)
- **strength**: Strength for Image-to-Image generation. (float)
- **control_image**: The control image to guide the generation process (already processed). (ImageRef)
- **control_model**: The type of ControlNet model to use. (StableDiffusionXLControlNetModel)
- **controlnet_conditioning_scale**: The scale of the ControlNet conditioning. (float)

### initialize

**Args:**
- **context (ProcessingContext)**

### required_inputs

**Args:**


## StableDiffusionXLImg2Img

Transforms existing images based on text prompts using Stable Diffusion XL.

Use cases:
- Modifying existing images to fit a specific style or theme
- Enhancing or altering stock photos for unique marketing materials
- Transforming rough sketches into detailed illustrations
- Creating variations of existing artwork or designs

**Tags:** image, generation, AI, image-to-image

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
- **lora_model**: The LORA model to use for image processing (LORA_SDXL_Model)
- **lora_scale**: Strength of the LORA image (float)
- **ip_adapter_model**: The IP adapter model to use for image processing (IPAdapter_SDXL_Model)
- **ip_adapter_image**: When provided the image will be fed into the IP adapter (ImageRef)
- **ip_adapter_scale**: Strength of the IP adapter image (float)
- **init_image**: The initial image for Image-to-Image generation. (ImageRef)
- **strength**: Strength for Image-to-Image generation. (float)

### initialize

**Args:**
- **context (ProcessingContext)**

### required_inputs

**Args:**


## StableDiffusionXLInpainting

Performs inpainting on images using Stable Diffusion XL.

Use cases:
- Removing unwanted objects from images
- Adding new elements to existing images
- Repairing damaged or incomplete images
- Creating creative image edits and modifications

**Tags:** image, inpainting, AI, image-editing

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
- **lora_model**: The LORA model to use for image processing (LORA_SDXL_Model)
- **lora_scale**: Strength of the LORA image (float)
- **ip_adapter_model**: The IP adapter model to use for image processing (IPAdapter_SDXL_Model)
- **ip_adapter_image**: When provided the image will be fed into the IP adapter (ImageRef)
- **ip_adapter_scale**: Strength of the IP adapter image (float)
- **image**: The input image to be inpainted. (ImageRef)
- **mask_image**: The mask image indicating the area to be inpainted. (ImageRef)
- **strength**: Strength of the inpainting. Values below 1.0 work best. (float)

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
- **inputs**: The input image to transform (ImageRef)
- **prompt**: The text prompt to guide the image transformation (if applicable) (str)
- **model**: The model ID to use for image super-resolution (HFImageToImage)

### get_model_id

**Args:**

### get_params

**Args:**


## VisualizeObjectDetection

Visualizes object detection results on images.

**Fields:**
- **image**: The input image to visualize (ImageRef)
- **objects**: The detected objects to visualize (list[nodetool.metadata.types.ObjectDetectionResult])

### required_inputs

**Args:**


## VisualizeSegmentation

Visualizes segmentation masks on images with labels.

Use cases:
- Visualize results of image segmentation models
- Analyze and compare different segmentation techniques
- Create labeled images for presentations or reports

**Tags:** image, segmentation, visualization

**Fields:**
- **image**: The input image to visualize (ImageRef)
- **segments**: The segmentation masks to visualize (list[nodetool.metadata.types.ImageSegmentationResult])

### generate_color_map

Generate a list of distinct colors.
**Args:**
- **num_colors**

### required_inputs

**Args:**


## ZeroShotImageClassifier

Classifies images into categories without the need for training data.

Use cases:
- Quickly categorize images without training data
- Identify objects in images without predefined labels
- Automate image tagging for large datasets

Recommended models:
- openai/clip-vit-large-patch14
- openai/clip-vit-base-patch16
- openai/clip-vit-base-patch32
- patrickjohncyh/fashion-clip
- laion/CLIP-ViT-H-14-laion2B-s32B-b79K

**Tags:** image, classification, labeling, categorization

**Fields:**
- **model**: The model ID to use for the classification (HFZeroShotImageClassification)
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
- **result (Any)**

**Returns:** dict[str, float]

### process_remote_result

**Args:**
- **context (ProcessingContext)**
- **result (Any)**

**Returns:** dict[str, float]

### required_inputs

**Args:**


## ZeroShotObjectDetection

Detects objects in images without the need for training data.

Use cases:
- Quickly detect objects in images without training data
- Identify objects in images without predefined labels
- Automate object detection for large datasets

Recommended models:
- google/owlvit-base-patch32
- google/owlvit-large-patch14
- google/owlvit-base-patch16
- google/owlv2-base-patch16
- google/owlv2-base-patch16-ensemble
- IDEA-Research/grounding-dino-tiny

**Tags:** image, object detection, bounding boxes, zero-shot

**Fields:**
- **model**: The model ID to use for object detection (HFZeroShotObjectDetection)
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
- **result (Any)**

**Returns:** list[nodetool.metadata.types.ObjectDetectionResult]

### required_inputs

**Args:**


### get_scheduler_class

**Args:**
- **scheduler (StableDiffusionScheduler)**

