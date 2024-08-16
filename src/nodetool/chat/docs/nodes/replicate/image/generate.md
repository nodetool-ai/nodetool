# nodetool.nodes.replicate.image.generate

## AdInpaint

Product advertising image generator

**Fields:**
pixel: Pixel
scale: int
prompt: str | None
image_num: int
image_path: ImageRef
manual_seed: int
product_size: Product_size
guidance_scale: float
negative_prompt: str
num_inference_steps: int

## ConsistentCharacter

Create images of a given character in different poses

**Fields:**
seed: int | None
prompt: str
subject: ImageRef
output_format: Output_format
output_quality: int
negative_prompt: str
randomise_poses: bool
number_of_outputs: int
disable_safety_checker: bool
number_of_images_per_pose: int

## Controlnet_Realistic_Vision

controlnet 1.1 lineart x realistic-vision-v2.0 (updated to v5)

**Fields:**
seed: int | None
image: ImageRef
steps: int
prompt: str
strength: float
max_width: float
max_height: float
guidance_scale: int
negative_prompt: str

## Controlnet_X_IP_Adapter_Realistic_Vision_V5

Inpainting || multi-controlnet || single-controlnet || ip-adapter || ip adapter face || ip adapter plus || No ip adapter

**Fields:**
eta: float
seed: int | None
prompt: str | None
max_width: int
scheduler: Scheduler
guess_mode: bool
int_kwargs: str
mask_image: ImageRef
max_height: int
tile_image: ImageRef
num_outputs: int
img2img_image: str | None
lineart_image: ImageRef
guidance_scale: float
scribble_image: ImageRef
ip_adapter_ckpt: Ip_adapter_ckpt
negative_prompt: str
brightness_image: ImageRef
img2img_strength: float
inpainting_image: ImageRef
ip_adapter_image: str | None
ip_adapter_weight: float
sorted_controlnets: str
inpainting_strength: float
num_inference_steps: int
disable_safety_check: bool
film_grain_lora_weight: float
negative_auto_mask_text: str | None
positive_auto_mask_text: str | None
tile_conditioning_scale: float
add_more_detail_lora_scale: float
detail_tweaker_lora_weight: float
lineart_conditioning_scale: float
scribble_conditioning_scale: float
epi_noise_offset_lora_weight: float
brightness_conditioning_scale: float
inpainting_conditioning_scale: float
color_temprature_slider_lora_weight: float

## EpicRealismXL_Lightning_Hades

Fast and high quality lightning model, epiCRealismXL-Lightning Hades

**Fields:**
seed: int | None
width: int
height: int
prompt: str
output_format: Output_format
output_quality: int
negative_prompt: str
number_of_images: int
disable_safety_checker: bool

## Illusions

Create illusions with img2img and masking support

**Fields:**
seed: int | None
image: ImageRef
width: int
height: int
prompt: str
mask_image: ImageRef
num_outputs: int
control_image: ImageRef
controlnet_end: float
guidance_scale: float
negative_prompt: str
prompt_strength: float
sizing_strategy: Sizing_strategy
controlnet_start: float
num_inference_steps: int
controlnet_conditioning_scale: float

## Juggernaut_XL_V9

Juggernaut XL v9

**Fields:**
seed: int | None
width: int
height: int
prompt: str
scheduler: Scheduler
num_outputs: int
guidance_scale: float
apply_watermark: bool
negative_prompt: str
num_inference_steps: int
disable_safety_checker: bool

## Kandinsky

multilingual text2image latent diffusion model

**Fields:**
seed: int | None
width: Width
height: Height
prompt: str
num_outputs: int
output_format: Output_format
negative_prompt: str | None
num_inference_steps: int
num_inference_steps_prior: int

## OpenDalle_Lora

Better than SDXL at both prompt adherence and image quality, by dataautogpt3

