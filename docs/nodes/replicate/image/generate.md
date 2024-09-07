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


