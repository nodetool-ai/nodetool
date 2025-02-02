# nodetool.nodes.fal.text_to_image

## AspectRatio

## AspectRatioLuma

## AuraFlowV03

AuraFlow v0.3 is an open-source flow-based text-to-image generation model that achieves state-of-the-art results on GenEval.

Use cases:
- Generate high-quality images
- Create artistic visualizations

**Tags:** image, generation, flow-based, text-to-image, txt2img

**Fields:**
- **prompt**: The prompt to generate an image from (str)
- **num_images**: The number of images to generate (int)
- **guidance_scale**: Classifier free guidance scale (float)
- **num_inference_steps**: The number of inference steps to take (int)
- **expand_prompt**: Whether to perform prompt expansion (recommended) (bool)
- **seed**: The seed to use for generating images (int)


## BriaV1

Bria's Text-to-Image model, trained exclusively on licensed data for safe and risk-free commercial use.

**Tags:** Features exceptional image quality and commercial licensing safety.

**Fields:**
- **prompt**: The prompt to generate an image from (str)
- **negative_prompt**: The negative prompt to avoid certain elements in the generated image (str)
- **num_images**: How many images to generate. When using guidance, value is set to 1 (int)
- **aspect_ratio**: The aspect ratio of the image. Ignored when guidance is used (AspectRatio)
- **num_inference_steps**: The number of iterations for refining the generated image (int)
- **guidance_scale**: How closely the model should stick to your prompt (CFG scale) (float)
- **prompt_enhancement**: When true, enhances the prompt with more descriptive variations (bool)
- **medium**: Optional medium specification ('photography' or 'art') (str)
- **seed**: The same seed and prompt will output the same image every time (int)


## BriaV1Fast

Bria's Text-to-Image model with perfect harmony of latency and quality.
Features faster inference times while maintaining high image quality.

**Tags:** Trained exclusively on licensed data for safe and risk-free commercial use.

**Fields:**
- **prompt**: The prompt to generate an image from (str)
- **negative_prompt**: The negative prompt to avoid certain elements in the generated image (str)
- **num_images**: How many images to generate. When using guidance, value is set to 1 (int)
- **aspect_ratio**: The aspect ratio of the image. Ignored when guidance is used (AspectRatio)
- **num_inference_steps**: The number of iterations for refining the generated image (int)
- **guidance_scale**: How closely the model should stick to your prompt (CFG scale) (float)
- **prompt_enhancement**: When true, enhances the prompt with more descriptive variations (bool)
- **medium**: Optional medium specification ('photography' or 'art') (str)
- **seed**: The same seed and prompt will output the same image every time (int)


## BriaV1HD

Bria's Text-to-Image model for HD images. Trained exclusively on licensed data for safe and risk-free commercial use. Features exceptional image quality and commercial licensing safety.

Use cases:
- Create commercial marketing materials
- Generate licensed artwork
- Produce high-definition visuals
- Design professional content
- Create legally safe visual assets

**Tags:** image, generation, hd, text-to-image, txt2img

**Fields:**
- **prompt**: The prompt to generate an image from (str)
- **negative_prompt**: The negative prompt to avoid certain elements in the generated image (str)
- **num_images**: How many images to generate. When using guidance, value is set to 1 (int)
- **aspect_ratio**: The aspect ratio of the image. Ignored when guidance is used (AspectRatio)
- **num_inference_steps**: The number of iterations for refining the generated image (int)
- **guidance_scale**: How closely the model should stick to your prompt (CFG scale) (float)
- **prompt_enhancement**: When true, enhances the prompt with more descriptive variations (bool)
- **medium**: Optional medium specification ('photography' or 'art') (str)
- **seed**: The seed to use for generating images (int)


## ControlTypeEnum

## DiffusionEdge

Diffusion Edge is a diffusion-based high-quality edge detection model that generates

**Tags:** edge maps from input images.

