from pydantic import BaseModel, Field
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode


class BecomeImage(GraphNode):
    seed: int | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Fix the random seed for reproducibility')
    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None), description='An image of a person to be converted')
    prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='a person', description=None)
    image_to_become: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None), description='Any image to convert the person to')
    negative_prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='Things you do not want in the image')
    prompt_strength: float | GraphNode | tuple[GraphNode, str] = Field(default=2, description='Strength of the prompt. This is the CFG scale, higher numbers lead to stronger prompt, lower numbers will keep more of a likeness to the original.')
    number_of_images: int | GraphNode | tuple[GraphNode, str] = Field(default=2, description='Number of images to generate')
    denoising_strength: float | GraphNode | tuple[GraphNode, str] = Field(default=1, description='How much of the original image of the person to keep. 1 is the complete destruction of the original image, 0 is the original image')
    instant_id_strength: float | GraphNode | tuple[GraphNode, str] = Field(default=1, description='How strong the InstantID will be.')
    image_to_become_noise: float | GraphNode | tuple[GraphNode, str] = Field(default=0.3, description='How much noise to add to the style image before processing. An alternative way of controlling stength.')
    control_depth_strength: float | GraphNode | tuple[GraphNode, str] = Field(default=0.8, description='Strength of depth controlnet. The bigger this is, the more controlnet affects the output.')
    disable_safety_checker: bool | GraphNode | tuple[GraphNode, str] = Field(default=False, description='Disable safety checker for generated images')
    image_to_become_strength: float | GraphNode | tuple[GraphNode, str] = Field(default=0.75, description='How strong the style will be applied')
    @classmethod
    def get_node_type(cls): return "replicate.image.face.BecomeImage"


from nodetool.nodes.replicate.image.face import Style

class FaceToMany(GraphNode):
    seed: int | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Fix the random seed for reproducibility')
    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None), description='An image of a person to be converted')
    style: Style | GraphNode | tuple[GraphNode, str] = Field(default='3D', description='Style to convert to')
    prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='a person', description=None)
    lora_scale: float | GraphNode | tuple[GraphNode, str] = Field(default=1, description='How strong the LoRA will be')
    custom_lora_url: str | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='URL to a Replicate custom LoRA. Must be in the format https://replicate.delivery/pbxt/[id]/trained_model.tar or https://pbxt.replicate.delivery/[id]/trained_model.tar')
    negative_prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='Things you do not want in the image')
    prompt_strength: float | GraphNode | tuple[GraphNode, str] = Field(default=4.5, description='Strength of the prompt. This is the CFG scale, higher numbers lead to stronger prompt, lower numbers will keep more of a likeness to the original.')
    denoising_strength: float | GraphNode | tuple[GraphNode, str] = Field(default=0.65, description='How much of the original image to keep. 1 is the complete destruction of the original image, 0 is the original image')
    instant_id_strength: float | GraphNode | tuple[GraphNode, str] = Field(default=1, description='How strong the InstantID will be.')
    control_depth_strength: float | GraphNode | tuple[GraphNode, str] = Field(default=0.8, description='Strength of depth controlnet. The bigger this is, the more controlnet affects the output.')
    @classmethod
    def get_node_type(cls): return "replicate.image.face.FaceToMany"



class FaceToSticker(GraphNode):
    seed: int | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Fix the random seed for reproducibility')
    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None), description='An image of a person to be converted to a sticker')
    steps: int | GraphNode | tuple[GraphNode, str] = Field(default=20, description=None)
    width: int | GraphNode | tuple[GraphNode, str] = Field(default=1024, description=None)
    height: int | GraphNode | tuple[GraphNode, str] = Field(default=1024, description=None)
    prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='a person', description=None)
    upscale: bool | GraphNode | tuple[GraphNode, str] = Field(default=False, description='2x upscale the sticker')
    upscale_steps: int | GraphNode | tuple[GraphNode, str] = Field(default=10, description='Number of steps to upscale')
    negative_prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='Things you do not want in the image')
    prompt_strength: float | GraphNode | tuple[GraphNode, str] = Field(default=7, description='Strength of the prompt. This is the CFG scale, higher numbers lead to stronger prompt, lower numbers will keep more of a likeness to the original.')
    ip_adapter_noise: float | GraphNode | tuple[GraphNode, str] = Field(default=0.5, description='How much noise is added to the IP adapter input')
    ip_adapter_weight: float | GraphNode | tuple[GraphNode, str] = Field(default=0.2, description='How much the IP adapter will influence the image')
    instant_id_strength: float | GraphNode | tuple[GraphNode, str] = Field(default=1, description='How strong the InstantID will be.')
    @classmethod
    def get_node_type(cls): return "replicate.image.face.FaceToSticker"


