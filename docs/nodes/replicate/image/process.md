# nodetool.nodes.replicate.image.process

## DD_Color

Towards Photo-Realistic Image Colorization via Dual Decoders

- **image**: Grayscale input image. (str | None)
- **model_size**: Choose the model size. (Model_size)

## Magic_Style_Transfer

Restyle an image with the style of another one. I strongly suggest to upscale the results with Clarity AI

- **seed**: Random seed. Leave blank to randomize the seed (int | None)
- **image**: Input image (ImageRef)
- **prompt**: Input prompt (str)
- **ip_image**: Input image for img2img or inpaint mode (ImageRef)
- **ip_scale**: IP Adapter strength. (float)
- **strength**: When img2img is active, the denoising strength. 1 means total destruction of the input image. (float)
- **scheduler**: scheduler (Scheduler)
- **lora_scale**: LoRA additive scale. Only applicable on trained models. (float)
- **num_outputs**: Number of images to output (int)
- **lora_weights**: Replicate LoRA weights to use. Leave blank to use the default weights. (str | None)
- **guidance_scale**: Scale for classifier-free guidance (float)
- **resizing_scale**: If you want the image to have a solid margin. Scale of the solid margin. 1.0 means no resizing. (float)
- **apply_watermark**: Applies a watermark to enable determining if an image is generated in downstream applications. If you have other provisions for generating or deploying images safely, you can use this to disable watermarking. (bool)
- **negative_prompt**: Input Negative Prompt (str)
- **background_color**: When passing an image with alpha channel, it will be replaced with this color (str)
- **num_inference_steps**: Number of denoising steps (int)
- **condition_canny_scale**: The bigger this number is, the more ControlNet interferes (float)
- **condition_depth_scale**: The bigger this number is, the more ControlNet interferes (float)

## ModNet

A deep learning approach to remove background & adding new background image

- **image**: input image (ImageRef)

## ObjectRemover

None

- **org_image**: Original input image (ImageRef)
- **mask_image**: Mask image (ImageRef)

## RemoveBackground

Remove images background

- **image**: Input image (ImageRef)

