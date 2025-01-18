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


## Flux_1_1_Pro_Ultra

FLUX1.1 [pro] in ultra and raw modes. Images are up to 4 megapixels. Use raw mode for realism.

**Fields:**
- **raw**: Generate less processed, more natural-looking images (bool)
- **seed**: Random seed. Set for reproducible generation (int | None)
- **prompt**: Text prompt for image generation (str | None)
- **aspect_ratio**: Aspect ratio for the generated image (Aspect_ratio)
- **image_prompt**: Image to use with Flux Redux. This is used together with the text prompt to guide the generation towards the composition of the image_prompt. Must be jpeg, png, gif, or webp. (str | None)
- **output_format**: Format of the output images. (Output_format)
- **safety_tolerance**: Safety tolerance, 1 is most strict and 6 is most permissive (int)
- **image_prompt_strength**: Blend between the prompt and the image prompt. (float)


## Flux_360

Generate 360 panorama images.

**Fields:**
- **mask**: Image mask for image inpainting mode. If provided, aspect_ratio, width, and height inputs are ignored. (ImageRef)
- **seed**: Random seed. Set for reproducible generation (int | None)
- **image**: Input image for image to image or inpainting mode. If provided, aspect_ratio, width, and height inputs are ignored. (ImageRef)
- **model**: Which model to run inference with. The dev model performs best with around 28 inference steps but the schnell model only needs 4 steps. (Model)
- **width**: Width of generated image. Only works if `aspect_ratio` is set to custom. Will be rounded to nearest multiple of 16. Incompatible with fast generation (int | None)
- **height**: Height of generated image. Only works if `aspect_ratio` is set to custom. Will be rounded to nearest multiple of 16. Incompatible with fast generation (int | None)
- **prompt**: Prompt for generated image. If you include the `trigger_word` used in the training process you are more likely to activate the trained object, style, or concept in the resulting image. (str | None)
- **go_fast**: Run faster predictions with model optimized for speed (currently fp8 quantized); disable to run in original bf16 (bool)
- **extra_lora**: Load LoRA weights. Supports Replicate models in the format <owner>/<username> or <owner>/<username>/<version>, HuggingFace URLs in the format huggingface.co/<owner>/<model-name>, CivitAI URLs in the format civitai.com/models/<id>[/<model-name>], or arbitrary .safetensors URLs from the Internet. For example, 'fofr/flux-pixar-cars' (str | None)
- **lora_scale**: Determines how strongly the main LoRA should be applied. Sane results between 0 and 1 for base inference. For go_fast we apply a 1.5x multiplier to this value; we've generally seen good performance when scaling the base value by that amount. You may still need to experiment to find the best value for your particular lora. (float)
- **megapixels**: Approximate number of megapixels for generated image (Megapixels)
- **num_outputs**: Number of outputs to generate (int)
- **aspect_ratio**: Aspect ratio for the generated image. If custom is selected, uses height and width below & will run in bf16 mode (Aspect_ratio)
- **output_format**: Format of the output images (Output_format)
- **guidance_scale**: Guidance scale for the diffusion process. Lower values can give more realistic images. Good values to try are 2, 2.5, 3 and 3.5 (float)
- **output_quality**: Quality when saving the output images, from 0 to 100. 100 is best quality, 0 is lowest quality. Not relevant for .png outputs (int)
- **prompt_strength**: Prompt strength when using img2img. 1.0 corresponds to full destruction of information in image (float)
- **extra_lora_scale**: Determines how strongly the extra LoRA should be applied. Sane results between 0 and 1 for base inference. For go_fast we apply a 1.5x multiplier to this value; we've generally seen good performance when scaling the base value by that amount. You may still need to experiment to find the best value for your particular lora. (float)
- **replicate_weights**: Load LoRA weights. Supports Replicate models in the format <owner>/<username> or <owner>/<username>/<version>, HuggingFace URLs in the format huggingface.co/<owner>/<model-name>, CivitAI URLs in the format civitai.com/models/<id>[/<model-name>], or arbitrary .safetensors URLs from the Internet. For example, 'fofr/flux-pixar-cars' (str | None)
- **num_inference_steps**: Number of denoising steps. More steps can give more detailed images, but take longer. (int)
- **disable_safety_checker**: Disable safety checker for generated images. (bool)


## Flux_Black_Light

A flux lora fine-tuned on black light images