**Fields:**
- **image**: The input image to detect edges from (ImageRef)


## FastLCMDiffusion

Fast Latent Consistency Models (v1.5/XL) Text to Image runs SDXL at the speed of light,

**Tags:** enabling rapid and high-quality image generation.

**Fields:**
- **prompt**: The prompt to generate an image from (str)
- **model_name**: The name of the model to use (ModelNameFastLCM)
- **negative_prompt**: Use it to address details that you don't want in the image (str)
- **image_size**: The size of the generated image (ImageSizePreset)
- **num_inference_steps**: The number of inference steps to perform (int)
- **guidance_scale**: How closely the model should stick to your prompt (float)
- **sync_mode**: If true, wait for image generation and upload before returning (bool)
- **num_images**: The number of images to generate (int)
- **enable_safety_checker**: If true, the safety checker will be enabled (bool)
- **safety_checker_version**: The version of the safety checker to use (SafetyCheckerVersion)
- **expand_prompt**: If true, the prompt will be expanded with additional prompts (bool)
- **guidance_rescale**: The rescale factor for the CFG (float)
- **seed**: The same seed and prompt will output the same image every time (int)


## FastLightningSDXL

Stable Diffusion XL Lightning Text to Image runs SDXL at the speed of light, enabling

**Tags:** ultra-fast high-quality image generation.

**Fields:**
- **prompt**: The prompt to generate an image from (str)
- **image_size**: The size of the generated image (ImageSizePreset)
- **num_inference_steps**: The number of inference steps to perform (1, 2, 4, or 8) (int)
- **seed**: The same seed and prompt will output the same image every time (int)
- **enable_safety_checker**: If true, the safety checker will be enabled (bool)
- **expand_prompt**: If true, the prompt will be expanded with additional prompts (bool)


## FastSDXL

Fast SDXL is a high-performance text-to-image model that runs SDXL at exceptional speeds

**Tags:** while maintaining high-quality output.

**Fields:**
- **prompt**: The prompt to generate an image from (str)
- **negative_prompt**: Use it to address details that you don't want in the image (str)
- **image_size**: The size of the generated image (ImageSizePreset)
- **num_inference_steps**: The number of inference steps to perform (int)
- **guidance_scale**: How closely the model should stick to your prompt (CFG scale) (float)
- **num_images**: The number of images to generate (int)
- **seed**: The same seed and prompt will output the same image every time (int)
- **enable_safety_checker**: If true, the safety checker will be enabled (bool)
- **expand_prompt**: If true, the prompt will be expanded with additional prompts (bool)
- **loras**: The list of LoRA weights to use (typing.List[nodetool.metadata.types.LoraWeight])


## FastSDXLControlNetCanny

Fast SDXL ControlNet Canny is a model that generates images using ControlNet with SDXL.

**Fields:**
- **prompt**: The prompt to generate an image from (str)
- **control_image**: The control image to use for generation (ImageRef)
- **negative_prompt**: Use it to address details that you don't want in the image (str)
- **guidance_scale**: How closely the model should stick to your prompt (float)
- **num_inference_steps**: The number of inference steps to perform (int)
- **image_size**: The size of the generated image (ImageSizePreset)
- **seed**: The same seed and prompt will output the same image every time (int)
- **enable_safety_checker**: If true, the safety checker will be enabled (bool)


## FastTurboDiffusion

Fast Turbo Diffusion runs SDXL at exceptional speeds while maintaining high-quality output.

**Tags:** Supports both SDXL Turbo and SD Turbo models for ultra-fast image generation.

**Fields:**
- **prompt**: The prompt to generate an image from (str)
- **model_name**: The name of the model to use (ModelNameEnum)
- **negative_prompt**: Use it to address details that you don't want in the image (str)
- **image_size**: The size of the generated image (ImageSizePreset)
- **num_inference_steps**: The number of inference steps to perform (int)
- **guidance_scale**: How closely the model should stick to your prompt (float)
- **seed**: The same seed and prompt will output the same image every time (int)
- **enable_safety_checker**: If true, the safety checker will be enabled (bool)
- **expand_prompt**: If true, the prompt will be expanded with additional prompts (bool)