from nodetool.nodes.replicate.image.face import Scheduler
from nodetool.nodes.replicate.image.face import Sdxl_weights
from nodetool.nodes.replicate.image.face import Output_format

class InstantId(GraphNode):
    seed: int | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Random seed. Leave blank to randomize the seed')
    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None), description='Input face image')
    prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='a person', description='Input prompt')
    scheduler: Scheduler | GraphNode | tuple[GraphNode, str] = Field(default='EulerDiscreteScheduler', description='Scheduler')
    enable_lcm: bool | GraphNode | tuple[GraphNode, str] = Field(default=False, description='Enable Fast Inference with LCM (Latent Consistency Models) - speeds up inference steps, trade-off is the quality of the generated image. Performs better with close-up portrait face images')
    pose_image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None), description='(Optional) reference pose image')
    num_outputs: int | GraphNode | tuple[GraphNode, str] = Field(default=1, description='Number of images to output')
    sdxl_weights: Sdxl_weights | GraphNode | tuple[GraphNode, str] = Field(default='stable-diffusion-xl-base-1.0', description='Pick which base weights you want to use')
    output_format: Output_format | GraphNode | tuple[GraphNode, str] = Field(default='webp', description='Format of the output images')
    pose_strength: float | GraphNode | tuple[GraphNode, str] = Field(default=0.4, description='Openpose ControlNet strength, effective only if `enable_pose_controlnet` is true')
    canny_strength: float | GraphNode | tuple[GraphNode, str] = Field(default=0.3, description='Canny ControlNet strength, effective only if `enable_canny_controlnet` is true')
    depth_strength: float | GraphNode | tuple[GraphNode, str] = Field(default=0.5, description='Depth ControlNet strength, effective only if `enable_depth_controlnet` is true')
    guidance_scale: float | GraphNode | tuple[GraphNode, str] = Field(default=7.5, description='Scale for classifier-free guidance')
    output_quality: int | GraphNode | tuple[GraphNode, str] = Field(default=80, description='Quality of the output images, from 0 to 100. 100 is best quality, 0 is lowest quality.')
    negative_prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='Input Negative Prompt')
    ip_adapter_scale: float | GraphNode | tuple[GraphNode, str] = Field(default=0.8, description='Scale for image adapter strength (for detail)')
    lcm_guidance_scale: float | GraphNode | tuple[GraphNode, str] = Field(default=1.5, description='Only used when `enable_lcm` is set to True, Scale for classifier-free guidance when using LCM')
    num_inference_steps: int | GraphNode | tuple[GraphNode, str] = Field(default=30, description='Number of denoising steps')
    disable_safety_checker: bool | GraphNode | tuple[GraphNode, str] = Field(default=False, description='Disable safety checker for generated images')
    enable_pose_controlnet: bool | GraphNode | tuple[GraphNode, str] = Field(default=True, description='Enable Openpose ControlNet, overrides strength if set to false')
    enhance_nonface_region: bool | GraphNode | tuple[GraphNode, str] = Field(default=True, description='Enhance non-face region')
    enable_canny_controlnet: bool | GraphNode | tuple[GraphNode, str] = Field(default=False, description='Enable Canny ControlNet, overrides strength if set to false')
    enable_depth_controlnet: bool | GraphNode | tuple[GraphNode, str] = Field(default=False, description='Enable Depth ControlNet, overrides strength if set to false')
    lcm_num_inference_steps: int | GraphNode | tuple[GraphNode, str] = Field(default=5, description='Only used when `enable_lcm` is set to True, Number of denoising steps when using LCM')
    controlnet_conditioning_scale: float | GraphNode | tuple[GraphNode, str] = Field(default=0.8, description='Scale for IdentityNet strength (for fidelity)')
    @classmethod
    def get_node_type(cls): return "replicate.image.face.InstantId"