**Fields:**
mask: ImageRef
seed: int | None
image: ImageRef
width: int
height: int
prompt: str
refine: Refine
scheduler: Scheduler
lora_scale: float
num_outputs: int
lora_weights: str | None
refine_steps: int | None
guidance_scale: float
apply_watermark: bool
high_noise_frac: float
negative_prompt: str
prompt_strength: float
num_inference_steps: int
disable_safety_checker: bool

## PlaygroundV2

Playground v2.5 is the state-of-the-art open-source model in aesthetic quality

**Fields:**
mask: str | None
seed: int | None
image: ImageRef
width: int
height: int
prompt: str
scheduler: Scheduler
num_outputs: int
guidance_scale: float
apply_watermark: bool
negative_prompt: str
prompt_strength: float
num_inference_steps: int
disable_safety_checker: bool

## Proteus

ProteusV0.4: The Style Update

**Fields:**
mask: ImageRef
seed: int | None
image: ImageRef
width: int
height: int
prompt: str
scheduler: Scheduler
num_outputs: int
guidance_scale: float
apply_watermark: bool
negative_prompt: str
prompt_strength: float
num_inference_steps: int
disable_safety_checker: bool

## PulidBase

Use a face to make images. Uses SDXL fine-tuned checkpoints.

**Fields:**
seed: int | None
width: int
height: int
prompt: str
face_image: ImageRef
face_style: Face_style
output_format: Output_format
output_quality: int
negative_prompt: str
checkpoint_model: Checkpoint_model
number_of_images: int

## RealVisXL2_LCM

RealvisXL-v2.0 with LCM LoRA - requires fewer steps (4 to 8 instead of the original 40 to 50)

**Fields:**
mask: ImageRef
seed: int | None
image: ImageRef
width: int
height: int
prompt: str
scheduler: Scheduler
num_outputs: int
guidance_scale: float
apply_watermark: bool
negative_prompt: str
prompt_strength: float
num_inference_steps: int
disable_safety_checker: bool

## RealVisXL_V2

Implementation of SDXL RealVisXL_V2.0

**Fields:**
mask: ImageRef
seed: int | None
image: ImageRef
width: int
height: int
prompt: str
scheduler: Scheduler
lora_scale: float
num_outputs: int
lora_weights: str | None
guidance_scale: float
apply_watermark: bool
negative_prompt: str
prompt_strength: float
num_inference_steps: int
disable_safety_checker: bool

## RealVisXL_V3_Multi_Controlnet_Lora

RealVisXl V3 with multi-controlnet, lora loading, img2img, inpainting

**Fields:**
mask: ImageRef
seed: int | None
image: ImageRef
width: int
height: int
prompt: str
refine: Refine
scheduler: Scheduler
lora_scale: float
num_outputs: int
controlnet_1: Controlnet_1
controlnet_2: Controlnet_2
controlnet_3: Controlnet_3
lora_weights: str | None
refine_steps: int | None
guidance_scale: float
apply_watermark: bool
negative_prompt: str
prompt_strength: float
sizing_strategy: Sizing_strategy
controlnet_1_end: float
controlnet_2_end: float
controlnet_3_end: float
controlnet_1_image: ImageRef
controlnet_1_start: float
controlnet_2_image: ImageRef
controlnet_2_start: float
controlnet_3_image: ImageRef
controlnet_3_start: float
num_inference_steps: int
disable_safety_checker: bool
controlnet_1_conditioning_scale: float
controlnet_2_conditioning_scale: float
controlnet_3_conditioning_scale: float

## SD3_Explorer

A model for experimenting with all the SD3 settings. Non-commercial use only unless you have a Stability AI membership.

**Fields:**
seed: int | None
model: Model
shift: float
steps: int
width: int
height: int
prompt: str
sampler: Sampler
scheduler: Scheduler
output_format: Output_format
guidance_scale: float
output_quality: int
negative_prompt: str
number_of_images: int
triple_prompt_t5: str
use_triple_prompt: bool
triple_prompt_clip_g: str
triple_prompt_clip_l: str
negative_conditioning_end: float
triple_prompt_empty_padding: bool