## FluxDev

FLUX.1 [dev] is a 12 billion parameter flow transformer that generates high-quality images from text.

**Tags:** It is suitable for personal and commercial use.

**Fields:**
- **prompt**: The prompt to generate an image from (str)
- **image_size**: Either a preset size or a custom {width, height} dictionary (ImageSizePreset)
- **num_inference_steps**: The number of inference steps to perform (int)
- **guidance_scale**: The CFG (Classifier Free Guidance) scale is a measure of how close you want the model to stick to your prompt (float)
- **num_images**: The number of images to generate (int)
- **seed**: The same seed and prompt will output the same image every time (int)
- **enable_safety_checker**: If true, the safety checker will be enabled (bool)


## FluxDevImageToImage

FLUX.1 [dev] Image-to-Image is a high-performance endpoint that enables rapid transformation
the core FLUX capabilities.

**Tags:** of existing images, delivering high-quality style transfers and image modifications with

**Fields:**
- **prompt**: The prompt to generate an image from (str)
- **image**: The input image to transform (ImageRef)
- **strength**: The strength of the initial image. Higher strength values are better for this model (float)
- **num_inference_steps**: The number of inference steps to perform (int)
- **guidance_scale**: How closely the model should stick to your prompt (float)
- **seed**: The same seed and prompt will output the same image every time (int)
- **enable_safety_checker**: If true, the safety checker will be enabled (bool)


## FluxGeneral

FLUX.1 [dev] with Controlnets and Loras is a versatile text-to-image model that supports multiple AI extensions including LoRA, ControlNet conditioning, and IP-Adapter integration, enabling comprehensive control over image generation through various guidance methods.

Use cases:
- Create controlled image generations
- Apply multiple AI extensions
- Generate guided visual content
- Produce customized artwork
- Design with precise control

**Tags:** image, generation, controlnet, lora, ip-adapter, text-to-image, txt2img

**Fields:**
- **prompt**: The prompt to generate an image from (str)
- **image_size**: The size of the generated image (ImageSizePreset)
- **num_inference_steps**: The number of inference steps to perform (int)
- **guidance_scale**: How closely the model should stick to your prompt (CFG scale) (float)
- **real_cfg_scale**: Classical CFG scale as in SD1.5, SDXL, etc. (float)
- **use_real_cfg**: Uses classical CFG. Increases generation times and price when true (bool)
- **num_images**: The number of images to generate (int)
- **seed**: The same seed and prompt will output the same image every time (int)
- **enable_safety_checker**: If true, the safety checker will be enabled (bool)
- **reference_strength**: Strength of reference_only generation. Only used if a reference image is provided (float)
- **reference_end**: The percentage of total timesteps when reference guidance should end (float)
- **base_shift**: Base shift for the scheduled timesteps (float)
- **max_shift**: Max shift for the scheduled timesteps (float)


## FluxLora

FLUX.1 [dev] with LoRAs is a text-to-image model that supports LoRA adaptations, enabling rapid and high-quality image generation with pre-trained LoRA weights for personalization, specific styles, brand identities, and product-specific outputs.

Use cases:
- Create brand-specific visuals
- Generate custom styled images
- Adapt existing styles to new content
- Produce personalized artwork
- Design consistent visual identities

**Tags:** image, generation, lora, personalization, style-transfer, text-to-image, txt2img

**Fields:**
- **prompt**: The prompt to generate an image from (str)
- **image_size**: Either a preset size or a custom {width, height} dictionary (ImageSizePreset)
- **num_inference_steps**: The number of inference steps to perform (int)
- **guidance_scale**: The CFG scale to determine how closely the model follows the prompt (float)
- **loras**: List of LoRA weights to use for image generation (typing.List[nodetool.metadata.types.LoraWeight])
- **seed**: The same seed and prompt will output the same image every time (int)
- **enable_safety_checker**: If true, the safety checker will be enabled (bool)


