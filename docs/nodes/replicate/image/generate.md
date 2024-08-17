# nodetool.nodes.replicate.image.generate

## AdInpaint

Product advertising image generator

**Fields:**
- **pixel**: image total pixel (Pixel)
- **scale**: Factor to scale image by (maximum: 4) (int)
- **prompt**: Product name or prompt (str | None)
- **image_num**: Number of image to generate (int)
- **image_path**: input image (ImageRef)
- **manual_seed**: Manual Seed (int)
- **product_size**: Max product size (Product_size)
- **guidance_scale**: Guidance Scale (float)
- **negative_prompt**: Anything you don't want in the photo (str)
- **num_inference_steps**: Inference Steps (int)


## ConsistentCharacter

Create images of a given character in different poses

**Fields:**
- **seed**: Set a seed for reproducibility. Random by default. (int | None)
- **prompt**: Describe the subject. Include clothes and hairstyle for more consistency. (str)
- **subject**: An image of a person. Best images are square close ups of a face, but they do not have to be. (ImageRef)
- **output_format**: Format of the output images (Output_format)
- **output_quality**: Quality of the output images, from 0 to 100. 100 is best quality, 0 is lowest quality. (int)
- **negative_prompt**: Things you do not want to see in your image (str)
- **randomise_poses**: Randomise the poses used. (bool)
- **number_of_outputs**: The number of images to generate. (int)
- **disable_safety_checker**: Disable safety checker for generated images. (bool)
- **number_of_images_per_pose**: The number of images to generate for each pose. (int)


## Controlnet_Realistic_Vision

controlnet 1.1 lineart x realistic-vision-v2.0 (updated to v5)

**Fields:**
- **seed**: Leave blank to randomize (int | None)
- **image**: Input image (ImageRef)
- **steps**:  num_inference_steps (int)
- **prompt** (str)
- **strength**: control strength/weight (float)
- **max_width**: max width of mask/image (float)
- **max_height**: max height of mask/image (float)
- **guidance_scale**: guidance_scale (int)
- **negative_prompt** (str)


## Controlnet_X_IP_Adapter_Realistic_Vision_V5

Inpainting || multi-controlnet || single-controlnet || ip-adapter || ip adapter face || ip adapter plus || No ip adapter

