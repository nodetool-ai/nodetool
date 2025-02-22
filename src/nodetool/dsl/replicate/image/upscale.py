from pydantic import BaseModel, Field
import typing
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode

import nodetool.nodes.replicate.image.upscale
import nodetool.nodes.replicate.image.upscale
import nodetool.nodes.replicate.image.upscale
import nodetool.nodes.replicate.image.upscale
import nodetool.nodes.replicate.image.upscale
import nodetool.nodes.replicate.image.upscale

class ClarityUpscaler(GraphNode):
    """High resolution image Upscaler and Enhancer. Use at ClarityAI.co. A free Magnific alternative. Twitter/X: @philz1337x"""

    Handfix: typing.ClassVar[type] = nodetool.nodes.replicate.image.upscale.ClarityUpscaler.Handfix
    Sd_model: typing.ClassVar[type] = nodetool.nodes.replicate.image.upscale.ClarityUpscaler.Sd_model
    Scheduler: typing.ClassVar[type] = nodetool.nodes.replicate.image.upscale.ClarityUpscaler.Scheduler
    Tiling_width: typing.ClassVar[type] = nodetool.nodes.replicate.image.upscale.ClarityUpscaler.Tiling_width
    Output_format: typing.ClassVar[type] = nodetool.nodes.replicate.image.upscale.ClarityUpscaler.Output_format
    Tiling_height: typing.ClassVar[type] = nodetool.nodes.replicate.image.upscale.ClarityUpscaler.Tiling_height
    mask: str | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Mask image to mark areas that should be preserved during upscaling')
    seed: int | GraphNode | tuple[GraphNode, str] = Field(default=1337, description='Random seed. Leave blank to randomize the seed')
    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='input image')
    prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='masterpiece, best quality, highres, <lora:more_details:0.5> <lora:SDXLrender_v2.0:1>', description='Prompt')
    dynamic: float | GraphNode | tuple[GraphNode, str] = Field(default=6, description='HDR, try from 3 - 9')
    handfix: nodetool.nodes.replicate.image.upscale.ClarityUpscaler.Handfix = Field(default=Handfix.DISABLED, description='Use clarity to fix hands in the image')
    pattern: bool | GraphNode | tuple[GraphNode, str] = Field(default=False, description='Upscale a pattern with seamless tiling')
    sharpen: float | GraphNode | tuple[GraphNode, str] = Field(default=0, description='Sharpen the image after upscaling. The higher the value, the more sharpening is applied. 0 for no sharpening')
    sd_model: nodetool.nodes.replicate.image.upscale.ClarityUpscaler.Sd_model = Field(default=Sd_model.JUGGERNAUT_REBORN_SAFETENSORS__338B85BC4F, description='Stable Diffusion model checkpoint')
    scheduler: nodetool.nodes.replicate.image.upscale.ClarityUpscaler.Scheduler = Field(default=Scheduler.DPM___3M_SDE_KARRAS, description='scheduler')
    creativity: float | GraphNode | tuple[GraphNode, str] = Field(default=0.35, description='Creativity, try from 0.3 - 0.9')
    lora_links: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='Link to a lora file you want to use in your upscaling. Multiple links possible, seperated by comma')
    downscaling: bool | GraphNode | tuple[GraphNode, str] = Field(default=False, description='Downscale the image before upscaling. Can improve quality and speed for images with high resolution but lower quality')
    resemblance: float | GraphNode | tuple[GraphNode, str] = Field(default=0.6, description='Resemblance, try from 0.3 - 1.6')
    scale_factor: float | GraphNode | tuple[GraphNode, str] = Field(default=2, description='Scale factor')
    tiling_width: nodetool.nodes.replicate.image.upscale.ClarityUpscaler.Tiling_width = Field(default=Tiling_width._112, description='Fractality, set lower tile width for a high Fractality')
    output_format: nodetool.nodes.replicate.image.upscale.ClarityUpscaler.Output_format = Field(default=Output_format.PNG, description='Format of the output images')
    tiling_height: nodetool.nodes.replicate.image.upscale.ClarityUpscaler.Tiling_height = Field(default=Tiling_height._144, description='Fractality, set lower tile height for a high Fractality')
    custom_sd_model: str | GraphNode | tuple[GraphNode, str] = Field(default='', description=None)
    negative_prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='(worst quality, low quality, normal quality:2) JuggernautNegative-neg', description='Negative Prompt')
    num_inference_steps: int | GraphNode | tuple[GraphNode, str] = Field(default=18, description='Number of denoising steps')
    downscaling_resolution: int | GraphNode | tuple[GraphNode, str] = Field(default=768, description='Downscaling resolution')

    @classmethod
    def get_node_type(cls): return "replicate.image.upscale.ClarityUpscaler"


