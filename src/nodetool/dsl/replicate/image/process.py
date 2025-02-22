from pydantic import BaseModel, Field
import typing
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode

import nodetool.nodes.replicate.image.process

class DD_Color(GraphNode):
    """Towards Photo-Realistic Image Colorization via Dual Decoders"""

    Model_size: typing.ClassVar[type] = nodetool.nodes.replicate.image.process.DD_Color.Model_size
    image: str | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Grayscale input image.')
    model_size: nodetool.nodes.replicate.image.process.DD_Color.Model_size = Field(default=Model_size.LARGE, description='Choose the model size.')

    @classmethod
    def get_node_type(cls): return "replicate.image.process.DD_Color"


import nodetool.nodes.replicate.image.process

class Magic_Style_Transfer(GraphNode):
    """Restyle an image with the style of another one. I strongly suggest to upscale the results with Clarity AI"""

    Scheduler: typing.ClassVar[type] = nodetool.nodes.replicate.image.process.Magic_Style_Transfer.Scheduler
    seed: int | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Random seed. Leave blank to randomize the seed')
    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='Input image')
    prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='An astronaut riding a rainbow unicorn', description='Input prompt')
    ip_image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='Input image for img2img or inpaint mode')
    ip_scale: float | GraphNode | tuple[GraphNode, str] = Field(default=0.3, description='IP Adapter strength.')
    strength: float | GraphNode | tuple[GraphNode, str] = Field(default=0.9, description='When img2img is active, the denoising strength. 1 means total destruction of the input image.')
    scheduler: nodetool.nodes.replicate.image.process.Magic_Style_Transfer.Scheduler = Field(default=Scheduler.K_EULER, description='scheduler')
    lora_scale: float | GraphNode | tuple[GraphNode, str] = Field(default=0.9, description='LoRA additive scale. Only applicable on trained models.')
    num_outputs: int | GraphNode | tuple[GraphNode, str] = Field(default=1, description='Number of images to output')
    lora_weights: str | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Replicate LoRA weights to use. Leave blank to use the default weights.')
    guidance_scale: float | GraphNode | tuple[GraphNode, str] = Field(default=4, description='Scale for classifier-free guidance')
    resizing_scale: float | GraphNode | tuple[GraphNode, str] = Field(default=1, description='If you want the image to have a solid margin. Scale of the solid margin. 1.0 means no resizing.')
    apply_watermark: bool | GraphNode | tuple[GraphNode, str] = Field(default=True, description='Applies a watermark to enable determining if an image is generated in downstream applications. If you have other provisions for generating or deploying images safely, you can use this to disable watermarking.')
    negative_prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='Input Negative Prompt')
    background_color: str | GraphNode | tuple[GraphNode, str] = Field(default='#A2A2A2', description='When passing an image with alpha channel, it will be replaced with this color')
    num_inference_steps: int | GraphNode | tuple[GraphNode, str] = Field(default=30, description='Number of denoising steps')
    condition_canny_scale: float | GraphNode | tuple[GraphNode, str] = Field(default=0.15, description='The bigger this number is, the more ControlNet interferes')
    condition_depth_scale: float | GraphNode | tuple[GraphNode, str] = Field(default=0.35, description='The bigger this number is, the more ControlNet interferes')

    @classmethod
    def get_node_type(cls): return "replicate.image.process.Magic_Style_Transfer"



class ModNet(GraphNode):
    """A deep learning approach to remove background & adding new background image"""

    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='input image')

    @classmethod
    def get_node_type(cls): return "replicate.image.process.ModNet"



class ObjectRemover(GraphNode):
    """None"""

    org_image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='Original input image')
    mask_image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='Mask image')

    @classmethod
    def get_node_type(cls): return "replicate.image.process.ObjectRemover"



class RemoveBackground(GraphNode):
    """Remove images background"""

    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='Input image')

    @classmethod
    def get_node_type(cls): return "replicate.image.process.RemoveBackground"


