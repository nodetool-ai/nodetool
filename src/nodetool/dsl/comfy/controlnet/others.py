from pydantic import BaseModel, Field
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode


class PreprocessImage(GraphNode):
    image: ImageTensor | GraphNode | tuple[GraphNode, str] = Field(default=ImageTensor(type='comfy.image_tensor'), description='The image to preprocess.')
    resolution: int | GraphNode | tuple[GraphNode, str] = Field(default=512, description='The width of the image to generate.')
    @classmethod
    def get_node_type(cls): return "comfy.controlnet.PreprocessImage"



class SAMPreprocessor(GraphNode):
    image: ImageTensor | GraphNode | tuple[GraphNode, str] = Field(default=ImageTensor(type='comfy.image_tensor'), description='The image to preprocess.')
    resolution: int | GraphNode | tuple[GraphNode, str] = Field(default=512, description='The width of the image to generate.')
    @classmethod
    def get_node_type(cls): return "comfy.controlnet.others.SAMPreprocessor"



class TilePreprocessor(GraphNode):
    image: ImageTensor | GraphNode | tuple[GraphNode, str] = Field(default=ImageTensor(type='comfy.image_tensor'), description='The image to preprocess.')
    resolution: int | GraphNode | tuple[GraphNode, str] = Field(default=512, description='The width of the image to generate.')
    pyrUp_iters: int | GraphNode | tuple[GraphNode, str] = Field(default=3, description='The number of times to apply pyrUp.')
    @classmethod
    def get_node_type(cls): return "comfy.controlnet.others.TilePreprocessor"