## FluxLoraInpainting

FLUX.1 [dev] Inpainting with LoRAs is a text-to-image model that supports inpainting and LoRA adaptations,
specific styles, brand identities, and product-specific outputs.

**Tags:** enabling rapid and high-quality image inpainting using pre-trained LoRA weights for personalization,

**Fields:**
- **prompt**: The prompt to generate an image from (str)
- **image**: The input image to inpaint (ImageRef)
- **mask**: The mask indicating areas to inpaint (white=inpaint, black=keep) (ImageRef)
- **num_inference_steps**: The number of inference steps to perform (int)
- **guidance_scale**: The CFG scale to determine how closely the model follows the prompt (float)
- **strength**: The strength to use for inpainting. 1.0 completely remakes the image while 0.0 preserves the original (float)
- **loras**: List of LoRA weights to use for image generation (typing.List[nodetool.metadata.types.LoraWeight])
- **seed**: The same seed and prompt will output the same image every time (int)
- **enable_safety_checker**: If true, the safety checker will be enabled (bool)


## FluxLoraTTI

FLUX.1 with LoRAs is a text-to-image model that supports LoRA adaptations,
personalization, specific styles, and brand identities.

**Tags:** enabling high-quality image generation with customizable LoRA weights for

**Fields:**
- **prompt**: The prompt to generate an image from (str)
- **negative_prompt**: Use it to address details that you don't want in the image (str)
- **model_name**: The base model to use for generation (LoraModel)
- **image_size**: The size of the generated image (ImageSizePreset)
- **num_inference_steps**: The number of inference steps to perform (int)
- **guidance_scale**: How closely the model should stick to your prompt (float)
- **loras**: List of LoRA weights to use for image generation (typing.List[nodetool.metadata.types.LoraWeight])
- **prompt_weighting**: If true, prompt weighting syntax will be used and 77 token limit lifted (bool)
- **seed**: The same seed and prompt will output the same image every time (int)
- **enable_safety_checker**: If true, the safety checker will be enabled (bool)


## FluxSchnell

FLUX.1 [schnell] is a 12 billion parameter flow transformer that generates high-quality images

**Tags:** from text in 1 to 4 steps, suitable for personal and commercial use.

**Fields:**
- **prompt**: The prompt to generate an image from (str)
- **image_size**: Either a preset size or a custom {width, height} dictionary (ImageSizePreset)
- **num_inference_steps**: The number of inference steps to perform (int)
- **num_images**: The number of images to generate (int)
- **seed**: The same seed and prompt will output the same image every time (int)
- **enable_safety_checker**: If true, the safety checker will be enabled (bool)


## FluxSubject

FLUX.1 Subject is a super fast endpoint for the FLUX.1 [schnell] model with subject input capabilities, enabling rapid and high-quality image generation for personalization, specific styles, brand identities, and product-specific outputs.

Use cases:
- Create variations of existing subjects
- Generate personalized product images
- Design brand-specific visuals
- Produce custom character artwork
- Create subject-based illustrations

**Tags:** image, generation, subject-driven, personalization, fast, text-to-image, txt2img

**Fields:**
- **prompt**: The prompt to generate an image from (str)
- **image**: The image of the subject (ImageRef)
- **image_size**: Either a preset size or a custom {width, height} dictionary (ImageSizePreset)
- **num_inference_steps**: The number of inference steps to perform (int)
- **guidance_scale**: The CFG scale to determine how closely the model follows the prompt (float)
- **seed**: The same seed and prompt will output the same image every time (int)
- **enable_safety_checker**: If true, the safety checker will be enabled (bool)


## FluxV1Pro

