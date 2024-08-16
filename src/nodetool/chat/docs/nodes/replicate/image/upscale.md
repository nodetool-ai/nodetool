# nodetool.nodes.replicate.image.upscale

## ClarityUpscaler

High resolution image Upscaler and Enhancer. Use at ClarityAI.co. A free Magnific alternative. Twitter/X: @philz1337x

**Fields:**
mask: str | None
seed: int
image: ImageRef
prompt: str
dynamic: float
handfix: Handfix
sharpen: float
sd_model: Sd_model
scheduler: Scheduler
creativity: float
lora_links: str
downscaling: bool
resemblance: float
scale_factor: float
tiling_width: Tiling_width
output_format: Output_format
tiling_height: Tiling_height
custom_sd_model: str
negative_prompt: str
num_inference_steps: int
downscaling_resolution: int

## HighResolutionControlNetTile

Fermat.app open-source implementation of an efficient ControlNet 1.1 tile for high-quality upscales. Increase the creativity to encourage hallucination.

**Fields:**
hdr: float
seed: int | None
image: ImageRef
steps: int
prompt: str | None
scheduler: Scheduler
creativity: float
guess_mode: bool
resolution: Resolution
resemblance: float
guidance_scale: float
negative_prompt: str

## MagicImageRefiner

A better alternative to SDXL refiners, providing a lot of quality and detail. Can also be used for inpainting or upscaling.

**Fields:**
hdr: float
mask: ImageRef
seed: int | None
image: ImageRef
steps: int
prompt: str | None
scheduler: Scheduler
creativity: float
guess_mode: bool
resolution: Resolution
resemblance: float
guidance_scale: float
negative_prompt: str

## RealEsrGan

Real-ESRGAN for image upscaling on an A100

**Fields:**
image: ImageRef
scale: float
face_enhance: bool

## Swin2SR

3 Million Runs! AI Photorealistic Image Super-Resolution and Restoration

**Fields:**
task: Task
image: ImageRef

## SwinIR

Image Restoration Using Swin Transformer

**Fields:**
jpeg: int
image: ImageRef
noise: Noise
task_type: Task_type

## UltimateSDUpscale

Ultimate SD Upscale with ControlNet Tile

**Fields:**
cfg: float
seed: int | None
image: ImageRef
steps: int
denoise: float
upscaler: Upscaler
mask_blur: int
mode_type: Mode_type
scheduler: Scheduler
tile_width: int
upscale_by: float
tile_height: int
sampler_name: Sampler_name
tile_padding: int
seam_fix_mode: Seam_fix_mode
seam_fix_width: int
negative_prompt: str
positive_prompt: str
seam_fix_denoise: float
seam_fix_padding: int
seam_fix_mask_blur: int
controlnet_strength: float
force_uniform_tiles: bool
use_controlnet_tile: bool

## ruDallE_SR

Real-ESRGAN super-resolution model from ruDALL-E

**Fields:**
image: ImageRef
scale: Scale