import nodetool.nodes.replicate.image.upscale

class GFPGAN(GraphNode):
    """Practical face restoration algorithm for *old photos* or *AI-generated faces*"""

    Version: typing.ClassVar[type] = nodetool.nodes.replicate.image.upscale.GFPGAN.Version
    img: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='Input')
    scale: float | GraphNode | tuple[GraphNode, str] = Field(default=2, description='Rescaling factor')
    version: nodetool.nodes.replicate.image.upscale.GFPGAN.Version = Field(default=Version.V1_4, description='GFPGAN version. v1.3: better quality. v1.4: more details and better identity.')

    @classmethod
    def get_node_type(cls): return "replicate.image.upscale.GFPGAN"


import nodetool.nodes.replicate.image.upscale
import nodetool.nodes.replicate.image.upscale
import nodetool.nodes.replicate.image.upscale

class HighResolutionControlNetTile(GraphNode):
    """UPDATE: new upscaling algorithm for a much improved image quality. Fermat.app open-source implementation of an efficient ControlNet 1.1 tile for high-quality upscales. Increase the creativity to encourage hallucination."""

    Format: typing.ClassVar[type] = nodetool.nodes.replicate.image.upscale.HighResolutionControlNetTile.Format
    Scheduler: typing.ClassVar[type] = nodetool.nodes.replicate.image.upscale.HighResolutionControlNetTile.Scheduler
    Resolution: typing.ClassVar[type] = nodetool.nodes.replicate.image.upscale.HighResolutionControlNetTile.Resolution
    hdr: float | GraphNode | tuple[GraphNode, str] = Field(default=0, description='HDR improvement over the original image')
    seed: int | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Seed')
    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='Control image for scribble controlnet')
    steps: int | GraphNode | tuple[GraphNode, str] = Field(default=8, description='Steps')
    format: nodetool.nodes.replicate.image.upscale.HighResolutionControlNetTile.Format = Field(default=Format.JPG, description='Format of the output.')
    prompt: str | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Prompt for the model')
    scheduler: nodetool.nodes.replicate.image.upscale.HighResolutionControlNetTile.Scheduler = Field(default=Scheduler.DDIM, description='Choose a scheduler.')
    creativity: float | GraphNode | tuple[GraphNode, str] = Field(default=0.35, description='Denoising strength. 1 means total destruction of the original image')
    guess_mode: bool | GraphNode | tuple[GraphNode, str] = Field(default=False, description='In this mode, the ControlNet encoder will try best to recognize the content of the input image even if you remove all prompts.')
    resolution: nodetool.nodes.replicate.image.upscale.HighResolutionControlNetTile.Resolution = Field(default=Resolution._2560, description='Image resolution')
    resemblance: float | GraphNode | tuple[GraphNode, str] = Field(default=0.85, description='Conditioning scale for controlnet')
    guidance_scale: float | GraphNode | tuple[GraphNode, str] = Field(default=0, description='Scale for classifier-free guidance, should be 0.')
    negative_prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='teeth, tooth, open mouth, longbody, lowres, bad anatomy, bad hands, missing fingers, extra digit, fewer digits, cropped, worst quality, low quality, mutant', description='Negative prompt')
    lora_details_strength: float | GraphNode | tuple[GraphNode, str] = Field(default=1, description="Strength of the image's details")
    lora_sharpness_strength: float | GraphNode | tuple[GraphNode, str] = Field(default=1.25, description="Strength of the image's sharpness. We don't recommend values above 2.")

    @classmethod
    def get_node_type(cls): return "replicate.image.upscale.HighResolutionControlNetTile"


