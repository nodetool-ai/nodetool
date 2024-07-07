from pydantic import BaseModel, Field
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode


class BlendImages(GraphNode):
    image1: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, temp_id=None), description='The first image to blend.')
    image2: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, temp_id=None), description='The second image to blend.')
    alpha: float | GraphNode | tuple[GraphNode, str] = Field(default=0.5, description='The mix ratio.')
    @classmethod
    def get_node_type(cls): return "nodetool.image.BlendImages"



class CompositeImages(GraphNode):
    image1: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, temp_id=None), description='The first image to composite.')
    image2: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, temp_id=None), description='The second image to composite.')
    mask: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, temp_id=None), description='The mask to composite with.')
    @classmethod
    def get_node_type(cls): return "nodetool.image.CompositeImages"



class ConvertImageToTensor(GraphNode):
    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, temp_id=None), description='The input image to convert to a tensor. The image should have either 1 (grayscale), 3 (RGB), or 4 (RGBA) channels.')
    @classmethod
    def get_node_type(cls): return "nodetool.image.ConvertImageToTensor"



class ConvertTensorToImage(GraphNode):
    tensor: Tensor | GraphNode | tuple[GraphNode, str] = Field(default=Tensor(type='tensor', value=[], dtype=None), description='The input tensor to convert to an image. Should have either 1, 3, or 4 channels.')
    @classmethod
    def get_node_type(cls): return "nodetool.image.ConvertTensorToImage"



class GetImageMetadata(GraphNode):
    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, temp_id=None), description='The input image.')
    @classmethod
    def get_node_type(cls): return "nodetool.image.GetImageMetadata"



class PasteImage(GraphNode):
    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, temp_id=None), description='The image to paste into.')
    paste: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, temp_id=None), description='The image to paste.')
    left: int | GraphNode | tuple[GraphNode, str] = Field(default=0, description='The left coordinate.')
    top: int | GraphNode | tuple[GraphNode, str] = Field(default=0, description='The top coordinate.')
    @classmethod
    def get_node_type(cls): return "nodetool.image.PasteImage"



class SaveImage(GraphNode):
    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, temp_id=None), description='The image to save.')
    folder: FolderRef | GraphNode | tuple[GraphNode, str] = Field(default=FolderRef(type='folder', uri='', asset_id=None, temp_id=None), description='The folder to save the image in.')
    name: str | GraphNode | tuple[GraphNode, str] = Field(default='%Y-%m-%d_%H-%M-%S.png', description=None)
    @classmethod
    def get_node_type(cls): return "nodetool.image.SaveImage"