**Fields:**
- **mask**: Image mask for image inpainting mode. If provided, aspect_ratio, width, and height inputs are ignored. (ImageRef)
- **seed**: Random seed. Set for reproducible generation (int | None)
- **image**: Input image for image to image or inpainting mode. If provided, aspect_ratio, width, and height inputs are ignored. (ImageRef)
- **model**: Which model to run inference with. The dev model performs best with around 28 inference steps but the schnell model only needs 4 steps. (Model)
- **width**: Width of generated image. Only works if `aspect_ratio` is set to custom. Will be rounded to nearest multiple of 16. Incompatible with fast generation (int | None)
- **height**: Height of generated image. Only works if `aspect_ratio` is set to custom. Will be rounded to nearest multiple of 16. Incompatible with fast generation (int | None)
- **prompt**: Prompt for generated image. If you include the `trigger_word` used in the training process you are more likely to activate the trained object, style, or concept in the resulting image. (str | None)
- **go_fast**: Run faster predictions with model optimized for speed (currently fp8 quantized); disable to run in original bf16 (bool)
- **extra_lora**: Load LoRA weights. Supports Replicate models in the format <owner>/<username> or <owner>/<username>/<version>, HuggingFace URLs in the format huggingface.co/<owner>/<model-name>, CivitAI URLs in the format civitai.com/models/<id>[/<model-name>], or arbitrary .safetensors URLs from the Internet. For example, 'fofr/flux-pixar-cars' (str | None)
- **lora_scale**: Determines how strongly the main LoRA should be applied. Sane results between 0 and 1 for base inference. For go_fast we apply a 1.5x multiplier to this value; we've generally seen good performance when scaling the base value by that amount. You may still need to experiment to find the best value for your particular lora. (float)
- **megapixels**: Approximate number of megapixels for generated image (Megapixels)
- **num_outputs**: Number of outputs to generate (int)
- **aspect_ratio**: Aspect ratio for the generated image. If custom is selected, uses height and width below & will run in bf16 mode (Aspect_ratio)
- **output_format**: Format of the output images (Output_format)
- **guidance_scale**: Guidance scale for the diffusion process. Lower values can give more realistic images. Good values to try are 2, 2.5, 3 and 3.5 (float)
- **output_quality**: Quality when saving the output images, from 0 to 100. 100 is best quality, 0 is lowest quality. Not relevant for .png outputs (int)
- **prompt_strength**: Prompt strength when using img2img. 1.0 corresponds to full destruction of information in image (float)
- **extra_lora_scale**: Determines how strongly the extra LoRA should be applied. Sane results between 0 and 1 for base inference. For go_fast we apply a 1.5x multiplier to this value; we've generally seen good performance when scaling the base value by that amount. You may still need to experiment to find the best value for your particular lora. (float)
- **replicate_weights**: Load LoRA weights. Supports Replicate models in the format <owner>/<username> or <owner>/<username>/<version>, HuggingFace URLs in the format huggingface.co/<owner>/<model-name>, CivitAI URLs in the format civitai.com/models/<id>[/<model-name>], or arbitrary .safetensors URLs from the Internet. For example, 'fofr/flux-pixar-cars' (str | None)
- **num_inference_steps**: Number of denoising steps. More steps can give more detailed images, but take longer. (int)
- **disable_safety_checker**: Disable safety checker for generated images. (bool)


## Flux_Canny_Dev

Open-weight edge-guided image generation. Control structure and composition using Canny edge detection.

**Fields:**
- **seed**: Random seed. Set for reproducible generation (int | None)
- **prompt**: Prompt for generated image (str | None)
- **guidance**: Guidance for generated image (float)
- **megapixels**: Approximate number of megapixels for generated image. Use match_input to match the size of the input (with an upper limit of 1440x1440 pixels) (Megapixels)
- **num_outputs**: Number of outputs to generate (int)
- **control_image**: Image used to control the generation. The canny edge detection will be automatically generated. (ImageRef)
- **output_format**: Format of the output images (Output_format)
- **output_quality**: Quality when saving the output images, from 0 to 100. 100 is best quality, 0 is lowest quality. Not relevant for .png outputs (int)
- **num_inference_steps**: Number of denoising steps. Recommended range is 28-50, and lower number of steps produce lower quality outputs, faster. (int)
- **disable_safety_checker**: Disable safety checker for generated images. (bool)


## Flux_Canny_Pro

Professional edge-guided image generation. Control structure and composition using Canny edge detection

**Fields:**
- **seed**: Random seed. Set for reproducible generation (int | None)
- **steps**: Number of diffusion steps. Higher values yield finer details but increase processing time. (int)
- **prompt**: Text prompt for image generation (str | None)
- **guidance**: Controls the balance between adherence to the text as well as image prompt and image quality/diversity. Higher values make the output more closely match the prompt but may reduce overall image quality. Lower values allow for more creative freedom but might produce results less relevant to the prompt. (float)
- **control_image**: Image to use as control input. Must be jpeg, png, gif, or webp. (ImageRef)
- **output_format**: Format of the output images. (Output_format)
- **safety_tolerance**: Safety tolerance, 1 is most strict and 6 is most permissive (int)
- **prompt_upsampling**: Automatically modify the prompt for more creative generation (bool)


## Flux_Cinestill

Flux lora, use "CNSTLL" to trigger