FLUX1.1 [pro] is an enhanced version of FLUX.1 [pro], improved image generation capabilities, delivering superior composition, detail, and artistic fidelity compared to its predecessor.

Use cases:
- Generate high-fidelity artwork
- Create detailed illustrations
- Design complex compositions
- Produce artistic renderings
- Generate professional visuals

**Tags:** image, generation, composition, detail, artistic, text-to-image, txt2img

**Fields:**
- **prompt**: The prompt to generate an image from (str)
- **image_size**: Either a preset size or a custom {width, height} dictionary. Max dimension 14142 (ImageSizePreset)
- **guidance_scale**: The CFG (Classifier Free Guidance) scale is a measure of how close you want the model to stick to your prompt when looking for a related image to show you. (float)
- **num_inference_steps**: The number of inference steps to perform. (int)
- **seed**: The same seed and the same prompt given to the same version of the model will output the same image every time. (typing.Optional[int])


## FluxV1ProNew

FLUX.1 [pro] new is an accelerated version of FLUX.1 [pro], maintaining professional-grade

**Tags:** image quality while delivering significantly faster generation speeds.

**Fields:**
- **prompt**: The prompt to generate an image from (str)
- **image_size**: Either a preset size or a custom {width, height} dictionary (ImageSizePreset)
- **num_inference_steps**: The number of inference steps to perform (int)
- **guidance_scale**: The CFG scale to determine how closely the model follows the prompt (float)
- **num_images**: The number of images to generate (int)
- **seed**: The same seed and prompt will output the same image every time (int)
- **safety_tolerance**: Safety tolerance level (1=strict, 6=permissive) (int)


## FluxV1ProUltra

FLUX1.1 [ultra] is the latest and most advanced version of FLUX.1 [pro],
composition, detail, and artistic fidelity.

**Tags:** featuring cutting-edge improvements in image generation, delivering unparalleled

**Fields:**
- **prompt**: The prompt to generate an image from (str)
- **image_size**: Either a preset size or a custom {width, height} dictionary. Max dimension 14142 (ImageSizePreset)
- **guidance_scale**: The CFG (Classifier Free Guidance) scale is a measure of how close you want the model to stick to your prompt when looking for a related image to show you. (float)
- **num_inference_steps**: The number of inference steps to perform. (int)
- **seed**: The same seed and the same prompt given to the same version of the model will output the same image every time. (int)


## Fooocus

Fooocus is a text-to-image model with default parameters and automated optimizations

**Tags:** for quality improvements.

**Fields:**
- **prompt**: The prompt to generate an image from (str)
- **negative_prompt**: Use it to address details that you don't want in the image (str)
- **styles**: The styles to apply to the generated image (typing.List[str])
- **performance**: You can choose Speed or Quality (PerformanceEnum)
- **guidance_scale**: How closely the model should stick to your prompt (float)
- **sharpness**: Higher value means image and texture are sharper (float)
- **aspect_ratio**: The size of the generated image (must be multiples of 8) (str)
- **loras**: Up to 5 LoRAs that will be merged for generation (typing.List[nodetool.metadata.types.LoraWeight])
- **refiner_model**: Refiner model to use (SDXL or SD 1.5) (RefinerModelEnum)
- **refiner_switch**: Switch point for refiner (0.4 for SD1.5 realistic, 0.667 for SD1.5 anime, 0.8 for XL) (float)
- **seed**: The same seed and prompt will output the same image every time (int)
- **control_image**: Reference image for generation (ImageRef)
- **control_type**: The type of image control (ControlTypeEnum)
- **control_image_weight**: Strength of the control image influence (float)
- **control_image_stop_at**: When to stop applying control image influence (float)
- **enable_safety_checker**: If false, the safety checker will be disabled (bool)


## HyperSDXL

Hyper SDXL is a hyper-charged version of SDXL that delivers exceptional performance and creativity

**Tags:** while maintaining high-quality output and ultra-fast generation speeds.

