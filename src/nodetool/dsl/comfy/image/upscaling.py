from pydantic import BaseModel, Field
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode

from nodetool.nodes.comfy.image.upscaling import UpscaleMethod
from nodetool.nodes.comfy.image.upscaling import CropMethod

class ImageScale(GraphNode):
    image: ImageTensor | GraphNode | tuple[GraphNode, str] = Field(default=ImageTensor(type='comfy.image_tensor'), description='The image to scale.')
    upscale_method: UpscaleMethod | GraphNode | tuple[GraphNode, str] = Field(default=UpscaleMethod('nearest_exact'), description='The method to use for upscaling the image.')
    width: int | GraphNode | tuple[GraphNode, str] = Field(default=512, description='The target width for scaling.')
    height: int | GraphNode | tuple[GraphNode, str] = Field(default=512, description='The target height for scaling.')
    crop: CropMethod | GraphNode | tuple[GraphNode, str] = Field(default=CropMethod('disabled'), description='The method to use if cropping is required.')
    @classmethod
    def get_node_type(cls): return "comfy.image.upscaling.ImageScale"


from nodetool.nodes.comfy.image.upscaling import UpscaleMethod

class ImageScaleBy(GraphNode):
    image: ImageTensor | GraphNode | tuple[GraphNode, str] = Field(default=ImageTensor(type='comfy.image_tensor'), description='The image to scale.')
    upscale_method: UpscaleMethod | GraphNode | tuple[GraphNode, str] = Field(default=UpscaleMethod('nearest_exact'), description='The method to use for upscaling the image.')
    scale_by: float | GraphNode | tuple[GraphNode, str] = Field(default=1.0, description='The scaling factor by which to scale the image.')
    @classmethod
    def get_node_type(cls): return "comfy.image.upscaling.ImageScaleBy"



class ImageUpscaleWithModel(GraphNode):
    upscale_model: UpscaleModel | GraphNode | tuple[GraphNode, str] = Field(default='', description='The model to use for upscaling the image.')
    image: ImageTensor | GraphNode | tuple[GraphNode, str] = Field(default=ImageTensor(type='comfy.image_tensor'), description='The image to upscale.')
    @classmethod
    def get_node_type(cls): return "comfy.image.upscaling.ImageUpscaleWithModel"