**Fields:**
- **mask**: Image mask for image inpainting mode. If provided, aspect_ratio, width, and height inputs are ignored. (ImageRef)
- **seed**: Random seed. Set for reproducible generation (int | None)
- **image**: Input image for image to image or inpainting mode. If provided, aspect_ratio, width, and height inputs are ignored. (ImageRef)
- **model**: Which model to run inference with. The dev model performs best with around 28 inference steps but the schnell model only needs 4 steps. (Model)
- **width**: Width of generated image. Only works if `aspect_ratio` is set to custom. Will be rounded to nearest multiple of 16. Incompatible with fast generation (int | None)
- **height**: Height of generated image. Only works if `aspect_ratio` is set to custom. Will be rounded to nearest multiple of 16. Incompatible with fast generation (int | None)
- **prompt**: Prompt for generated image. If you include the `trigger_word` used in the training process you are more likely to activate the trained object, style, or concept in the resulting image. (str | None)
- **go_fast**: Run faster predictions with model optimized for speed (currently fp8 quantized); disable to run in original bf16 (bool)
- **extra_lora**: Load LoRA weights. Supports Replicate models in the format <owner>/<username> or <owner>/<username>/<version>, HuggingFace URLs in the format huggingface.co/<owner>/<model-name>, CivitAI URLs in the format civitai.com/models/<id>[/<model-name>], or arbitrary .safetensors URLs from the Internet. For example, 'fofr/flux-pixar-cars' (str | None)
- **lora_scale**: Determines how strongly the main LoRA should be applied. Sane results between 0 and 1 for base inference. For go_fast we apply a 1.5x multiplier to this value; we've generally seen good performance when scaling the base value by that amount. You may still need to experiment to find the best value for your particular lora. (float)
- **megapixels**: Approximate number of megapixels for generated image (Megapixels)
- **num_outputs**: Number of outputs to generate (int)
- **aspect_ratio**: Aspect ratio for the generated image. If custom is selected, uses height and width below & will run in bf16 mode (Aspect_ratio)
- **output_format**: Format of the output images (Output_format)
- **guidance_scale**: Guidance scale for the diffusion process. Lower values can give more realistic images. Good values to try are 2, 2.5, 3 and 3.5 (float)
- **output_quality**: Quality when saving the output images, from 0 to 100. 100 is best quality, 0 is lowest quality. Not relevant for .png outputs (int)
- **prompt_strength**: Prompt strength when using img2img. 1.0 corresponds to full destruction of information in image (float)
- **extra_lora_scale**: Determines how strongly the extra LoRA should be applied. Sane results between 0 and 1 for base inference. For go_fast we apply a 1.5x multiplier to this value; we've generally seen good performance when scaling the base value by that amount. You may still need to experiment to find the best value for your particular lora. (float)
- **replicate_weights**: Load LoRA weights. Supports Replicate models in the format <owner>/<username> or <owner>/<username>/<version>, HuggingFace URLs in the format huggingface.co/<owner>/<model-name>, CivitAI URLs in the format civitai.com/models/<id>[/<model-name>], or arbitrary .safetensors URLs from the Internet. For example, 'fofr/flux-pixar-cars' (str | None)
- **num_inference_steps**: Number of denoising steps. More steps can give more detailed images, but take longer. (int)
- **disable_safety_checker**: Disable safety checker for generated images. (bool)


## Flux_Depth_Dev

Open-weight depth-aware image generation. Edit images while preserving spatial relationships.

**Fields:**
- **seed**: Random seed. Set for reproducible generation (int | None)
- **prompt**: Prompt for generated image (str | None)
- **guidance**: Guidance for generated image (float)
- **megapixels**: Approximate number of megapixels for generated image. Use match_input to match the size of the input (with an upper limit of 1440x1440 pixels) (Megapixels)
- **num_outputs**: Number of outputs to generate (int)
- **control_image**: Image used to control the generation. The depth map will be automatically generated. (ImageRef)
- **output_format**: Format of the output images (Output_format)
- **output_quality**: Quality when saving the output images, from 0 to 100. 100 is best quality, 0 is lowest quality. Not relevant for .png outputs (int)
- **num_inference_steps**: Number of denoising steps. Recommended range is 28-50, and lower number of steps produce lower quality outputs, faster. (int)
- **disable_safety_checker**: Disable safety checker for generated images. (bool)


## Flux_Depth_Pro

Professional depth-aware image generation. Edit images while preserving spatial relationships.

**Fields:**
- **seed**: Random seed. Set for reproducible generation (int | None)
- **steps**: Number of diffusion steps. Higher values yield finer details but increase processing time. (int)
- **prompt**: Text prompt for image generation (str | None)
- **guidance**: Controls the balance between adherence to the text as well as image prompt and image quality/diversity. Higher values make the output more closely match the prompt but may reduce overall image quality. Lower values allow for more creative freedom but might produce results less relevant to the prompt. (float)
- **control_image**: Image to use as control input. Must be jpeg, png, gif, or webp. (ImageRef)
- **output_format**: Format of the output images. (Output_format)
- **safety_tolerance**: Safety tolerance, 1 is most strict and 6 is most permissive (int)
- **prompt_upsampling**: Automatically modify the prompt for more creative generation (bool)


## Flux_Dev

A 12 billion parameter rectified flow transformer capable of generating images from text descriptions