**Fields:**
- **prompt**: The prompt to generate an image from (str)
- **image_size**: The size of the generated image (ImageSizePreset)
- **num_inference_steps**: The number of inference steps to perform (1, 2, or 4) (int)
- **sync_mode**: If true, wait for image generation and upload before returning (bool)
- **num_images**: The number of images to generate (int)
- **enable_safety_checker**: If true, the safety checker will be enabled (bool)
- **expand_prompt**: If true, the prompt will be expanded with additional prompts (bool)
- **seed**: The same seed and prompt will output the same image every time (int)


## IdeogramStyle

## IdeogramV2

Ideogram V2 is a state-of-the-art image generation model optimized for commercial and creative use, featuring exceptional typography handling and realistic outputs.

Use cases:
- Create commercial artwork and designs
- Generate realistic product visualizations
- Design marketing materials with text
- Produce high-quality illustrations
- Create brand assets and logos

**Tags:** image, generation, ai, typography, realistic, text-to-image, txt2img

**Fields:**
- **prompt**: The prompt to generate an image from (str)
- **aspect_ratio**: The aspect ratio of the generated image. (AspectRatio)
- **expand_prompt**: Whether to expand the prompt with MagicPrompt functionality. (bool)
- **style**: The style of the generated image. (IdeogramStyle)
- **negative_prompt**: A negative prompt to avoid in the generated image. (str)
- **seed**: Seed for the random number generator. (int)


## IdeogramV2Turbo

Accelerated image generation with Ideogram V2 Turbo. Create high-quality visuals, posters,

**Tags:** and logos with enhanced speed while maintaining Ideogram's signature quality.

**Fields:**
- **prompt**: The prompt to generate an image from (str)
- **aspect_ratio**: The aspect ratio of the generated image. (AspectRatio)
- **expand_prompt**: Whether to expand the prompt with MagicPrompt functionality. (bool)
- **style**: The style of the generated image. (IdeogramStyle)
- **negative_prompt**: A negative prompt to avoid in the generated image. (str)
- **seed**: Seed for the random number generator. (int)


## IllusionDiffusion

Illusion Diffusion is a model that creates illusions conditioned on an input image.

**Fields:**
- **prompt**: The prompt to generate an image from (str)
- **negative_prompt**: Use it to address details that you don't want in the image (str)
- **image**: Input image URL for conditioning the generation (ImageRef)
- **guidance_scale**: How closely the model should stick to your prompt (float)
- **num_inference_steps**: The number of inference steps to perform (int)
- **image_size**: The size of the generated image (ImageSizePreset)
- **seed**: The same seed and prompt will output the same image every time (int)


## ImageSizePreset

## LCMDiffusion

Latent Consistency Models (SDXL & SDv1.5) Text to Image produces high-quality images

**Tags:** with minimal inference steps.

**Fields:**
- **prompt**: The prompt to generate an image from (str)
- **model**: The model to use for generating the image (ModelNameLCM)
- **negative_prompt**: Use it to address details that you don't want in the image (str)
- **image_size**: The size of the generated image (ImageSizePreset)
- **num_inference_steps**: The number of inference steps to perform (int)
- **guidance_scale**: How closely the model should stick to your prompt (float)
- **enable_safety_checker**: If true, the safety checker will be enabled (bool)
- **seed**: The same seed and prompt will output the same image every time (int)


## LoraModel

## LumaPhoton

Luma Photon is a creative and personalizable text-to-image model that brings a step-function

**Tags:** change in the cost of high-quality image generation, optimized for creatives.

**Fields:**
- **prompt**: The prompt to generate an image from (str)
- **aspect_ratio**: The aspect ratio of the generated image (AspectRatioLuma)


## LumaPhotonFlash

Luma Photon Flash is the most creative, personalizable, and intelligent visual model for creatives,

**Tags:** bringing a step-function change in the cost of high-quality image generation with faster inference times.

