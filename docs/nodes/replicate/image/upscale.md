# nodetool.nodes.replicate.image.upscale

## ClarityUpscaler

High resolution image Upscaler and Enhancer. Use at ClarityAI.co. A free Magnific alternative. Twitter/X: @philz1337x

- **mask**: Mask image to mark areas that should be preserved during upscaling (`str | None`)
- **seed**: Random seed. Leave blank to randomize the seed (`int`)
- **image**: input image (`ImageRef`)
- **prompt**: Prompt (`str`)
- **dynamic**: HDR, try from 3 - 9 (`float`)
- **handfix**: Use clarity to fix hands in the image (`Handfix`)
- **sharpen**: Sharpen the image after upscaling. The higher the value, the more sharpening is applied. 0 for no sharpening (`float`)
- **sd_model**: Stable Diffusion model checkpoint (`Sd_model`)
- **scheduler**: scheduler (`Scheduler`)
- **creativity**: Creativity, try from 0.3 - 0.9 (`float`)
- **lora_links**: Link to a lora file you want to use in your upscaling. Multiple links possible, seperated by comma (`str`)
- **downscaling**: Downscale the image before upscaling. Can improve quality and speed for images with high resolution but lower quality (`bool`)
- **resemblance**: Resemblance, try from 0.3 - 1.6 (`float`)
- **scale_factor**: Scale factor (`float`)
- **tiling_width**: Fractality, set lower tile width for a high Fractality (`Tiling_width`)
- **output_format**: Format of the output images (`Output_format`)
- **tiling_height**: Fractality, set lower tile height for a high Fractality (`Tiling_height`)
- **custom_sd_model** (`str`)
- **negative_prompt**: Negative Prompt (`str`)
- **num_inference_steps**: Number of denoising steps (`int`)
- **downscaling_resolution**: Downscaling resolution (`int`)

## HighResolutionControlNetTile

Fermat.app open-source implementation of an efficient ControlNet 1.1 tile for high-quality upscales. Increase the creativity to encourage hallucination.

- **hdr**: HDR improvement over the original image (`float`)
- **seed**: Seed (`int | None`)
- **image**: Control image for scribble controlnet (`ImageRef`)
- **steps**: Steps (`int`)
- **prompt**: Prompt for the model (`str | None`)
- **scheduler**: Choose a scheduler. (`Scheduler`)
- **creativity**: Denoising strength. 1 means total destruction of the original image (`float`)
- **guess_mode**: In this mode, the ControlNet encoder will try best to recognize the content of the input image even if you remove all prompts. The `guidance_scale` between 3.0 and 5.0 is recommended. (`bool`)
- **resolution**: Image resolution (`Resolution`)
- **resemblance**: Conditioning scale for controlnet (`float`)
- **guidance_scale**: Scale for classifier-free guidance (`float`)
- **negative_prompt**: Negative prompt (`str`)

## MagicImageRefiner

A better alternative to SDXL refiners, providing a lot of quality and detail. Can also be used for inpainting or upscaling.

- **hdr**: HDR improvement over the original image (`float`)
- **mask**: When provided, refines some section of the image. Must be the same size as the image (`ImageRef`)
- **seed**: Seed (`int | None`)
- **image**: Image to refine (`ImageRef`)
- **steps**: Steps (`int`)
- **prompt**: Prompt for the model (`str | None`)
- **scheduler**: Choose a scheduler. (`Scheduler`)
- **creativity**: Denoising strength. 1 means total destruction of the original image (`float`)
- **guess_mode**: In this mode, the ControlNet encoder will try best to recognize the content of the input image even if you remove all prompts. The `guidance_scale` between 3.0 and 5.0 is recommended. (`bool`)
- **resolution**: Image resolution (`Resolution`)
- **resemblance**: Conditioning scale for controlnet (`float`)
- **guidance_scale**: Scale for classifier-free guidance (`float`)
- **negative_prompt**: Negative prompt (`str`)

## RealEsrGan

Real-ESRGAN for image upscaling on an A100

- **image**: Input image (`ImageRef`)
- **scale**: Factor to scale image by (`float`)
- **face_enhance**: Run GFPGAN face enhancement along with upscaling (`bool`)

## Swin2SR

3 Million Runs! AI Photorealistic Image Super-Resolution and Restoration

- **task**: Choose a task (`Task`)
- **image**: Input image (`ImageRef`)

## SwinIR

Image Restoration Using Swin Transformer

- **jpeg**: scale factor, activated for JPEG Compression Artifact Reduction. Leave it as default or arbitrary if other tasks are selected (`int`)
- **image**: input image (`ImageRef`)
- **noise**: noise level, activated for Grayscale Image Denoising and Color Image Denoising. Leave it as default or arbitrary if other tasks are selected (`Noise`)
- **task_type**: Choose a task (`Task_type`)

## UltimateSDUpscale

Ultimate SD Upscale with ControlNet Tile

- **cfg**: CFG (`float`)
- **seed**: Sampling seed, leave Empty for Random (`int | None`)
- **image**: Input image (`ImageRef`)
- **steps**: Steps (`int`)
- **denoise**: Denoise (`float`)
- **upscaler**: Upscaler (`Upscaler`)
- **mask_blur**: Mask Blur (`int`)
- **mode_type**: Mode Type (`Mode_type`)
- **scheduler**: Scheduler (`Scheduler`)
- **tile_width**: Tile Width (`int`)
- **upscale_by**: Upscale By (`float`)
- **tile_height**: Tile Height (`int`)
- **sampler_name**: Sampler (`Sampler_name`)
- **tile_padding**: Tile Padding (`int`)
- **seam_fix_mode**: Seam Fix Mode (`Seam_fix_mode`)
- **seam_fix_width**: Seam Fix Width (`int`)
- **negative_prompt**: Negative Prompt (`str`)
- **positive_prompt**: Positive Prompt (`str`)
- **seam_fix_denoise**: Seam Fix Denoise (`float`)
- **seam_fix_padding**: Seam Fix Padding (`int`)
- **seam_fix_mask_blur**: Seam Fix Mask Blur (`int`)
- **controlnet_strength**: ControlNet Strength (`float`)
- **force_uniform_tiles**: Force Uniform Tiles (`bool`)
- **use_controlnet_tile**: Use ControlNet Tile (`bool`)

## ruDallE_SR

Real-ESRGAN super-resolution model from ruDALL-E

- **image**: Input image (`ImageRef`)
- **scale**: Choose up-scaling factor (`Scale`)

