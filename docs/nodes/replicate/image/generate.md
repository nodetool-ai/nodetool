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


## Flux_Dev

A 12 billion parameter rectified flow transformer capable of generating images from text descriptions

**Fields:**
- **seed**: Random seed. Set for reproducible generation (int | None)
- **image**: Input image for image to image mode. The aspect ratio of your output will match this image (str | None)
- **prompt**: Prompt for generated image (str | None)
- **guidance**: Guidance for generated image. Ignored for flux-schnell (float)
- **num_outputs**: Number of outputs to generate (int)
- **aspect_ratio**: Aspect ratio for the generated image (Aspect_ratio)
- **output_format**: Format of the output images (Output_format)
- **output_quality**: Quality when saving the output images, from 0 to 100. 100 is best quality, 0 is lowest quality. Not relevant for .png outputs (int)
- **prompt_strength**: Prompt strength when using img2img. 1.0 corresponds to full destruction of information in image (float)
- **num_inference_steps**: Number of denoising steps. Recommended range is 28-50 (int)
- **disable_safety_checker**: Disable safety checker for generated images. This feature is only available through the API. See [https://replicate.com/docs/how-does-replicate-work#safety](https://replicate.com/docs/how-does-replicate-work#safety) (bool)


## Flux_Pro

State-of-the-art image generation with top of the line prompt following, visual quality, image detail and output diversity.

**Fields:**
- **seed**: Random seed. Set for reproducible generation (int | None)
- **steps**: Number of diffusion steps (int)
- **prompt**: Text prompt for image generation (str | None)
- **guidance**: Controls the balance between adherence to the text prompt and image quality/diversity. Higher values make the output more closely match the prompt but may reduce overall image quality. Lower values allow for more creative freedom but might produce results less relevant to the prompt. (float)
- **interval**: Interval is a setting that increases the variance in possible outputs letting the model be a tad more dynamic in what outputs it may produce in terms of composition, color, detail, and prompt interpretation. Setting this value low will ensure strong prompt following with more consistent outputs, setting it higher will produce more dynamic or varied outputs. (float)
- **aspect_ratio**: Aspect ratio for the generated image (Aspect_ratio)
- **safety_tolerance**: Safety tolerance, 1 is most strict and 5 is most permissive (int)


## Flux_Schnell

The fastest image generation model tailored for local development and personal use

**Fields:**
- **seed**: Random seed. Set for reproducible generation (int | None)
- **prompt**: Prompt for generated image (str | None)
- **guidance**: Guidance for generated image. Ignored for flux-schnell (float)
- **aspect_ratio**: Aspect ratio for the generated image (Aspect_ratio)
- **output_format**: Format of the output images (Output_format)
- **output_quality**: Quality when saving the output images, from 0 to 100. 100 is best quality, 0 is lowest quality. Not relevant for .png outputs (int)


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


## Kandinsky_2_2

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


## Proteus_V0_3

ProteusV0.3: The Anime Update

**Fields:**
- **mask**: Input mask for inpaint mode. Black areas will be preserved, white areas will be inpainted. (ImageRef)
- **seed**: Random seed. Leave blank to randomize the seed (int | None)
- **image**: Input image for img2img or inpaint mode (ImageRef)
- **width**: Width of output image. Recommended 1024 or 1280 (int)
- **height**: Height of output image. Recommended 1024 or 1280 (int)
- **prompt**: Input prompt (str)
- **scheduler**: scheduler (Scheduler)
- **num_outputs**: Number of images to output. (int)
- **guidance_scale**: Scale for classifier-free guidance. Recommended 7-8 (float)
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


## SD3_Explorer

A model for experimenting with all the SD3 settings. Non-commercial use only, unless you have a Stability AI Self Hosted License.

**Fields:**
- **seed**: Set a seed for reproducibility. Random by default. (int | None)
- **model**: Pick whether to use T5-XXL in fp16, fp8 or not at all. We recommend fp16 for this model as it has the best image quality. When running locally we recommend fp8 for lower memory usage. We've included all versions here for exploration. (Model)
- **shift**: The timestep scheduling shift; shift values higher than 1.0 are better at managing noise in higher resolutions. Try values 6.0 and 2.0 to experiment with effects. (float)
- **steps**: The number of steps to run the model for (more steps = better image but slower generation. Best results for this model are around 26 to 36 steps.) (int)
- **width**: The width of the image (best output at ~1 megapixel. Resolution must be divisible by 64) (int)
- **height**: The height of the image (best output at ~1 megapixel. Resolution must be divisible by 64) (int)
- **prompt**: This prompt is ignored when using the triple prompt mode. See below. (str)
- **sampler**: The sampler to use (used to manage noise) (Sampler)
- **scheduler**: The scheduler to use (used to manage noise; do not use karras) (Scheduler)
- **output_format**: Format of the output images (Output_format)
- **guidance_scale**: The guidance scale tells the model how similar the output should be to the prompt. (Recommend between 3.5 and 4.5; if images look 'burnt,' lower the value.) (float)
- **output_quality**: Quality of the output images, from 0 to 100. 100 is best quality, 0 is lowest quality. (int)
- **negative_prompt**: Negative prompts do not really work in SD3. This will simply cause your output image to vary in unpredictable ways. (str)
- **number_of_images**: The number of images to generate (int)
- **triple_prompt_t5**: The prompt that will be passed to just the T5-XXL model. (str)
- **use_triple_prompt** (bool)
- **triple_prompt_clip_g**: The prompt that will be passed to just the CLIP-G model. (str)
- **triple_prompt_clip_l**: The prompt that will be passed to just the CLIP-L model. (str)
- **negative_conditioning_end**: When the negative conditioning should stop being applied. By default it is disabled. If you want to try a negative prompt, start with a value of 0.1 (float)
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
- **disable_safety_checker**: Disable safety checker for generated images. This feature is only available through the API. See https://replicate.com/docs/how-does-replicate-work#safety (bool)


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
- **disable_safety_checker**: Disable safety checker for generated images. This feature is only available through the API. See https://replicate.com/docs/how-does-replicate-work#safety (bool)


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


## StableDiffusionInpainting

Fill in masked parts of images with Stable Diffusion

**Fields:**
- **mask**: Black and white image to use as mask for inpainting over the image provided. White pixels are inpainted and black pixels are preserved. (ImageRef)
- **seed**: Random seed. Leave blank to randomize the seed (int | None)
- **image**: Initial image to generate variations of. Will be resized to height x width (ImageRef)
- **width**: Width of generated image in pixels. Needs to be a multiple of 64 (Width)
- **height**: Height of generated image in pixels. Needs to be a multiple of 64 (Height)
- **prompt**: Input prompt (str)
- **scheduler**: Choose a scheduler. (Scheduler)
- **num_outputs**: Number of images to generate. (int)
- **guidance_scale**: Scale for classifier-free guidance (float)
- **negative_prompt**: Specify things to not see in the output (str | None)
- **num_inference_steps**: Number of denoising steps (int)
- **disable_safety_checker**: Disable safety checker for generated images. This feature is only available through the API. See [https://replicate.com/docs/how-does-replicate-work#safety](https://replicate.com/docs/how-does-replicate-work#safety) (bool)


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


## StickerMaker

Make stickers with AI. Generates graphics with transparent backgrounds.

**Fields:**
- **seed**: Fix the random seed for reproducibility (int | None)
- **steps** (int)
- **width** (int)
- **height** (int)
- **prompt** (str)
- **output_format**: Format of the output images (Output_format)
- **output_quality**: Quality of the output images, from 0 to 100. 100 is best quality, 0 is lowest quality. (int)
- **negative_prompt**: Things you do not want in the image (str)
- **number_of_images**: Number of images to generate (int)


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


