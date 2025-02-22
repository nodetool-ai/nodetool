from pydantic import BaseModel, Field
import typing
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode

import nodetool.nodes.comfy.image.upscaling
import nodetool.nodes.comfy.image.upscaling

class ImageScale(GraphNode):
    """
    Scale an image to a given size.
    """

    UpscaleMethod: typing.ClassVar[type] = nodetool.nodes.comfy.image.upscaling.ImageScale.UpscaleMethod
    CropMethod: typing.ClassVar[type] = nodetool.nodes.comfy.image.upscaling.ImageScale.CropMethod
    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='The image to scale.')
    upscale_method: nodetool.nodes.comfy.image.upscaling.ImageScale.UpscaleMethod = Field(default=UpscaleMethod.NEAREST_EXACT, description='The method to use for upscaling the image.')
    width: int | GraphNode | tuple[GraphNode, str] = Field(default=512, description='The target width for scaling.')
    height: int | GraphNode | tuple[GraphNode, str] = Field(default=512, description='The target height for scaling.')
    crop: nodetool.nodes.comfy.image.upscaling.ImageScale.CropMethod = Field(default=CropMethod.DISABLED, description='The method to use if cropping is required.')

    @classmethod
    def get_node_type(cls): return "comfy.image.upscaling.ImageScale"


import nodetool.nodes.comfy.image.upscaling

class ImageScaleBy(GraphNode):
    """
    Scale an image by a given factor.
    """

    UpscaleMethod: typing.ClassVar[type] = nodetool.nodes.comfy.image.upscaling.ImageScaleBy.UpscaleMethod
    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='The image to scale.')
    upscale_method: nodetool.nodes.comfy.image.upscaling.ImageScaleBy.UpscaleMethod = Field(default=UpscaleMethod.NEAREST_EXACT, description='The method to use for upscaling the image.')
    scale_by: float | GraphNode | tuple[GraphNode, str] = Field(default=1.0, description='The scaling factor by which to scale the image.')

    @classmethod
    def get_node_type(cls): return "comfy.image.upscaling.ImageScaleBy"



class ImageUpscaleWithModel(GraphNode):
    """
    Upscale an image using a given model.
    """

    upscale_model: UpscaleModel | GraphNode | tuple[GraphNode, str] = Field(default='', description='The model to use for upscaling the image.')
    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='The image to upscale.')

    @classmethod
    def get_node_type(cls): return "comfy.image.upscaling.ImageUpscaleWithModel"


