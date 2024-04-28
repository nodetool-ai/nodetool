from pydantic import BaseModel, Field
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode

from nodetool.nodes.replicate.image.upscale import Sd_model
from nodetool.nodes.replicate.image.upscale import Scheduler
from nodetool.nodes.replicate.image.upscale import Tiling_width
from nodetool.nodes.replicate.image.upscale import Tiling_height

class ClarityUpscaler(GraphNode):
    seed: int | GraphNode | tuple[GraphNode, str] = Field(default=1337, description='Random seed. Leave blank to randomize the seed')
    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None), description='input image')
    prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='masterpiece, best quality, highres, <lora:more_details:0.5> <lora:SDXLrender_v2.0:1>', description='Prompt')
    dynamic: float | GraphNode | tuple[GraphNode, str] = Field(default=6, description='HDR, try from 3 - 9')
    sd_model: Sd_model | GraphNode | tuple[GraphNode, str] = Field(default='juggernaut_reborn.safetensors [338b85bc4f]', description='Stable Diffusion model checkpoint')
    scheduler: Scheduler | GraphNode | tuple[GraphNode, str] = Field(default='DPM++ 3M SDE Karras', description='scheduler')
    creativity: float | GraphNode | tuple[GraphNode, str] = Field(default=0.35, description='Creativity, try from 0.3 - 0.9')
    lora_links: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='Link to a lora file you want to use in your upscaling. Multiple links possible, seperated by comma')
    downscaling: bool | GraphNode | tuple[GraphNode, str] = Field(default=False, description='Downscale the image before upscaling. Can improve quality and speed for images with high resolution but lower quality')
    resemblance: float | GraphNode | tuple[GraphNode, str] = Field(default=0.6, description='Resemblance, try from 0.3 - 1.6')
    scale_factor: float | GraphNode | tuple[GraphNode, str] = Field(default=2, description='Scale factor')
    tiling_width: Tiling_width | GraphNode | tuple[GraphNode, str] = Field(default=112, description='Fractality, set lower tile width for a high Fractality')
    tiling_height: Tiling_height | GraphNode | tuple[GraphNode, str] = Field(default=144, description='Fractality, set lower tile height for a high Fractality')
    custom_sd_model: str | GraphNode | tuple[GraphNode, str] = Field(default='', description=None)
    negative_prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='(worst quality, low quality, normal quality:2) JuggernautNegative-neg', description='Negative Prompt')
    num_inference_steps: int | GraphNode | tuple[GraphNode, str] = Field(default=18, description='Number of denoising steps')
    downscaling_resolution: int | GraphNode | tuple[GraphNode, str] = Field(default=768, description='Downscaling resolution')
    @classmethod
    def get_node_type(cls): return "replicate.image.upscale.ClarityUpscaler"


from nodetool.nodes.replicate.image.upscale import Scheduler
from nodetool.nodes.replicate.image.upscale import Resolution

class HighResolutionControlNetTile(GraphNode):
    hdr: float | GraphNode | tuple[GraphNode, str] = Field(default=0, description='HDR improvement over the original image')
    seed: int | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Seed')
    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None), description='Control image for scribble controlnet')
    steps: int | GraphNode | tuple[GraphNode, str] = Field(default=20, description='Steps')
    prompt: str | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Prompt for the model')
    scheduler: Scheduler | GraphNode | tuple[GraphNode, str] = Field(default='DDIM', description='Choose a scheduler.')
    creativity: float | GraphNode | tuple[GraphNode, str] = Field(default=0.5, description='Denoising strength. 1 means total destruction of the original image')
    guess_mode: bool | GraphNode | tuple[GraphNode, str] = Field(default=False, description='In this mode, the ControlNet encoder will try best to recognize the content of the input image even if you remove all prompts. The `guidance_scale` between 3.0 and 5.0 is recommended.')
    resolution: Resolution | GraphNode | tuple[GraphNode, str] = Field(default=2048, description='Image resolution')
    resemblance: float | GraphNode | tuple[GraphNode, str] = Field(default=0.5, description='Conditioning scale for controlnet')
    guidance_scale: float | GraphNode | tuple[GraphNode, str] = Field(default=7, description='Scale for classifier-free guidance')
    negative_prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='teeth, tooth, open mouth, longbody, lowres, bad anatomy, bad hands, missing fingers, extra digit, fewer digits, cropped, worst quality, low quality, mutant', description='Negative prompt')
    @classmethod
    def get_node_type(cls): return "replicate.image.upscale.HighResolutionControlNetTile"


from nodetool.nodes.replicate.image.upscale import Scheduler
from nodetool.nodes.replicate.image.upscale import Resolution

class MagicImageRefiner(GraphNode):
    hdr: float | GraphNode | tuple[GraphNode, str] = Field(default=0, description='HDR improvement over the original image')
    mask: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None), description='When provided, refines some section of the image. Must be the same size as the image')
    seed: int | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Seed')
    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None), description='Image to refine')
    steps: int | GraphNode | tuple[GraphNode, str] = Field(default=20, description='Steps')
    prompt: str | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Prompt for the model')
    scheduler: Scheduler | GraphNode | tuple[GraphNode, str] = Field(default='DDIM', description='Choose a scheduler.')
    creativity: float | GraphNode | tuple[GraphNode, str] = Field(default=0.25, description='Denoising strength. 1 means total destruction of the original image')
    guess_mode: bool | GraphNode | tuple[GraphNode, str] = Field(default=False, description='In this mode, the ControlNet encoder will try best to recognize the content of the input image even if you remove all prompts. The `guidance_scale` between 3.0 and 5.0 is recommended.')
    resolution: Resolution | GraphNode | tuple[GraphNode, str] = Field(default='original', description='Image resolution')
    resemblance: float | GraphNode | tuple[GraphNode, str] = Field(default=0.75, description='Conditioning scale for controlnet')
    guidance_scale: float | GraphNode | tuple[GraphNode, str] = Field(default=7, description='Scale for classifier-free guidance')
    negative_prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='teeth, tooth, open mouth, longbody, lowres, bad anatomy, bad hands, missing fingers, extra digit, fewer digits, cropped, worst quality, low quality, mutant', description='Negative prompt')
    @classmethod
    def get_node_type(cls): return "replicate.image.upscale.MagicImageRefiner"