**Fields:**
- **seed**: Random seed. Set for reproducible generation (int | None)
- **image**: Input image for image to image mode. The aspect ratio of your output will match this image (str | None)
- **prompt**: Prompt for generated image (str | None)
- **go_fast**: Run faster predictions with model optimized for speed (currently fp8 quantized); disable to run in original bf16 (bool)
- **guidance**: Guidance for generated image (float)
- **megapixels**: Approximate number of megapixels for generated image (Megapixels)
- **num_outputs**: Number of outputs to generate (int)
- **aspect_ratio**: Aspect ratio for the generated image (Aspect_ratio)
- **output_format**: Format of the output images (Output_format)
- **output_quality**: Quality when saving the output images, from 0 to 100. 100 is best quality, 0 is lowest quality. Not relevant for .png outputs (int)
- **prompt_strength**: Prompt strength when using img2img. 1.0 corresponds to full destruction of information in image (float)
- **num_inference_steps**: Number of denoising steps. Recommended range is 28-50, and lower number of steps produce lower quality outputs, faster. (int)
- **disable_safety_checker**: Disable safety checker for generated images. (bool)


## Flux_Dev_Lora

A version of flux-dev, a text to image model, that supports fast fine-tuned lora inference

**Fields:**
- **seed**: Random seed. Set for reproducible generation (int | None)
- **image**: Input image for image to image mode. The aspect ratio of your output will match this image (ImageRef)
- **prompt**: Prompt for generated image (str | None)
- **go_fast**: Run faster predictions with model optimized for speed (currently fp8 quantized); disable to run in original bf16 (bool)
- **guidance**: Guidance for generated image (float)
- **lora_scale**: Determines how strongly the main LoRA should be applied. Sane results between 0 and 1 for base inference. For go_fast we apply a 1.5x multiplier to this value; we've generally seen good performance when scaling the base value by that amount. You may still need to experiment to find the best value for your particular lora. (float)
- **megapixels**: Approximate number of megapixels for generated image (Megapixels)
- **num_outputs**: Number of outputs to generate (int)
- **aspect_ratio**: Aspect ratio for the generated image (Aspect_ratio)
- **lora_weights**: Load LoRA weights. Supports Replicate models in the format <owner>/<username> or <owner>/<username>/<version>, HuggingFace URLs in the format huggingface.co/<owner>/<model-name>, CivitAI URLs in the format civitai.com/models/<id>[/<model-name>], or arbitrary .safetensors URLs from the Internet. For example, 'fofr/flux-pixar-cars' (str | None)
- **output_format**: Format of the output images (Output_format)
- **output_quality**: Quality when saving the output images, from 0 to 100. 100 is best quality, 0 is lowest quality. Not relevant for .png outputs (int)
- **prompt_strength**: Prompt strength when using img2img. 1.0 corresponds to full destruction of information in image (float)
- **num_inference_steps**: Number of denoising steps. Recommended range is 28-50 (int)
- **disable_safety_checker**: Disable safety checker for generated images. (bool)


## Flux_Fill_Dev

Open-weight inpainting model for editing and extending images. Guidance-distilled from FLUX.1 Fill [pro].

**Fields:**
- **mask**: A black-and-white image that describes the part of the image to inpaint. Black areas will be preserved while white areas will be inpainted. (str | None)
- **seed**: Random seed. Set for reproducible generation (int | None)
- **image**: The image to inpaint. Can contain alpha mask. If the image width or height are not multiples of 32, they will be scaled to the closest multiple of 32. If the image dimensions don't fit within 1440x1440, it will be scaled down to fit. (str | None)
- **prompt**: Prompt for generated image (str | None)
- **guidance**: Guidance for generated image (float)
- **megapixels**: Approximate number of megapixels for generated image. Use match_input to match the size of the input (with an upper limit of 1440x1440 pixels) (Megapixels)
- **num_outputs**: Number of outputs to generate (int)
- **output_format**: Format of the output images (Output_format)
- **output_quality**: Quality when saving the output images, from 0 to 100. 100 is best quality, 0 is lowest quality. Not relevant for .png outputs (int)
- **num_inference_steps**: Number of denoising steps. Recommended range is 28-50, and lower number of steps produce lower quality outputs, faster. (int)
- **disable_safety_checker**: Disable safety checker for generated images. (bool)


## Flux_Fill_Pro

Professional inpainting and outpainting model with state-of-the-art performance. Edit or extend images with natural, seamless results.

**Fields:**
- **mask**: A black-and-white image that describes the part of the image to inpaint. Black areas will be preserved while white areas will be inpainted. Must have the same size as image. Optional if you provide an alpha mask in the original image. Must be jpeg, png, gif, or webp. (str | None)
- **seed**: Random seed. Set for reproducible generation (int | None)
- **image**: The image to inpaint. Can contain an alpha mask. Must be jpeg, png, gif, or webp. (str | None)
- **steps**: Number of diffusion steps. Higher values yield finer details but increase processing time. (int)
- **prompt**: Text prompt for image generation (str | None)
- **guidance**: Controls the balance between adherence to the text prompt and image quality/diversity. Higher values make the output more closely match the prompt but may reduce overall image quality. Lower values allow for more creative freedom but might produce results less relevant to the prompt. (float)
- **output_format**: Format of the output images. (Output_format)
- **safety_tolerance**: Safety tolerance, 1 is most strict and 6 is most permissive (int)
- **prompt_upsampling**: Automatically modify the prompt for more creative generation (bool)