## SDXL_Ad_Inpaint

Product advertising image generator using SDXL

**Fields:**
seed: int | None
image: ImageRef
prompt: str | None
img_size: Img_size
apply_img: bool
scheduler: Scheduler
product_fill: Product_fill
guidance_scale: float
condition_scale: float
negative_prompt: str
num_refine_steps: int
num_inference_steps: int

## SDXL_Controlnet

SDXL ControlNet - Canny

**Fields:**
seed: int
image: ImageRef
prompt: str
condition_scale: float
negative_prompt: str
num_inference_steps: int

## SDXL_Emoji

An SDXL fine-tune based on Apple Emojis

**Fields:**
mask: ImageRef
seed: int | None
image: ImageRef
width: int
height: int
prompt: str
refine: Refine
scheduler: Scheduler
lora_scale: float
num_outputs: int
refine_steps: int | None
guidance_scale: float
apply_watermark: bool
high_noise_frac: float
negative_prompt: str
prompt_strength: float
replicate_weights: str | None
num_inference_steps: int

## SDXL_Pixar

Create Pixar poster easily with SDXL Pixar.

**Fields:**
mask: ImageRef
seed: int | None
image: ImageRef
width: int
height: int
prompt: str
refine: Refine
scheduler: Scheduler
lora_scale: float
num_outputs: int
refine_steps: int | None
guidance_scale: float
apply_watermark: bool
high_noise_frac: float
negative_prompt: str
prompt_strength: float
replicate_weights: str | None
num_inference_steps: int

## StableDiffusion

A latent text-to-image diffusion model capable of generating photo-realistic images given any text input

**Fields:**
seed: int | None
width: Width
height: Height
prompt: str
scheduler: Scheduler
num_outputs: int
guidance_scale: float
negative_prompt: str | None
num_inference_steps: int

## StableDiffusion3

A text-to-image model with greatly improved performance in image quality, typography, complex prompt understanding, and resource-efficiency

**Fields:**
seed: int | None
image: str | None
prompt: str
num_outputs: int
aspect_ratio: Aspect_ratio
output_format: Output_format
guidance_scale: float
output_quality: int
negative_prompt: str
prompt_strength: float
disable_safety_checker: bool

## StableDiffusionInpainting

SDXL Inpainting developed by the HF Diffusers team

**Fields:**
mask: str | None
seed: int | None
image: ImageRef
steps: int
prompt: str
strength: float
scheduler: Scheduler
num_outputs: int
guidance_scale: float
negative_prompt: str

## StableDiffusionXL

A text-to-image generative AI model that creates beautiful images

**Fields:**
mask: ImageRef
seed: int | None
image: ImageRef
width: int
height: int
prompt: str
refine: Refine
scheduler: Scheduler
lora_scale: float
num_outputs: int
refine_steps: int | None
guidance_scale: float
apply_watermark: bool
high_noise_frac: float
negative_prompt: str
prompt_strength: float
replicate_weights: str | None
num_inference_steps: int
disable_safety_checker: bool

## StableDiffusionXLLightning

SDXL-Lightning by ByteDance: a fast text-to-image model that makes high-quality images in 4 steps

**Fields:**
seed: int | None
width: int
height: int
prompt: str
scheduler: Scheduler
num_outputs: int
guidance_scale: float
negative_prompt: str
num_inference_steps: int
disable_safety_checker: bool

## StyleTransfer

Transfer the style of one image to another

**Fields:**
seed: int | None
model: Model
width: int
height: int
prompt: str
style_image: ImageRef
output_format: Output_format
output_quality: int
negative_prompt: str
structure_image: ImageRef
number_of_images: int
structure_depth_strength: float
structure_denoising_strength: float

