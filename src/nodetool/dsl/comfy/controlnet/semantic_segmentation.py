from pydantic import BaseModel, Field
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode


class AnimeFace_SemSegPreprocessor(GraphNode):
    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='The image to preprocess.')
    resolution: int | GraphNode | tuple[GraphNode, str] = Field(default=512, description='The width of the image to generate.')
    remove_background_using_abgr: bool | GraphNode | tuple[GraphNode, str] = Field(default=True, description='Whether to remove the background.')
    @classmethod
    def get_node_type(cls): return "comfy.controlnet.semantic_segmentation.AnimeFace_SemSegPreprocessor"



class OneFormerCOCOSemSegPreprocessor(GraphNode):
    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='The image to preprocess.')
    resolution: int | GraphNode | tuple[GraphNode, str] = Field(default=512, description='The width of the image to generate.')
    @classmethod
    def get_node_type(cls): return "comfy.controlnet.semantic_segmentation.OneFormerCOCOSemSegPreprocessor"



class OneFormer_ADE20K_SemSegPreprocessor(GraphNode):
    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='The image to preprocess.')
    resolution: int | GraphNode | tuple[GraphNode, str] = Field(default=512, description='The width of the image to generate.')
    @classmethod
    def get_node_type(cls): return "comfy.controlnet.semantic_segmentation.OneFormer_ADE20K_SemSegPreprocessor"



class SAMPreprocessor(GraphNode):
    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='The image to preprocess.')
    resolution: int | GraphNode | tuple[GraphNode, str] = Field(default=512, description='The width of the image to generate.')
    @classmethod
    def get_node_type(cls): return "comfy.controlnet.semantic_segmentation.SAMPreprocessor"



class UniformerSemSegPreprocessor(GraphNode):
    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='The image to preprocess.')
    resolution: int | GraphNode | tuple[GraphNode, str] = Field(default=512, description='The width of the image to generate.')
    @classmethod
    def get_node_type(cls): return "comfy.controlnet.semantic_segmentation.UniformerSemSegPreprocessor"