## Flux_Mona_Lisa

Flux lora, use the term "MNALSA" to trigger generation

**Fields:**
- **mask**: Image mask for image inpainting mode. If provided, aspect_ratio, width, and height inputs are ignored. (ImageRef)
- **seed**: Random seed. Set for reproducible generation (int | None)
- **image**: Input image for image to image or inpainting mode. If provided, aspect_ratio, width, and height inputs are ignored. (ImageRef)
- **model**: Which model to run inference with. The dev model performs best with around 28 inference steps but the schnell model only needs 4 steps. (Model)
- **width**: Width of generated image. Only works if `aspect_ratio` is set to custom. Will be rounded to nearest multiple of 16. Incompatible with fast generation (int | None)
- **height**: Height of generated image. Only works if `aspect_ratio` is set to custom. Will be rounded to nearest multiple of 16. Incompatible with fast generation (int | None)
- **prompt**: Prompt for generated image. If you include the `trigger_word` used in the training process you are more likely to activate the trained object, style, or concept in the resulting image. (str | None)
- **go_fast**: Run faster predictions with model optimized for speed (currently fp8 quantized); disable to run in original bf16 (bool)
- **extra_lora**: Load LoRA weights. Supports Replicate models in the format <owner>/<username> or <owner>/<username>/<version>, HuggingFace URLs in the format huggingface.co/<owner>/<model-name>, CivitAI URLs in the format civitai.com/models/<id>[/<model-name>], or arbitrary .safetensors URLs from the Internet. For example, 'fofr/flux-pixar-cars' (str | None)
- **lora_scale**: Determines how strongly the main LoRA should be applied. Sane results between 0 and 1 for base inference. For go_fast we apply a 1.5x multiplier to this value; we've generally seen good performance when scaling the base value by that amount. You may still need to experiment to find the best value for your particular lora. (float)
- **megapixels**: Approximate number of megapixels for generated image (Megapixels)
- **num_outputs**: Number of outputs to generate (int)
- **aspect_ratio**: Aspect ratio for the generated image. If custom is selected, uses height and width below & will run in bf16 mode (Aspect_ratio)
- **output_format**: Format of the output images (Output_format)
- **guidance_scale**: Guidance scale for the diffusion process. Lower values can give more realistic images. Good values to try are 2, 2.5, 3 and 3.5 (float)
- **output_quality**: Quality when saving the output images, from 0 to 100. 100 is best quality, 0 is lowest quality. Not relevant for .png outputs (int)
- **prompt_strength**: Prompt strength when using img2img. 1.0 corresponds to full destruction of information in image (float)
- **extra_lora_scale**: Determines how strongly the extra LoRA should be applied. Sane results between 0 and 1 for base inference. For go_fast we apply a 1.5x multiplier to this value; we've generally seen good performance when scaling the base value by that amount. You may still need to experiment to find the best value for your particular lora. (float)
- **replicate_weights**: Load LoRA weights. Supports Replicate models in the format <owner>/<username> or <owner>/<username>/<version>, HuggingFace URLs in the format huggingface.co/<owner>/<model-name>, CivitAI URLs in the format civitai.com/models/<id>[/<model-name>], or arbitrary .safetensors URLs from the Internet. For example, 'fofr/flux-pixar-cars' (str | None)
- **num_inference_steps**: Number of denoising steps. More steps can give more detailed images, but take longer. (int)
- **disable_safety_checker**: Disable safety checker for generated images. (bool)


## Flux_Pro

State-of-the-art image generation with top of the line prompt following, visual quality, image detail and output diversity.