import nodetool.nodes.replicate.image.upscale
import nodetool.nodes.replicate.image.upscale

class MagicImageRefiner(GraphNode):
    """A better alternative to SDXL refiners, providing a lot of quality and detail. Can also be used for inpainting or upscaling."""

    Scheduler: typing.ClassVar[type] = nodetool.nodes.replicate.image.upscale.MagicImageRefiner.Scheduler
    Resolution: typing.ClassVar[type] = nodetool.nodes.replicate.image.upscale.MagicImageRefiner.Resolution
    hdr: float | GraphNode | tuple[GraphNode, str] = Field(default=0, description='HDR improvement over the original image')
    mask: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='When provided, refines some section of the image. Must be the same size as the image')
    seed: int | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Seed')
    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='Image to refine')
    steps: int | GraphNode | tuple[GraphNode, str] = Field(default=20, description='Steps')
    prompt: str | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Prompt for the model')
    scheduler: nodetool.nodes.replicate.image.upscale.MagicImageRefiner.Scheduler = Field(default=Scheduler.DDIM, description='Choose a scheduler.')
    creativity: float | GraphNode | tuple[GraphNode, str] = Field(default=0.25, description='Denoising strength. 1 means total destruction of the original image')
    guess_mode: bool | GraphNode | tuple[GraphNode, str] = Field(default=False, description='In this mode, the ControlNet encoder will try best to recognize the content of the input image even if you remove all prompts. The `guidance_scale` between 3.0 and 5.0 is recommended.')
    resolution: nodetool.nodes.replicate.image.upscale.MagicImageRefiner.Resolution = Field(default=Resolution.ORIGINAL, description='Image resolution')
    resemblance: float | GraphNode | tuple[GraphNode, str] = Field(default=0.75, description='Conditioning scale for controlnet')
    guidance_scale: float | GraphNode | tuple[GraphNode, str] = Field(default=7, description='Scale for classifier-free guidance')
    negative_prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='teeth, tooth, open mouth, longbody, lowres, bad anatomy, bad hands, missing fingers, extra digit, fewer digits, cropped, worst quality, low quality, mutant', description='Negative prompt')

    @classmethod
    def get_node_type(cls): return "replicate.image.upscale.MagicImageRefiner"



class RealEsrGan(GraphNode):
    """Real-ESRGAN for image upscaling on an A100"""

    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='Input image')
    scale: float | GraphNode | tuple[GraphNode, str] = Field(default=4, description='Factor to scale image by')
    face_enhance: bool | GraphNode | tuple[GraphNode, str] = Field(default=False, description='Run GFPGAN face enhancement along with upscaling')

    @classmethod
    def get_node_type(cls): return "replicate.image.upscale.RealEsrGan"


import nodetool.nodes.replicate.image.upscale

class Swin2SR(GraphNode):
    """3 Million Runs! AI Photorealistic Image Super-Resolution and Restoration"""

    Task: typing.ClassVar[type] = nodetool.nodes.replicate.image.upscale.Swin2SR.Task
    task: nodetool.nodes.replicate.image.upscale.Swin2SR.Task = Field(default=Task.REAL_SR, description='Choose a task')
    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='Input image')

    @classmethod
    def get_node_type(cls): return "replicate.image.upscale.Swin2SR"


import nodetool.nodes.replicate.image.upscale
import nodetool.nodes.replicate.image.upscale

