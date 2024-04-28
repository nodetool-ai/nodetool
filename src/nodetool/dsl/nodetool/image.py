from pydantic import BaseModel, Field
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode


class Blend(GraphNode):
    image1: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None), description='The first image to blend.')
    image2: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None), description='The second image to blend.')
    alpha: float | GraphNode | tuple[GraphNode, str] = Field(default=0.5, description='The mix ratio.')
    @classmethod
    def get_node_type(cls): return "nodetool.image.Blend"



class Composite(GraphNode):
    image1: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None), description='The first image to composite.')
    image2: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None), description='The second image to composite.')
    mask: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None), description='The mask to composite with.')
    @classmethod
    def get_node_type(cls): return "nodetool.image.Composite"



class ImageToTensor(GraphNode):
    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=PydanticUndefined, description='The input image to convert to a tensor. The image should have either 1 (grayscale), 3 (RGB), or 4 (RGBA) channels.')
    @classmethod
    def get_node_type(cls): return "nodetool.image.ImageToTensor"



class Paste(GraphNode):
    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None), description='The image to paste into.')
    paste: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None), description='The image to paste.')
    left: int | GraphNode | tuple[GraphNode, str] = Field(default=0, description='The left coordinate.')
    top: int | GraphNode | tuple[GraphNode, str] = Field(default=0, description='The top coordinate.')
    @classmethod
    def get_node_type(cls): return "nodetool.image.Paste"



class TensorToImage(GraphNode):
    tensor: Tensor | GraphNode | tuple[GraphNode, str] = Field(default=PydanticUndefined, description='The input tensor to convert to an image. Should have either 1, 3, or 4 channels.')
    @classmethod
    def get_node_type(cls): return "nodetool.image.TensorToImage"