**Fields:**
- **seed**: Random seed. Set for reproducible generation (int | None)
- **steps**: Number of diffusion steps (int)
- **width**: Width of the generated image in text-to-image mode. Only used when aspect_ratio=custom. Must be a multiple of 32 (if it's not, it will be rounded to nearest multiple of 32). Note: Ignored in img2img and inpainting modes. (int | None)
- **height**: Height of the generated image in text-to-image mode. Only used when aspect_ratio=custom. Must be a multiple of 32 (if it's not, it will be rounded to nearest multiple of 32). Note: Ignored in img2img and inpainting modes. (int | None)
- **prompt**: Text prompt for image generation (str | None)
- **guidance**: Controls the balance between adherence to the text prompt and image quality/diversity. Higher values make the output more closely match the prompt but may reduce overall image quality. Lower values allow for more creative freedom but might produce results less relevant to the prompt. (float)
- **interval**: Interval is a setting that increases the variance in possible outputs letting the model be a tad more dynamic in what outputs it may produce in terms of composition, color, detail, and prompt interpretation. Setting this value low will ensure strong prompt following with more consistent outputs, setting it higher will produce more dynamic or varied outputs. (float)
- **aspect_ratio**: Aspect ratio for the generated image (Aspect_ratio)
- **image_prompt**: Image to use with Flux Redux. This is used together with the text prompt to guide the generation towards the composition of the image_prompt. Must be jpeg, png, gif, or webp. (str | None)
- **output_format**: Format of the output images. (Output_format)
- **output_quality**: Quality when saving the output images, from 0 to 100. 100 is best quality, 0 is lowest quality. Not relevant for .png outputs (int)
- **safety_tolerance**: Safety tolerance, 1 is most strict and 6 is most permissive (int)
- **prompt_upsampling**: Automatically modify the prompt for more creative generation (bool)


## Flux_Redux_Dev

Open-weight image variation model. Create new versions while preserving key elements of your original.

**Fields:**
- **seed**: Random seed. Set for reproducible generation (int | None)
- **guidance**: Guidance for generated image (float)
- **megapixels**: Approximate number of megapixels for generated image (Megapixels)
- **num_outputs**: Number of outputs to generate (int)
- **redux_image**: Input image to condition your output on. This replaces prompt for FLUX.1 Redux models (ImageRef)
- **aspect_ratio**: Aspect ratio for the generated image (Aspect_ratio)
- **output_format**: Format of the output images (Output_format)
- **output_quality**: Quality when saving the output images, from 0 to 100. 100 is best quality, 0 is lowest quality. Not relevant for .png outputs (int)
- **num_inference_steps**: Number of denoising steps. Recommended range is 28-50 (int)
- **disable_safety_checker**: Disable safety checker for generated images. (bool)


## Flux_Redux_Schnell

Fast, efficient image variation model for rapid iteration and experimentation.

**Fields:**
- **seed**: Random seed. Set for reproducible generation (int | None)
- **megapixels**: Approximate number of megapixels for generated image (Megapixels)
- **num_outputs**: Number of outputs to generate (int)
- **redux_image**: Input image to condition your output on. This replaces prompt for FLUX.1 Redux models (ImageRef)
- **aspect_ratio**: Aspect ratio for the generated image (Aspect_ratio)
- **output_format**: Format of the output images (Output_format)
- **output_quality**: Quality when saving the output images, from 0 to 100. 100 is best quality, 0 is lowest quality. Not relevant for .png outputs (int)
- **num_inference_steps**: Number of denoising steps. 4 is recommended, and lower number of steps produce lower quality outputs, faster. (int)
- **disable_safety_checker**: Disable safety checker for generated images. (bool)


## Flux_Schnell

The fastest image generation model tailored for local development and personal use

**Fields:**
- **seed**: Random seed. Set for reproducible generation (int | None)
- **prompt**: Prompt for generated image (str | None)
- **go_fast**: Run faster predictions with model optimized for speed (currently fp8 quantized); disable to run in original bf16 (bool)
- **megapixels**: Approximate number of megapixels for generated image (Megapixels)
- **num_outputs**: Number of outputs to generate (int)
- **aspect_ratio**: Aspect ratio for the generated image (Aspect_ratio)
- **output_format**: Format of the output images (Output_format)
- **output_quality**: Quality when saving the output images, from 0 to 100. 100 is best quality, 0 is lowest quality. Not relevant for .png outputs (int)
- **num_inference_steps**: Number of denoising steps. 4 is recommended, and lower number of steps produce lower quality outputs, faster. (int)
- **disable_safety_checker**: Disable safety checker for generated images. (bool)


## Flux_Schnell_Lora

The fastest image generation model tailored for fine-tuned use

**Fields:**
- **seed**: Random seed. Set for reproducible generation (int | None)
- **prompt**: Prompt for generated image (str | None)
- **go_fast**: Run faster predictions with model optimized for speed (currently fp8 quantized); disable to run in original bf16 (bool)
- **lora_scale**: Determines how strongly the main LoRA should be applied. Sane results between 0 and 1 for base inference. For go_fast we apply a 1.5x multiplier to this value; we've generally seen good performance when scaling the base value by that amount. You may still need to experiment to find the best value for your particular lora. (float)
- **megapixels**: Approximate number of megapixels for generated image (Megapixels)
- **num_outputs**: Number of outputs to generate (int)
- **aspect_ratio**: Aspect ratio for the generated image (Aspect_ratio)
- **lora_weights**: Load LoRA weights. Supports Replicate models in the format <owner>/<username> or <owner>/<username>/<version>, HuggingFace URLs in the format huggingface.co/<owner>/<model-name>, CivitAI URLs in the format civitai.com/models/<id>[/<model-name>], or arbitrary .safetensors URLs from the Internet. For example, 'fofr/flux-pixar-cars' (str | None)
- **output_format**: Format of the output images (Output_format)
- **output_quality**: Quality when saving the output images, from 0 to 100. 100 is best quality, 0 is lowest quality. Not relevant for .png outputs (int)
- **num_inference_steps**: Number of denoising steps. 4 is recommended, and lower number of steps produce lower quality outputs, faster. (int)
- **disable_safety_checker**: Disable safety checker for generated images. (bool)


## Hyper_Flux_8Step

Hyper FLUX 8-step by ByteDance

**Fields:**
- **seed**: Random seed. Set for reproducible generation (int | None)
- **width**: Width of the generated image. Optional, only used when aspect_ratio=custom. Must be a multiple of 16 (if it's not, it will be rounded to nearest multiple of 16) (int | None)
- **height**: Height of the generated image. Optional, only used when aspect_ratio=custom. Must be a multiple of 16 (if it's not, it will be rounded to nearest multiple of 16) (int | None)
- **prompt**: Prompt for generated image (str | None)
- **num_outputs**: Number of images to output. (int)
- **aspect_ratio**: Aspect ratio for the generated image. The size will always be 1 megapixel, i.e. 1024x1024 if aspect ratio is 1:1. To use arbitrary width and height, set aspect ratio to 'custom'. (Aspect_ratio)
- **output_format**: Format of the output images (Output_format)
- **guidance_scale**: Guidance scale for the diffusion process (float)
- **output_quality**: Quality when saving the output images, from 0 to 100. 100 is best quality, 0 is lowest quality. Not relevant for .png outputs (int)
- **num_inference_steps**: Number of inference steps (int)
- **disable_safety_checker**: Disable safety checker for generated images. This feature is only available through the API. See [https://replicate.com/docs/how-does-replicate-work#safety](https://replicate.com/docs/how-does-replicate-work#safety) (bool)


## Ideogram_V2

An excellent image model with state of the art inpainting, prompt comprehension and text rendering

**Fields:**
- **mask**: A black and white image. Black pixels are inpainted, white pixels are preserved. The mask will be resized to match the image size. (ImageRef)
- **seed**: Random seed. Set for reproducible generation (int | None)
- **image**: An image file to use for inpainting. (ImageRef)
- **prompt**: Text prompt for image generation (str | None)
- **resolution**: Resolution. Overrides aspect ratio. Ignored if an inpainting image is given. (Resolution)
- **style_type**: The styles help define the specific aesthetic of the image you want to generate. (Style_type)
- **aspect_ratio**: Aspect ratio. Ignored if a resolution or inpainting image is given. (Aspect_ratio)
- **negative_prompt**: Things you do not want to see in the generated image. (str | None)
- **magic_prompt_option**: Magic Prompt will interpret your prompt and optimize it to maximize variety and quality of the images generated. You can also use it to write prompts in different languages. (Magic_prompt_option)


## Ideogram_V2_Turbo

A fast image model with state of the art inpainting, prompt comprehension and text rendering.

**Fields:**
- **mask**: A black and white image. Black pixels are inpainted, white pixels are preserved. The mask will be resized to match the image size. (ImageRef)
- **seed**: Random seed. Set for reproducible generation (int | None)
- **image**: An image file to use for inpainting. (ImageRef)
- **prompt**: Text prompt for image generation (str | None)
- **resolution**: Resolution. Overrides aspect ratio. Ignored if an inpainting image is given. (Resolution)
- **style_type**: The styles help define the specific aesthetic of the image you want to generate. (Style_type)
- **aspect_ratio**: Aspect ratio. Ignored if a resolution or inpainting image is given. (Aspect_ratio)
- **negative_prompt**: Things you do not want to see in the generated image. (str | None)
- **magic_prompt_option**: Magic Prompt will interpret your prompt and optimize it to maximize variety and quality of the images generated. You can also use it to write prompts in different languages. (Magic_prompt_option)


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


## Photon_Flash

Accelerated variant of Photon prioritizing speed while maintaining quality

**Fields:**
- **seed**: Random seed. Set for reproducible generation (int | None)
- **prompt**: Text prompt for image generation (str | None)
- **aspect_ratio**: Aspect ratio of the generated image (Aspect_ratio)
- **image_reference_url**: URL of a reference image to guide generation (ImageRef)
- **style_reference_url**: URL of a style reference image (ImageRef)
- **image_reference_weight**: Weight of the reference image. Larger values will make the reference image have a stronger influence on the generated image. (float)
- **style_reference_weight**: Weight of the style reference image (float)
- **character_reference_url**: URL of a character reference image (ImageRef)


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


## Proteus_V_02

Proteus v0.2 shows subtle yet significant improvements over Version 0.1. It demonstrates enhanced prompt understanding that surpasses MJ6, while also approaching its stylistic capabilities.

**Fields:**
- **mask**: Input mask for inpaint mode. Black areas will be preserved, white areas will be inpainted. (ImageRef)
- **seed**: Random seed. Leave blank to randomize the seed (int | None)
- **image**: Input image for img2img or inpaint mode (ImageRef)
- **width**: Width of output image (int)
- **height**: Height of output image (int)
- **prompt**: Input prompt (str)
- **scheduler**: scheduler (Scheduler)
- **num_outputs**: Number of images to output. (int)
- **guidance_scale**: Scale for classifier-free guidance. Recommended 7-8 (float)
- **apply_watermark**: Applies a watermark to enable determining if an image is generated in downstream applications. If you have other provisions for generating or deploying images safely, you can use this to disable watermarking. (bool)
- **negative_prompt**: Negative Input prompt (str)
- **prompt_strength**: Prompt strength when using img2img / inpaint. 1.0 corresponds to full destruction of information in image (float)
- **num_inference_steps**: Number of denoising steps. 20 to 35 steps for more detail, 20 steps for faster results. (int)
- **disable_safety_checker**: Disable safety checker for generated images. This feature is only available through the API. See https://replicate.com/docs/how-does-replicate-work#safety (bool)


## Proteus_V_03

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


## Recraft_20B

Affordable and fast images

**Fields:**
- **size**: Width and height of the generated image (Size)
- **style**: Style of the generated image. (Style)
- **prompt**: Text prompt for image generation (str | None)


## Recraft_20B_SVG

Affordable and fast vector images

**Fields:**
- **size**: Width and height of the generated image (Size)
- **style**: Style of the generated image. (Style)
- **prompt**: Text prompt for image generation (str | None)


## Recraft_V3

Recraft V3 (code-named red_panda) is a text-to-image model with the ability to generate long texts, and images in a wide list of styles. As of today, it is SOTA in image generation, proven by the Text-to-Image Benchmark by Artificial Analysis

**Fields:**
- **size**: Width and height of the generated image (Size)
- **style**: Style of the generated image. (Style)
- **prompt**: Text prompt for image generation (str | None)


## Recraft_V3_SVG

Recraft V3 SVG (code-named red_panda) is a text-to-image model with the ability to generate high quality SVG images including logotypes, and icons. The model supports a wide list of styles.

**Fields:**
- **size**: Width and height of the generated image (Size)
- **style**: Style of the generated image. (Style)
- **prompt**: Text prompt for image generation (str | None)


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


## StableDiffusion3_5_Large

A text-to-image model that generates high-resolution images with fine details. It supports various artistic styles and produces diverse outputs from the same prompt, thanks to Query-Key Normalization.

**Fields:**
- **cfg**: The guidance scale tells the model how similar the output should be to the prompt. (float)
- **seed**: Set a seed for reproducibility. Random by default. (int | None)
- **image**: Input image for image to image mode. The aspect ratio of your output will match this image. (ImageRef)
- **steps**: Number of steps to run the sampler for. (int)
- **prompt**: Text prompt for image generation (str)
- **aspect_ratio**: The aspect ratio of your output image. This value is ignored if you are using an input image. (Aspect_ratio)
- **output_format**: Format of the output images (Output_format)
- **output_quality**: Quality of the output images, from 0 to 100. 100 is best quality, 0 is lowest quality. (int)
- **prompt_strength**: Prompt strength (or denoising strength) when using image to image. 1.0 corresponds to full destruction of information in image. (float)


## StableDiffusion3_5_Large_Turbo

A text-to-image model that generates high-resolution images with fine details. It supports various artistic styles and produces diverse outputs from the same prompt, with a focus on fewer inference steps

**Fields:**
- **cfg**: The guidance scale tells the model how similar the output should be to the prompt. (float)
- **seed**: Set a seed for reproducibility. Random by default. (int | None)
- **image**: Input image for image to image mode. The aspect ratio of your output will match this image. (ImageRef)
- **steps**: Number of steps to run the sampler for. (int)
- **prompt**: Text prompt for image generation (str)
- **aspect_ratio**: The aspect ratio of your output image. This value is ignored if you are using an input image. (Aspect_ratio)
- **output_format**: Format of the output images (Output_format)
- **output_quality**: Quality of the output images, from 0 to 100. 100 is best quality, 0 is lowest quality. (int)
- **prompt_strength**: Prompt strength (or denoising strength) when using image to image. 1.0 corresponds to full destruction of information in image. (float)


## StableDiffusion3_5_Medium

2.5 billion parameter image model with improved MMDiT-X architecture

**Fields:**
- **cfg**: The guidance scale tells the model how similar the output should be to the prompt. (float)
- **seed**: Set a seed for reproducibility. Random by default. (int | None)
- **image**: Input image for image to image mode. The aspect ratio of your output will match this image. (ImageRef)
- **steps**: Number of steps to run the sampler for. (int)
- **prompt**: Text prompt for image generation (str)
- **aspect_ratio**: The aspect ratio of your output image. This value is ignored if you are using an input image. (Aspect_ratio)
- **output_format**: Format of the output images (Output_format)
- **output_quality**: Quality of the output images, from 0 to 100. 100 is best quality, 0 is lowest quality. (int)
- **prompt_strength**: Prompt strength (or denoising strength) when using image to image. 1.0 corresponds to full destruction of information in image. (float)


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
- **guidance_scale**: Scale for classifier-free guidance (float)
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