**Fields:**
- **prompt**: The prompt to generate an image from (str)
- **aspect_ratio**: The aspect ratio of the generated image (AspectRatioLuma)


## ModelNameEnum

## ModelNameFastLCM

## ModelNameLCM

## OmniGenV1

OmniGen is a unified image generation model that can generate a wide range of images from multi-modal prompts. It can be used for various tasks such as Image Editing, Personalized Image Generation, Virtual Try-On, Multi Person Generation and more!

Use cases:
- Edit and modify existing images
- Create personalized visual content
- Generate virtual try-on images
- Create multi-person compositions
- Combine multiple images creatively

**Tags:** image, generation, multi-modal, editing, personalization, text-to-image, txt2img

**Fields:**
- **prompt**: The prompt to generate an image from (str)
- **input_image_1**: The first input image to use for generation (ImageRef)
- **input_image_2**: The second input image to use for generation (ImageRef)
- **image_size**: The size of the generated image (ImageSizePreset)
- **num_inference_steps**: The number of inference steps to perform (int)
- **guidance_scale**: How closely the model should stick to your prompt (float)
- **img_guidance_scale**: How closely the model should stick to your input image (float)
- **num_images**: The number of images to generate (int)
- **seed**: The same seed and prompt will output the same image every time (int)
- **enable_safety_checker**: If true, the safety checker will be enabled (bool)


## PerformanceEnum

## PlaygroundV25

Playground v2.5 is a state-of-the-art open-source model that excels in aesthetic quality

**Tags:** for text-to-image generation.

**Fields:**
- **prompt**: The prompt to generate an image from (str)
- **image_size**: The size of the generated image (ImageSizePreset)
- **num_inference_steps**: The number of inference steps to perform (int)
- **guidance_scale**: How closely the model should stick to your prompt (float)
- **seed**: The same seed and prompt will output the same image every time (int)
- **enable_safety_checker**: If true, the safety checker will be enabled (bool)


## Recraft20B

Recraft 20B is a new and affordable text-to-image model that delivers state-of-the-art results.

Use cases:
- Generate cost-effective visuals
- Create high-quality images
- Produce professional artwork
- Design marketing materials
- Generate commercial content

**Tags:** image, generation, efficient, text-to-image, txt2img

**Fields:**
- **prompt**: The prompt to generate an image from (str)
- **image_size**: Either a preset size or a custom {width, height} dictionary (ImageSizePreset)
- **style**: The style of the generated images. Vector images cost 2X as much. (StylePreset)
- **colors**: An array of preferable colors (typing.List[nodetool.metadata.types.ColorRef])
- **style_id**: The ID of the custom style reference (optional) (str)


## RecraftV3

Recraft V3 is a text-to-image model with the ability to generate long texts, vector art, images in brand style, and much more.

**Tags:** image, text

**Fields:**
- **prompt**: The prompt to generate an image from (str)
- **image_size**: Either a preset size or a custom {width, height} dictionary. Max dimension 14142 (ImageSizePreset)
- **style**: The style of the generated images. Vector images cost 2X as much. (StylePreset)
- **colors**: An array of preferable colors (typing.List[nodetool.metadata.types.ColorRef])
- **style_id**: The ID of the custom style reference (optional) (str)


## RefinerModelEnum

## SafetyCheckerVersion

## SanaV1

Sana can synthesize high-resolution, high-quality images with strong text-image alignment at a remarkably fast speed, with the ability to generate 4K images in less than a second.

Use cases:
- Generate 4K quality images
- Create high-resolution artwork
- Produce rapid visual prototypes
- Design detailed illustrations
- Generate precise text-aligned visuals

**Tags:** image, generation, high-resolution, fast, text-alignment, text-to-image, txt2img

