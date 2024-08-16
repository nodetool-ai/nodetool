# nodetool.nodes.replicate.image.process

## DD_Color

Towards Photo-Realistic Image Colorization via Dual Decoders

**Fields:**
image: str | None
model_size: Model_size

## Magic_Style_Transfer

Restyle an image with the style of another one. I strongly suggest to upscale the results with Clarity AI

**Fields:**
seed: int | None
image: ImageRef
prompt: str
ip_image: ImageRef
ip_scale: float
strength: float
scheduler: Scheduler
lora_scale: float
num_outputs: int
lora_weights: str | None
guidance_scale: float
resizing_scale: float
apply_watermark: bool
negative_prompt: str
background_color: str
num_inference_steps: int
condition_canny_scale: float
condition_depth_scale: float

## ModNet

A deep learning approach to remove background & adding new background image

**Fields:**
image: ImageRef

## ObjectRemover

None

**Fields:**
org_image: ImageRef
mask_image: ImageRef

## RemoveBackground

Remove images background

**Fields:**
image: ImageRef