class RealEsrGan(GraphNode):
    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None), description='Input image')
    scale: float | GraphNode | tuple[GraphNode, str] = Field(default=4, description='Factor to scale image by')
    face_enhance: bool | GraphNode | tuple[GraphNode, str] = Field(default=True, description='Face enhance')
    @classmethod
    def get_node_type(cls): return "replicate.image.upscale.RealEsrGan"


from nodetool.nodes.replicate.image.upscale import Task

class Swin2SR(GraphNode):
    task: Task | GraphNode | tuple[GraphNode, str] = Field(default='real_sr', description='Choose a task')
    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None), description='Input image')
    @classmethod
    def get_node_type(cls): return "replicate.image.upscale.Swin2SR"


from nodetool.nodes.replicate.image.upscale import Noise
from nodetool.nodes.replicate.image.upscale import Task_type

class SwinIR(GraphNode):
    jpeg: int | GraphNode | tuple[GraphNode, str] = Field(default=40, description='scale factor, activated for JPEG Compression Artifact Reduction. Leave it as default or arbitrary if other tasks are selected')
    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None), description='input image')
    noise: Noise | GraphNode | tuple[GraphNode, str] = Field(default=15, description='noise level, activated for Grayscale Image Denoising and Color Image Denoising. Leave it as default or arbitrary if other tasks are selected')
    task_type: Task_type | GraphNode | tuple[GraphNode, str] = Field(default='Real-World Image Super-Resolution-Large', description='Choose a task')
    @classmethod
    def get_node_type(cls): return "replicate.image.upscale.SwinIR"


from nodetool.nodes.replicate.image.upscale import Upscaler
from nodetool.nodes.replicate.image.upscale import Mode_type
from nodetool.nodes.replicate.image.upscale import Scheduler
from nodetool.nodes.replicate.image.upscale import Sampler_name
from nodetool.nodes.replicate.image.upscale import Seam_fix_mode

class UltimateSDUpscale(GraphNode):
    cfg: float | GraphNode | tuple[GraphNode, str] = Field(default=8, description='CFG')
    seed: int | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Sampling seed, leave Empty for Random')
    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None), description='Input image')
    steps: int | GraphNode | tuple[GraphNode, str] = Field(default=20, description='Steps')
    denoise: float | GraphNode | tuple[GraphNode, str] = Field(default=0.2, description='Denoise')
    upscaler: Upscaler | GraphNode | tuple[GraphNode, str] = Field(default='4x-UltraSharp', description='Upscaler')
    mask_blur: int | GraphNode | tuple[GraphNode, str] = Field(default=8, description='Mask Blur')
    mode_type: Mode_type | GraphNode | tuple[GraphNode, str] = Field(default='Linear', description='Mode Type')
    scheduler: Scheduler | GraphNode | tuple[GraphNode, str] = Field(default='normal', description='Scheduler')
    tile_width: int | GraphNode | tuple[GraphNode, str] = Field(default=512, description='Tile Width')
    upscale_by: float | GraphNode | tuple[GraphNode, str] = Field(default=2, description='Upscale By')
    tile_height: int | GraphNode | tuple[GraphNode, str] = Field(default=512, description='Tile Height')
    sampler_name: Sampler_name | GraphNode | tuple[GraphNode, str] = Field(default='euler', description='Sampler')
    tile_padding: int | GraphNode | tuple[GraphNode, str] = Field(default=32, description='Tile Padding')
    seam_fix_mode: Seam_fix_mode | GraphNode | tuple[GraphNode, str] = Field(default='None', description='Seam Fix Mode')
    seam_fix_width: int | GraphNode | tuple[GraphNode, str] = Field(default=64, description='Seam Fix Width')
    negative_prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='Negative Prompt')
    positive_prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='Hey! Have a nice day :D', description='Positive Prompt')
    seam_fix_denoise: float | GraphNode | tuple[GraphNode, str] = Field(default=1, description='Seam Fix Denoise')
    seam_fix_padding: int | GraphNode | tuple[GraphNode, str] = Field(default=16, description='Seam Fix Padding')
    seam_fix_mask_blur: int | GraphNode | tuple[GraphNode, str] = Field(default=8, description='Seam Fix Mask Blur')
    controlnet_strength: float | GraphNode | tuple[GraphNode, str] = Field(default=1, description='ControlNet Strength')
    force_uniform_tiles: bool | GraphNode | tuple[GraphNode, str] = Field(default=True, description='Force Uniform Tiles')
    use_controlnet_tile: bool | GraphNode | tuple[GraphNode, str] = Field(default=True, description='Use ControlNet Tile')
    @classmethod
    def get_node_type(cls): return "replicate.image.upscale.UltimateSDUpscale"


from nodetool.nodes.replicate.image.upscale import Scale

class ruDallE_SR(GraphNode):
    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None), description='Input image')
    scale: Scale | GraphNode | tuple[GraphNode, str] = Field(default=4, description='Choose up-scaling factor')
    @classmethod
    def get_node_type(cls): return "replicate.image.upscale.ruDallE_SR"