class SwinIR(GraphNode):
    """Image Restoration Using Swin Transformer"""

    Noise: typing.ClassVar[type] = nodetool.nodes.replicate.image.upscale.SwinIR.Noise
    Task_type: typing.ClassVar[type] = nodetool.nodes.replicate.image.upscale.SwinIR.Task_type
    jpeg: int | GraphNode | tuple[GraphNode, str] = Field(default=40, description='scale factor, activated for JPEG Compression Artifact Reduction. Leave it as default or arbitrary if other tasks are selected')
    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='input image')
    noise: nodetool.nodes.replicate.image.upscale.SwinIR.Noise = Field(default=Noise._15, description='noise level, activated for Grayscale Image Denoising and Color Image Denoising. Leave it as default or arbitrary if other tasks are selected')
    task_type: nodetool.nodes.replicate.image.upscale.SwinIR.Task_type = Field(default=Task_type.REAL_WORLD_IMAGE_SUPER_RESOLUTION_LARGE, description='Choose a task')

    @classmethod
    def get_node_type(cls): return "replicate.image.upscale.SwinIR"


import nodetool.nodes.replicate.image.upscale
import nodetool.nodes.replicate.image.upscale
import nodetool.nodes.replicate.image.upscale
import nodetool.nodes.replicate.image.upscale
import nodetool.nodes.replicate.image.upscale

class UltimateSDUpscale(GraphNode):
    """Ultimate SD Upscale with ControlNet Tile"""

    Upscaler: typing.ClassVar[type] = nodetool.nodes.replicate.image.upscale.UltimateSDUpscale.Upscaler
    Mode_type: typing.ClassVar[type] = nodetool.nodes.replicate.image.upscale.UltimateSDUpscale.Mode_type
    Scheduler: typing.ClassVar[type] = nodetool.nodes.replicate.image.upscale.UltimateSDUpscale.Scheduler
    Sampler_name: typing.ClassVar[type] = nodetool.nodes.replicate.image.upscale.UltimateSDUpscale.Sampler_name
    Seam_fix_mode: typing.ClassVar[type] = nodetool.nodes.replicate.image.upscale.UltimateSDUpscale.Seam_fix_mode
    cfg: float | GraphNode | tuple[GraphNode, str] = Field(default=8, description='CFG')
    seed: int | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Sampling seed, leave Empty for Random')
    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='Input image')
    steps: int | GraphNode | tuple[GraphNode, str] = Field(default=20, description='Steps')
    denoise: float | GraphNode | tuple[GraphNode, str] = Field(default=0.2, description='Denoise')
    upscaler: nodetool.nodes.replicate.image.upscale.UltimateSDUpscale.Upscaler = Field(default=Upscaler._4X_ULTRASHARP, description='Upscaler')
    mask_blur: int | GraphNode | tuple[GraphNode, str] = Field(default=8, description='Mask Blur')
    mode_type: nodetool.nodes.replicate.image.upscale.UltimateSDUpscale.Mode_type = Field(default=Mode_type.LINEAR, description='Mode Type')
    scheduler: nodetool.nodes.replicate.image.upscale.UltimateSDUpscale.Scheduler = Field(default=Scheduler.NORMAL, description='Scheduler')
    tile_width: int | GraphNode | tuple[GraphNode, str] = Field(default=512, description='Tile Width')
    upscale_by: float | GraphNode | tuple[GraphNode, str] = Field(default=2, description='Upscale By')
    tile_height: int | GraphNode | tuple[GraphNode, str] = Field(default=512, description='Tile Height')
    sampler_name: nodetool.nodes.replicate.image.upscale.UltimateSDUpscale.Sampler_name = Field(default=Sampler_name.EULER, description='Sampler')
    tile_padding: int | GraphNode | tuple[GraphNode, str] = Field(default=32, description='Tile Padding')
    seam_fix_mode: nodetool.nodes.replicate.image.upscale.UltimateSDUpscale.Seam_fix_mode = Field(default=Seam_fix_mode.NONE, description='Seam Fix Mode')
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


import nodetool.nodes.replicate.image.upscale

class ruDallE_SR(GraphNode):
    """Real-ESRGAN super-resolution model from ruDALL-E"""

    Scale: typing.ClassVar[type] = nodetool.nodes.replicate.image.upscale.ruDallE_SR.Scale
    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='Input image')
    scale: nodetool.nodes.replicate.image.upscale.ruDallE_SR.Scale = Field(default=Scale._4, description='Choose up-scaling factor')

    @classmethod
    def get_node_type(cls): return "replicate.image.upscale.ruDallE_SR"