**Fields:**
- **eta**: Controls the amount of noise that is added to the input data during the denoising diffusion process. Higher value -> more noise (float)
- **seed**: Seed (int | None)
- **prompt**: Prompt - using compel, use +++ to increase words weight:: doc: https://github.com/damian0815/compel/tree/main/doc || https://invoke-ai.github.io/InvokeAI/features/PROMPTS/#attention-weighting (str | None)
- **max_width**: Max width/Resolution of image (int)
- **scheduler**: Choose a scheduler. (Scheduler)
- **guess_mode**: In this mode, the ControlNet encoder will try best to recognize the content of the input image even if you remove all prompts. The `guidance_scale` between 3.0 and 5.0 is recommended. (bool)
- **int_kwargs** (str)
- **mask_image**: mask image for inpainting controlnet (ImageRef)
- **max_height**: Max height/Resolution of image (int)
- **tile_image**: Control image for tile controlnet (ImageRef)
- **num_outputs**: Number of images to generate (int)
- **img2img_image**: Image2image image (str | None)
- **lineart_image**: Control image for canny controlnet (ImageRef)
- **guidance_scale**: Scale for classifier-free guidance (float)
- **scribble_image**: Control image for scribble controlnet (ImageRef)
- **ip_adapter_ckpt**: IP Adapter checkpoint (Ip_adapter_ckpt)
- **negative_prompt**: Negative prompt - using compel, use +++ to increase words weight//// negative-embeddings available ///// FastNegativeV2 , boring_e621_v4 , verybadimagenegative_v1 || to use them, write their keyword in negative prompt (str)
- **brightness_image**: Control image for brightness controlnet (ImageRef)
- **img2img_strength**: img2img strength, does not work when inpainting image is given, 0.1-same image, 0.99-complete destruction of image (float)
- **inpainting_image**: Control image for inpainting controlnet (ImageRef)
- **ip_adapter_image**: IP Adapter image (str | None)
- **ip_adapter_weight**: IP Adapter weight (float)
- **sorted_controlnets**: Comma seperated string of controlnet names, list of names: tile, inpainting, lineart,depth ,scribble , brightness /// example value: tile, inpainting, lineart  (str)
- **inpainting_strength**: inpainting strength (float)
- **num_inference_steps**: Steps to run denoising (int)
- **disable_safety_check**: Disable safety check. Use at your own risk! (bool)
- **film_grain_lora_weight**: disabled on 0 (float)
- **negative_auto_mask_text**: // seperated list of objects you dont want to mask - 'hairs // eyes // cloth'  (str | None)
- **positive_auto_mask_text**: // seperated list of objects for mask, AI will auto create mask of these objects, if mask text is given, mask image will not work - 'hairs // eyes // cloth' (str | None)
- **tile_conditioning_scale**: Conditioning scale for tile controlnet (float)
- **add_more_detail_lora_scale**: Scale/ weight of more_details lora, more scale = more details, disabled on 0 (float)
- **detail_tweaker_lora_weight**: disabled on 0 (float)
- **lineart_conditioning_scale**: Conditioning scale for canny controlnet (float)
- **scribble_conditioning_scale**: Conditioning scale for scribble controlnet (float)
- **epi_noise_offset_lora_weight**: disabled on 0 (float)
- **brightness_conditioning_scale**: Conditioning scale for brightness controlnet (float)
- **inpainting_conditioning_scale**: Conditioning scale for inpaint controlnet (float)
- **color_temprature_slider_lora_weight**: disabled on 0 (float)


## EpicRealismXL_Lightning_Hades

Fast and high quality lightning model, epiCRealismXL-Lightning Hades

**Fields:**
- **seed**: Set a seed for reproducibility. Random by default. (int | None)
- **width** (int)
- **height** (int)
- **prompt** (str)
- **output_format**: Format of the output images (Output_format)
- **output_quality**: Quality of the output images, from 0 to 100. 100 is best quality, 0 is lowest quality. (int)
- **negative_prompt**: Things you do not want to see in your image (str)
- **number_of_images**: Number of images to generate (int)
- **disable_safety_checker**: Disable safety checker for generated images. (bool)


## Illusions

Create illusions with img2img and masking support

**Fields:**
- **seed** (int | None)
- **image**: Optional img2img (ImageRef)
- **width** (int)
- **height** (int)
- **prompt** (str)
- **mask_image**: Optional mask for inpainting (ImageRef)
- **num_outputs**: Number of outputs (int)
- **control_image**: Control image (ImageRef)
- **controlnet_end**: When controlnet conditioning ends (float)
- **guidance_scale**: Scale for classifier-free guidance (float)
- **negative_prompt**: The negative prompt to guide image generation. (str)
- **prompt_strength**: Prompt strength when using img2img / inpaint. 1.0 corresponds to full destruction of information in image (float)
- **sizing_strategy**: Decide how to resize images – use width/height, resize based on input image or control image (Sizing_strategy)
- **controlnet_start**: When controlnet conditioning starts (float)
- **num_inference_steps**: Number of diffusion steps (int)
- **controlnet_conditioning_scale**: How strong the controlnet conditioning is (float)


## Juggernaut_XL_V9

Juggernaut XL v9

