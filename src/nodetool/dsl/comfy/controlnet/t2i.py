from pydantic import BaseModel, Field
import typing
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode


class ColorPreprocessor(GraphNode):
    """
    Color preprocessor.
    """

    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='The image to preprocess.')
    resolution: int | GraphNode | tuple[GraphNode, str] = Field(default=512, description='The width of the image to generate.')

    @classmethod
    def get_node_type(cls): return "comfy.controlnet.t2i.ColorPreprocessor"



class ShufflePreprocessor(GraphNode):
    """
    Shuffle preprocessor.
    """

    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='The image to preprocess.')
    resolution: int | GraphNode | tuple[GraphNode, str] = Field(default=512, description='The width of the image to generate.')

    @classmethod
    def get_node_type(cls): return "comfy.controlnet.t2i.ShufflePreprocessor"