from nodetool.nodes.replicate.image.face import Style_name

class PhotoMaker(GraphNode):
    seed: int | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Seed. Leave blank to use a random number')
    prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='A photo of a person img', description="Prompt. Example: 'a photo of a man/woman img'. The phrase 'img' is the trigger word.")
    num_steps: int | GraphNode | tuple[GraphNode, str] = Field(default=20, description='Number of sample steps')
    style_name: Style_name | GraphNode | tuple[GraphNode, str] = Field(default='Photographic (Default)', description="Style template. The style template will add a style-specific prompt and negative prompt to the user's prompt.")
    input_image: str | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='The input image, for example a photo of your face.')
    num_outputs: int | GraphNode | tuple[GraphNode, str] = Field(default=1, description='Number of output images')
    input_image2: str | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Additional input image (optional)')
    input_image3: str | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Additional input image (optional)')
    input_image4: str | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Additional input image (optional)')
    guidance_scale: float | GraphNode | tuple[GraphNode, str] = Field(default=5, description='Guidance scale. A guidance scale of 1 corresponds to doing no classifier free guidance.')
    negative_prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='nsfw, lowres, bad anatomy, bad hands, text, error, missing fingers, extra digit, fewer digits, cropped, worst quality, low quality, normal quality, jpeg artifacts, signature, watermark, username, blurry', description='Negative Prompt. The negative prompt should NOT contain the trigger word.')
    style_strength_ratio: float | GraphNode | tuple[GraphNode, str] = Field(default=20, description='Style strength (%)')
    disable_safety_checker: bool | GraphNode | tuple[GraphNode, str] = Field(default=False, description='Disable safety checker for generated images.')
    @classmethod
    def get_node_type(cls): return "replicate.image.face.PhotoMaker"


from nodetool.nodes.replicate.image.face import Style_name

class PhotoMakerStyle(GraphNode):
    seed: int | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Seed. Leave blank to use a random number')
    prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='A photo of a person img', description="Prompt. Example: 'a photo of a man/woman img'. The phrase 'img' is the trigger word.")
    num_steps: int | GraphNode | tuple[GraphNode, str] = Field(default=20, description='Number of sample steps')
    style_name: Style_name | GraphNode | tuple[GraphNode, str] = Field(default='(No style)', description="Style template. The style template will add a style-specific prompt and negative prompt to the user's prompt.")
    input_image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None), description='The input image, for example a photo of your face.')
    num_outputs: int | GraphNode | tuple[GraphNode, str] = Field(default=1, description='Number of output images')
    input_image2: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None), description='Additional input image (optional)')
    input_image3: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None), description='Additional input image (optional)')
    input_image4: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None), description='Additional input image (optional)')
    guidance_scale: float | GraphNode | tuple[GraphNode, str] = Field(default=5, description='Guidance scale. A guidance scale of 1 corresponds to doing no classifier free guidance.')
    negative_prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='nsfw, lowres, bad anatomy, bad hands, text, error, missing fingers, extra digit, fewer digits, cropped, worst quality, low quality, normal quality, jpeg artifacts, signature, watermark, username, blurry', description='Negative Prompt. The negative prompt should NOT contain the trigger word.')
    style_strength_ratio: float | GraphNode | tuple[GraphNode, str] = Field(default=20, description='Style strength (%)')
    disable_safety_checker: bool | GraphNode | tuple[GraphNode, str] = Field(default=False, description='Disable safety checker for generated images.')
    @classmethod
    def get_node_type(cls): return "replicate.image.face.PhotoMakerStyle"