**Fields:**
- **prompt**: The prompt to generate an image from (str)
- **negative_prompt**: Use it to address details that you don't want in the image (str)
- **image_size**: The size of the generated image (ImageSizePreset)
- **num_inference_steps**: The number of inference steps to perform (int)
- **guidance_scale**: How closely the model should stick to your prompt (float)
- **num_images**: The number of images to generate (int)
- **seed**: The same seed and prompt will output the same image every time (int)
- **enable_safety_checker**: If true, the safety checker will be enabled (bool)


## StableCascade

Stable Cascade is a state-of-the-art text-to-image model that generates images on a smaller & cheaper

**Tags:** latent space while maintaining high quality output.

**Fields:**
- **prompt**: The prompt to generate an image from (str)
- **negative_prompt**: Use it to address details that you don't want in the image (str)
- **first_stage_steps**: Number of steps to run the first stage for (int)
- **second_stage_steps**: Number of steps to run the second stage for (int)
- **guidance_scale**: How closely the model should stick to your prompt (float)
- **second_stage_guidance_scale**: Guidance scale for the second stage of generation (float)
- **image_size**: The size of the generated image (ImageSizePreset)
- **seed**: The same seed and prompt will output the same image every time (int)
- **enable_safety_checker**: If true, the safety checker will be enabled (bool)


## StableDiffusionV35Large

Stable Diffusion 3.5 Large is a Multimodal Diffusion Transformer (MMDiT) text-to-image model that features

**Tags:** improved performance in image quality, typography, complex prompt understanding, and resource-efficiency.

**Fields:**
- **prompt**: The prompt to generate an image from (str)
- **negative_prompt**: Use it to address details that you don't want in the image (str)
- **num_inference_steps**: The number of inference steps to perform (int)
- **guidance_scale**: How closely the model should stick to your prompt (float)
- **image_size**: The size of the generated image (ImageSizePreset)
- **seed**: The same seed and prompt will output the same image every time (int)
- **enable_safety_checker**: If true, the safety checker will be enabled (bool)


## StableDiffusionV3Medium

Stable Diffusion 3 Medium (Text to Image) is a Multimodal Diffusion Transformer (MMDiT) model

**Tags:** that improves image quality, typography, prompt understanding, and efficiency.

**Fields:**
- **prompt**: The prompt to generate an image from (str)
- **negative_prompt**: The negative prompt to generate an image from (str)
- **prompt_expansion**: If set to true, prompt will be upsampled with more details (bool)
- **image_size**: The size of the generated image (ImageSizePreset)
- **num_inference_steps**: The number of inference steps to perform (int)
- **guidance_scale**: How closely the model should stick to your prompt (CFG scale) (float)
- **num_images**: The number of images to generate (int)
- **seed**: The same seed and prompt will output the same image every time (int)
- **enable_safety_checker**: If true, the safety checker will be enabled (bool)


## StylePreset

## Switti

Switti is a scale-wise transformer for fast text-to-image generation that outperforms existing T2I AR models and competes with state-of-the-art T2I diffusion models while being faster than distilled diffusion models.

Use cases:
- Rapid image prototyping
- Real-time image generation
- Quick visual concept testing
- Fast artistic visualization
- Efficient batch image creation

**Tags:** image, generation, fast, transformer, efficient, text-to-image, txt2img

**Fields:**
- **prompt**: The prompt to generate an image from (str)
- **negative_prompt**: Use it to address details that you don't want in the image (str)
- **sampling_top_k**: The number of top-k tokens to sample from (int)
- **sampling_top_p**: The top-p probability to sample from (float)
- **more_smooth**: Smoothing with Gumbel softmax sampling (bool)
- **more_diverse**: More diverse sampling (bool)
- **smooth_start_si**: Smoothing starting scale (int)
- **turn_off_cfg_start_si**: Disable CFG starting scale (int)
- **last_scale_temp**: Temperature after disabling CFG (float)
- **seed**: The same seed and prompt will output the same image every time (int)
- **guidance_scale**: How closely the model should stick to your prompt (float)
- **enable_safety_checker**: If true, the safety checker will be enabled (bool)


