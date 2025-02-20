from pydantic import BaseModel, Field
import typing
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode


class ImageIntensityDetector(GraphNode):
    """
    Detect the intensity of an image.
    """

    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='The image to preprocess.')
    resolution: int | GraphNode | tuple[GraphNode, str] = Field(default=512, description='The width of the image to generate.')
    gamma_correction: float | GraphNode | tuple[GraphNode, str] = Field(default=1.0, description='The gamma correction value.')

    @classmethod
    def get_node_type(cls): return "comfy.controlnet.others.ImageIntensityDetector"



class ImageLuminanceDetector(GraphNode):
    """
    Detect the luminance of an image.
    """

    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='The image to preprocess.')
    resolution: int | GraphNode | tuple[GraphNode, str] = Field(default=512, description='The width of the image to generate.')
    gamma_correction: float | GraphNode | tuple[GraphNode, str] = Field(default=1.0, description='The gamma correction value.')

    @classmethod
    def get_node_type(cls): return "comfy.controlnet.others.ImageLuminanceDetector"



class TilePreprocessor(GraphNode):
    """
    Tile preprocessor.
    """

    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='The image to preprocess.')
    resolution: int | GraphNode | tuple[GraphNode, str] = Field(default=512, description='The width of the image to generate.')
    pyrUp_iters: int | GraphNode | tuple[GraphNode, str] = Field(default=3, description='The number of times to apply pyrUp.')

    @classmethod
    def get_node_type(cls): return "comfy.controlnet.others.TilePreprocessor"