**Fields:**
- **seed**: Random seed. Leave blank to randomize the seed (int | None)
- **width**: Width of output image (int)
- **height**: Height of output image (int)
- **prompt**: Input prompt (str)
- **scheduler**: scheduler (Scheduler)
- **num_outputs**: Number of images to output. (int)
- **guidance_scale**: Scale for classifier-free guidance (float)
- **apply_watermark**: Applies a watermark to enable determining if an image is generated in downstream applications. If you have other provisions for generating or deploying images safely, you can use this to disable watermarking. (bool)
- **negative_prompt**: Input Negative Prompt (str)
- **num_inference_steps**: Number of denoising steps (int)
- **disable_safety_checker**: Disable safety checker for generated images. This feature is only available through the API. See [https://replicate.com/docs/how-does-replicate-work#safety](https://replicate.com/docs/how-does-replicate-work#safety) (bool)


## Kandinsky

multilingual text2image latent diffusion model

**Fields:**
- **seed**: Random seed. Leave blank to randomize the seed (int | None)
- **width**: Width of output image. Lower the setting if hits memory limits. (Width)
- **height**: Height of output image. Lower the setting if hits memory limits. (Height)
- **prompt**: Input prompt (str)
- **num_outputs**: Number of images to output. (int)
- **output_format**: Output image format (Output_format)
- **negative_prompt**: Specify things to not see in the output (str | None)
- **num_inference_steps**: Number of denoising steps (int)
- **num_inference_steps_prior**: Number of denoising steps for priors (int)


## OpenDalle_Lora

Better than SDXL at both prompt adherence and image quality, by dataautogpt3

**Fields:**
- **mask**: Input mask for inpaint mode. Black areas will be preserved, white areas will be inpainted. (ImageRef)
- **seed**: Random seed. Leave blank to randomize the seed (int | None)
- **image**: Input image for img2img or inpaint mode (ImageRef)
- **width**: Width of output image (int)
- **height**: Height of output image (int)
- **prompt**: Input prompt (str)
- **refine**: Which refine style to use (Refine)
- **scheduler**: scheduler (Scheduler)
- **lora_scale**: LoRA additive scale. Only applicable on trained models. (float)
- **num_outputs**: Number of images to output. (int)
- **lora_weights**: Replicate LoRA weights to use. Leave blank to use the default weights. (str | None)
- **refine_steps**: For base_image_refiner, the number of steps to refine, defaults to num_inference_steps (int | None)
- **guidance_scale**: Scale for classifier-free guidance (float)
- **apply_watermark**: Applies a watermark to enable determining if an image is generated in downstream applications. If you have other provisions for generating or deploying images safely, you can use this to disable watermarking. (bool)
- **high_noise_frac**: For expert_ensemble_refiner, the fraction of noise to use (float)
- **negative_prompt**: Input Negative Prompt (str)
- **prompt_strength**: Prompt strength when using img2img / inpaint. 1.0 corresponds to full destruction of information in image (float)
- **num_inference_steps**: Number of denoising steps (int)
- **disable_safety_checker**: Disable safety checker for generated images. This feature is only available through the API. See [https://replicate.com/docs/how-does-replicate-work#safety](https://replicate.com/docs/how-does-replicate-work#safety) (bool)


## PlaygroundV2

Playground v2.5 is the state-of-the-art open-source model in aesthetic quality

**Fields:**
- **mask**: Input mask for inpaint mode. Black areas will be preserved, white areas will be inpainted. (str | None)
- **seed**: Random seed. Leave blank to randomize the seed (int | None)
- **image**: Input image for img2img or inpaint mode (ImageRef)
- **width**: Width of output image (int)
- **height**: Height of output image (int)
- **prompt**: Input prompt (str)
- **scheduler**: Scheduler. DPMSolver++ or DPM++2MKarras is recommended for most cases (Scheduler)
- **num_outputs**: Number of images to output. (int)
- **guidance_scale**: Scale for classifier-free guidance (float)
- **apply_watermark**: Applies a watermark to enable determining if an image is generated in downstream applications. If you have other provisions for generating or deploying images safely, you can use this to disable watermarking. (bool)
- **negative_prompt**: Negative Input prompt (str)
- **prompt_strength**: Prompt strength when using img2img / inpaint. 1.0 corresponds to full destruction of information in image (float)
- **num_inference_steps**: Number of denoising steps (int)
- **disable_safety_checker**: Disable safety checker for generated images. This feature is only available through the API. See https://replicate.com/docs/how-does-replicate-work#safety (bool)


## Proteus

ProteusV0.4: The Style Update

**Fields:**
- **mask**: Input mask for inpaint mode. Black areas will be preserved, white areas will be inpainted. (ImageRef)
- **seed**: Random seed. Leave blank to randomize the seed (int | None)
- **image**: Input image for img2img or inpaint mode (ImageRef)
- **width**: Width of output image. Recommended 1024 or 1280 (int)
- **height**: Height of output image. Recommended 1024 or 1280 (int)
- **prompt**: Input prompt (str)
- **scheduler**: scheduler (Scheduler)
- **num_outputs**: Number of images to output. (int)
- **guidance_scale**: Scale for classifier-free guidance. Recommended 4-6 (float)
- **apply_watermark**: Applies a watermark to enable determining if an image is generated in downstream applications. If you have other provisions for generating or deploying images safely, you can use this to disable watermarking. (bool)
- **negative_prompt**: Negative Input prompt (str)
- **prompt_strength**: Prompt strength when using img2img / inpaint. 1.0 corresponds to full destruction of information in image (float)
- **num_inference_steps**: Number of denoising steps. 20 to 60 steps for more detail, 20 steps for faster results. (int)
- **disable_safety_checker**: Disable safety checker for generated images. This feature is only available through the API. See https://replicate.com/docs/how-does-replicate-work#safety (bool)


## PulidBase

Use a face to make images. Uses SDXL fine-tuned checkpoints.

**Fields:**
- **seed**: Set a seed for reproducibility. Random by default. (int | None)
- **width**: Width of the output image (ignored if structure image given) (int)
- **height**: Height of the output image (ignored if structure image given) (int)
- **prompt**: You might need to include a gender in the prompt to get the desired result (str)
- **face_image**: The face image to use for the generation (ImageRef)
- **face_style**: Style of the face (Face_style)
- **output_format**: Format of the output images (Output_format)
- **output_quality**: Quality of the output images, from 0 to 100. 100 is best quality, 0 is lowest quality. (int)
- **negative_prompt**: Things you do not want to see in your image (str)
- **checkpoint_model**: Model to use for the generation (Checkpoint_model)
- **number_of_images**: Number of images to generate (int)


## RealVisXL2_LCM

RealvisXL-v2.0 with LCM LoRA - requires fewer steps (4 to 8 instead of the original 40 to 50)

**Fields:**
- **mask**: Input mask for inpaint mode. Black areas will be preserved, white areas will be inpainted. (ImageRef)
- **seed**: Random seed. Leave blank to randomize the seed (int | None)
- **image**: Input image for img2img or inpaint mode (ImageRef)
- **width**: Width of output image (int)
- **height**: Height of output image (int)
- **prompt**: Input prompt (str)
- **scheduler**: scheduler (Scheduler)
- **num_outputs**: Number of images to output. (int)
- **guidance_scale**: Scale for classifier-free guidance (float)
- **apply_watermark**: Applies a watermark to enable determining if an image is generated in downstream applications. If you have other provisions for generating or deploying images safely, you can use this to disable watermarking. (bool)
- **negative_prompt**: Negative Input prompt (str)
- **prompt_strength**: Prompt strength when using img2img / inpaint. 1.0 corresponds to full destruction of information in image (float)
- **num_inference_steps**: Number of denoising steps (int)
- **disable_safety_checker**: Disable safety checker for generated images. This feature is only available through the API. See https://replicate.com/docs/how-does-replicate-work#safety (bool)


## RealVisXL_V2

Implementation of SDXL RealVisXL_V2.0

**Fields:**
- **mask**: Input mask for inpaint mode. Black areas will be preserved, white areas will be inpainted. (ImageRef)
- **seed**: Random seed. Leave blank to randomize the seed (int | None)
- **image**: Input image for img2img or inpaint mode (ImageRef)
- **width**: Width of output image (int)
- **height**: Height of output image (int)
- **prompt**: Input prompt (str)
- **scheduler**: scheduler (Scheduler)
- **lora_scale**: LoRA additive scale. Only applicable on trained models. (float)
- **num_outputs**: Number of images to output. (int)
- **lora_weights**: Replicate LoRA weights to use. Leave blank to use the default weights. (str | None)
- **guidance_scale**: Scale for classifier-free guidance (float)
- **apply_watermark**: Applies a watermark to enable determining if an image is generated in downstream applications. If you have other provisions for generating or deploying images safely, you can use this to disable watermarking. (bool)
- **negative_prompt**: Negative Input prompt (str)
- **prompt_strength**: Prompt strength when using img2img / inpaint. 1.0 corresponds to full destruction of information in image (float)
- **num_inference_steps**: Number of denoising steps (int)
- **disable_safety_checker**: Disable safety checker for generated images. This feature is only available through the API. See https://replicate.com/docs/how-does-replicate-work#safety (bool)


## RealVisXL_V3_Multi_Controlnet_Lora

RealVisXl V3 with multi-controlnet, lora loading, img2img, inpainting

**Fields:**
- **mask**: Input mask for inpaint mode. Black areas will be preserved, white areas will be inpainted. (ImageRef)
- **seed**: Random seed. Leave blank to randomize the seed (int | None)
- **image**: Input image for img2img or inpaint mode (ImageRef)
- **width**: Width of output image (int)
- **height**: Height of output image (int)
- **prompt**: Input prompt (str)
- **refine**: Which refine style to use (Refine)
- **scheduler**: scheduler (Scheduler)
- **lora_scale**: LoRA additive scale. Only applicable on trained models. (float)
- **num_outputs**: Number of images to output (int)
- **controlnet_1**: Controlnet (Controlnet_1)
- **controlnet_2**: Controlnet (Controlnet_2)
- **controlnet_3**: Controlnet (Controlnet_3)
- **lora_weights**: Replicate LoRA weights to use. Leave blank to use the default weights. (str | None)
- **refine_steps**: For base_image_refiner, the number of steps to refine, defaults to num_inference_steps (int | None)
- **guidance_scale**: Scale for classifier-free guidance (float)
- **apply_watermark**: Applies a watermark to enable determining if an image is generated in downstream applications. If you have other provisions for generating or deploying images safely, you can use this to disable watermarking. (bool)
- **negative_prompt**: Negative Prompt (str)
- **prompt_strength**: Prompt strength when using img2img / inpaint. 1.0 corresponds to full destruction of information in image (float)
- **sizing_strategy**: Decide how to resize images – use width/height, resize based on input image or control image (Sizing_strategy)
- **controlnet_1_end**: When controlnet conditioning ends (float)
- **controlnet_2_end**: When controlnet conditioning ends (float)
- **controlnet_3_end**: When controlnet conditioning ends (float)
- **controlnet_1_image**: Input image for first controlnet (ImageRef)
- **controlnet_1_start**: When controlnet conditioning starts (float)
- **controlnet_2_image**: Input image for second controlnet (ImageRef)
- **controlnet_2_start**: When controlnet conditioning starts (float)
- **controlnet_3_image**: Input image for third controlnet (ImageRef)
- **controlnet_3_start**: When controlnet conditioning starts (float)
- **num_inference_steps**: Number of denoising steps (int)
- **disable_safety_checker**: Disable safety checker for generated images. This feature is only available through the API. (bool)
- **controlnet_1_conditioning_scale**: How strong the controlnet conditioning is (float)
- **controlnet_2_conditioning_scale**: How strong the controlnet conditioning is (float)
- **controlnet_3_conditioning_scale**: How strong the controlnet conditioning is (float)


## SD3_Explorer

A model for experimenting with all the SD3 settings. Non-commercial use only unless you have a Stability AI membership.

**Fields:**
- **seed**: Set a seed for reproducibility. Random by default. (int | None)
- **model**: Pick whether to use T5-XXL in fp16, fp8 or not at all (Model)
- **shift**: The timestep scheduling shift. Try values 6.0 and 2.0 to experiment with effects. (float)
- **steps**: The number of steps to run the diffusion model for (int)
- **width**: The width of the image (int)
- **height**: The height of the image (int)
- **prompt**: This prompt is ignored when using the triple prompt mode. See below. (str)
- **sampler**: The sampler to use for the diffusion model (Sampler)
- **scheduler**: The scheduler to use for the diffusion model (Scheduler)
- **output_format**: Format of the output images (Output_format)
- **guidance_scale**: The guidance scale tells the model how similar the output should be to the prompt. (float)
- **output_quality**: Quality of the output images, from 0 to 100. 100 is best quality, 0 is lowest quality. (int)
- **negative_prompt**: Negative prompts do not really work in SD3. This will simply cause your output image to vary in unpredictable ways. (str)
- **number_of_images**: The number of images to generate (int)
- **triple_prompt_t5**: The prompt that will be passed to just the T5-XXL model. (str)
- **use_triple_prompt** (bool)
- **triple_prompt_clip_g**: The prompt that will be passed to just the CLIP-G model. (str)
- **triple_prompt_clip_l**: The prompt that will be passed to just the CLIP-L model. (str)
- **negative_conditioning_end**: When the negative conditioning should stop being applied. By default it is disabled. (float)
- **triple_prompt_empty_padding**: Whether to add padding for empty prompts. Useful if you only want to pass a prompt to one or two of the three text encoders. Has no effect when all prompts are filled. Disable this for interesting effects. (bool)


## SDXL_Ad_Inpaint

Product advertising image generator using SDXL

**Fields:**
- **seed**: Empty or 0 for a random image (int | None)
- **image**: Remove background from this image (ImageRef)
- **prompt**: Describe the new setting for your product (str | None)
- **img_size**: Possible SDXL image sizes (Img_size)
- **apply_img**: Applies the original product image to the final result (bool)
- **scheduler**: scheduler (Scheduler)
- **product_fill**: What percentage of the image width to fill with product (Product_fill)
- **guidance_scale**: Guidance Scale (float)
- **condition_scale**: controlnet conditioning scale for generalization (float)
- **negative_prompt**: Describe what you do not want in your setting (str)
- **num_refine_steps**: Number of steps to refine (int)
- **num_inference_steps**: Inference Steps (int)


## SDXL_Controlnet

SDXL ControlNet - Canny

**Fields:**
- **seed**: Random seed. Set to 0 to randomize the seed (int)
- **image**: Input image for img2img or inpaint mode (ImageRef)
- **prompt**: Input prompt (str)
- **condition_scale**: controlnet conditioning scale for generalization (float)
- **negative_prompt**: Input Negative Prompt (str)
- **num_inference_steps**: Number of denoising steps (int)


## SDXL_Emoji

An SDXL fine-tune based on Apple Emojis

**Fields:**
- **mask**: Input mask for inpaint mode. Black areas will be preserved, white areas will be inpainted. (ImageRef)
- **seed**: Random seed. Leave blank to randomize the seed (int | None)
- **image**: Input image for img2img or inpaint mode (ImageRef)
- **width**: Width of output image (int)
- **height**: Height of output image (int)
- **prompt**: Input prompt (str)
- **refine**: Which refine style to use (Refine)
- **scheduler**: scheduler (Scheduler)
- **lora_scale**: LoRA additive scale. Only applicable on trained models. (float)
- **num_outputs**: Number of images to output. (int)
- **refine_steps**: For base_image_refiner, the number of steps to refine, defaults to num_inference_steps (int | None)
- **guidance_scale**: Scale for classifier-free guidance (float)
- **apply_watermark**: Applies a watermark to enable determining if an image is generated in downstream applications. If you have other provisions for generating or deploying images safely, you can use this to disable watermarking. (bool)
- **high_noise_frac**: For expert_ensemble_refiner, the fraction of noise to use (float)
- **negative_prompt**: Input Negative Prompt (str)
- **prompt_strength**: Prompt strength when using img2img / inpaint. 1.0 corresponds to full destruction of information in image (float)
- **replicate_weights**: Replicate LoRA weights to use. Leave blank to use the default weights. (str | None)
- **num_inference_steps**: Number of denoising steps (int)


## SDXL_Pixar

Create Pixar poster easily with SDXL Pixar.

**Fields:**
- **mask**: Input mask for inpaint mode. Black areas will be preserved, white areas will be inpainted. (ImageRef)
- **seed**: Random seed. Leave blank to randomize the seed (int | None)
- **image**: Input image for img2img or inpaint mode (ImageRef)
- **width**: Width of output image (int)
- **height**: Height of output image (int)
- **prompt**: Input prompt (str)
- **refine**: Which refine style to use (Refine)
- **scheduler**: scheduler (Scheduler)
- **lora_scale**: LoRA additive scale. Only applicable on trained models. (float)
- **num_outputs**: Number of images to output. (int)
- **refine_steps**: For base_image_refiner, the number of steps to refine, defaults to num_inference_steps (int | None)
- **guidance_scale**: Scale for classifier-free guidance (float)
- **apply_watermark**: Applies a watermark to enable determining if an image is generated in downstream applications. If you have other provisions for generating or deploying images safely, you can use this to disable watermarking. (bool)
- **high_noise_frac**: For expert_ensemble_refiner, the fraction of noise to use (float)
- **negative_prompt**: Input Negative Prompt (str)
- **prompt_strength**: Prompt strength when using img2img / inpaint. 1.0 corresponds to full destruction of information in image (float)
- **replicate_weights**: Replicate LoRA weights to use. Leave blank to use the default weights. (str | None)
- **num_inference_steps**: Number of denoising steps (int)


## StableDiffusion

A latent text-to-image diffusion model capable of generating photo-realistic images given any text input

**Fields:**
- **seed**: Random seed. Leave blank to randomize the seed (int | None)
- **width**: Width of generated image in pixels. Needs to be a multiple of 64 (Width)
- **height**: Height of generated image in pixels. Needs to be a multiple of 64 (Height)
- **prompt**: Input prompt (str)
- **scheduler**: Choose a scheduler. (Scheduler)
- **num_outputs**: Number of images to generate. (int)
- **guidance_scale**: Scale for classifier-free guidance (float)
- **negative_prompt**: Specify things to not see in the output (str | None)
- **num_inference_steps**: Number of denoising steps (int)


## StableDiffusion3

A text-to-image model with greatly improved performance in image quality, typography, complex prompt understanding, and resource-efficiency

**Fields:**
- **seed**: Random seed. Leave blank to randomize the seed (int | None)
- **image**: Input image for img2img mode (str | None)
- **prompt**: Input prompt (str)
- **num_outputs**: Number of images to output. (int)
- **aspect_ratio**: Aspect ratio for the generated image (Aspect_ratio)
- **output_format**: Format of the output images (Output_format)
- **guidance_scale**: Scale for classifier-free guidance (float)
- **output_quality**: Quality when saving the output images, from 0 to 100. 100 is best quality, 0 is lowest quality. Not relevant for .png outputs (int)
- **negative_prompt**: Input negative prompt (str)
- **prompt_strength**: Prompt strength when using img2img. 1.0 corresponds to full destruction of information in image (float)
- **disable_safety_checker**: Disable safety checker for generated images. This feature is only available through the API. See [https://replicate.com/docs/how-does-replicate-work#safety](https://replicate.com/docs/how-does-replicate-work#safety) (bool)


## StableDiffusionInpainting

SDXL Inpainting developed by the HF Diffusers team

**Fields:**
- **mask**: Mask image - make sure it's the same size as the input image (str | None)
- **seed**: Random seed. Leave blank to randomize the seed (int | None)
- **image**: Input image (ImageRef)
- **steps**: Number of denoising steps (int)
- **prompt**: Input prompt (str)
- **strength**: 1.0 corresponds to full destruction of information in image (float)
- **scheduler**: scheduler (Scheduler)
- **num_outputs**: Number of images to output. Higher number of outputs may OOM. (int)
- **guidance_scale**: Guidance scale (float)
- **negative_prompt**: Input Negative Prompt (str)


## StableDiffusionXL

A text-to-image generative AI model that creates beautiful images

**Fields:**
- **mask**: Input mask for inpaint mode. Black areas will be preserved, white areas will be inpainted. (ImageRef)
- **seed**: Random seed. Leave blank to randomize the seed (int | None)
- **image**: Input image for img2img or inpaint mode (ImageRef)
- **width**: Width of output image (int)
- **height**: Height of output image (int)
- **prompt**: Input prompt (str)
- **refine**: Which refine style to use (Refine)
- **scheduler**: scheduler (Scheduler)
- **lora_scale**: LoRA additive scale. Only applicable on trained models. (float)
- **num_outputs**: Number of images to output. (int)
- **refine_steps**: For base_image_refiner, the number of steps to refine, defaults to num_inference_steps (int | None)
- **guidance_scale**: Scale for classifier-free guidance (float)
- **apply_watermark**: Applies a watermark to enable determining if an image is generated in downstream applications. If you have other provisions for generating or deploying images safely, you can use this to disable watermarking. (bool)
- **high_noise_frac**: For expert_ensemble_refiner, the fraction of noise to use (float)
- **negative_prompt**: Input Negative Prompt (str)
- **prompt_strength**: Prompt strength when using img2img / inpaint. 1.0 corresponds to full destruction of information in image (float)
- **replicate_weights**: Replicate LoRA weights to use. Leave blank to use the default weights. (str | None)
- **num_inference_steps**: Number of denoising steps (int)
- **disable_safety_checker**: Disable safety checker for generated images. This feature is only available through the API. See [https://replicate.com/docs/how-does-replicate-work#safety](https://replicate.com/docs/how-does-replicate-work#safety) (bool)


## StableDiffusionXLLightning

SDXL-Lightning by ByteDance: a fast text-to-image model that makes high-quality images in 4 steps

**Fields:**
- **seed**: Random seed. Leave blank to randomize the seed (int | None)
- **width**: Width of output image. Recommended 1024 or 1280 (int)
- **height**: Height of output image. Recommended 1024 or 1280 (int)
- **prompt**: Input prompt (str)
- **scheduler**: scheduler (Scheduler)
- **num_outputs**: Number of images to output. (int)
- **guidance_scale**: Scale for classifier-free guidance. Recommended 7-8 (float)
- **negative_prompt**: Negative Input prompt (str)
- **num_inference_steps**: Number of denoising steps. 4 for best results (int)
- **disable_safety_checker**: Disable safety checker for generated images (bool)


## StyleTransfer

Transfer the style of one image to another

**Fields:**
- **seed**: Set a seed for reproducibility. Random by default. (int | None)
- **model**: Model to use for the generation (Model)
- **width**: Width of the output image (ignored if structure image given) (int)
- **height**: Height of the output image (ignored if structure image given) (int)
- **prompt**: Prompt for the image (str)
- **style_image**: Copy the style from this image (ImageRef)
- **output_format**: Format of the output images (Output_format)
- **output_quality**: Quality of the output images, from 0 to 100. 100 is best quality, 0 is lowest quality. (int)
- **negative_prompt**: Things you do not want to see in your image (str)
- **structure_image**: An optional image to copy structure from. Output images will use the same aspect ratio. (ImageRef)
- **number_of_images**: Number of images to generate (int)
- **structure_depth_strength**: Strength of the depth controlnet (float)
- **structure_denoising_strength**: How much of the original image (and colors) to preserve (0 is all, 1 is none, 0.65 is a good balance) (float)


