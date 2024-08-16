# nodetool.nodes.replicate.image.face

## BecomeImage

Adapt any picture of a face into another image

**Fields:**
seed: int | None
image: ImageRef
prompt: str
image_to_become: ImageRef
negative_prompt: str
prompt_strength: float
number_of_images: int
denoising_strength: float
instant_id_strength: float
image_to_become_noise: float
control_depth_strength: float
disable_safety_checker: bool
image_to_become_strength: float

## FaceToMany

Turn a face into 3D, emoji, pixel art, video game, claymation or toy

**Fields:**
seed: int | None
image: ImageRef
style: Style
prompt: str
lora_scale: float
custom_lora_url: str | None
negative_prompt: str
prompt_strength: float
denoising_strength: float
instant_id_strength: float
control_depth_strength: float

## FaceToSticker

Turn a face into a sticker

**Fields:**
seed: int | None
image: ImageRef
steps: int
width: int
height: int
prompt: str
upscale: bool
upscale_steps: int
negative_prompt: str
prompt_strength: float
ip_adapter_noise: float
ip_adapter_weight: float
instant_id_strength: float

## InstantId

Make realistic images of real people instantly

**Fields:**
seed: int | None
image: ImageRef
prompt: str
scheduler: Scheduler
enable_lcm: bool
pose_image: ImageRef
num_outputs: int
sdxl_weights: Sdxl_weights
output_format: Output_format
pose_strength: float
canny_strength: float
depth_strength: float
guidance_scale: float
output_quality: int
negative_prompt: str
ip_adapter_scale: float
lcm_guidance_scale: float
num_inference_steps: int
disable_safety_checker: bool
enable_pose_controlnet: bool
enhance_nonface_region: bool
enable_canny_controlnet: bool
enable_depth_controlnet: bool
lcm_num_inference_steps: int
face_detection_input_width: int
face_detection_input_height: int
controlnet_conditioning_scale: float

## PhotoMaker

Create photos, paintings and avatars for anyone in any style within seconds.

**Fields:**
seed: int | None
prompt: str
num_steps: int
style_name: Style_name
input_image: str | None
num_outputs: int
input_image2: str | None
input_image3: str | None
input_image4: str | None
guidance_scale: float
negative_prompt: str
style_strength_ratio: float
disable_safety_checker: bool

## PhotoMakerStyle

Create photos, paintings and avatars for anyone in any style within seconds.  (Stylization version)

**Fields:**
seed: int | None
prompt: str
num_steps: int
style_name: Style_name
input_image: ImageRef
num_outputs: int
input_image2: ImageRef
input_image3: ImageRef
input_image4: ImageRef
guidance_scale: float
negative_prompt: str
style_strength_ratio: float
disable_safety_checker: bool

