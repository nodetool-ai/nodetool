from pydantic import BaseModel, Field
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode


class AdaptiveContrast(GraphNode):
    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, temp_id=None), description='The image to adjust the contrast for.')
    clip_limit: float | GraphNode | tuple[GraphNode, str] = Field(default=2.0, description='Clip limit for adaptive contrast.')
    grid_size: int | GraphNode | tuple[GraphNode, str] = Field(default=8, description='Grid size for adaptive contrast.')
    @classmethod
    def get_node_type(cls): return "nodetool.image.enhance.AdaptiveContrast"



class AutoContrast(GraphNode):
    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, temp_id=None), description='The image to adjust the contrast for.')
    cutoff: int | GraphNode | tuple[GraphNode, str] = Field(default=0, description='Cutoff for autocontrast.')
    @classmethod
    def get_node_type(cls): return "nodetool.image.enhance.AutoContrast"



class Brightness(GraphNode):
    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, temp_id=None), description='The image to adjust the brightness for.')
    factor: float | int | GraphNode | tuple[GraphNode, str] = Field(default=1.0, description='Factor to adjust the brightness. 1.0 means no change.')
    @classmethod
    def get_node_type(cls): return "nodetool.image.enhance.Brightness"



class Color(GraphNode):
    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, temp_id=None), description='The image to adjust the brightness for.')
    factor: float | GraphNode | tuple[GraphNode, str] = Field(default=1.0, description='Factor to adjust the contrast. 1.0 means no change.')
    @classmethod
    def get_node_type(cls): return "nodetool.image.enhance.Color"



class Contrast(GraphNode):
    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, temp_id=None), description='The image to adjust the brightness for.')
    factor: float | GraphNode | tuple[GraphNode, str] = Field(default=1.0, description='Factor to adjust the contrast. 1.0 means no change.')
    @classmethod
    def get_node_type(cls): return "nodetool.image.enhance.Contrast"



class Detail(GraphNode):
    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, temp_id=None), description='The image to detail.')
    @classmethod
    def get_node_type(cls): return "nodetool.image.enhance.Detail"



class EdgeEnhance(GraphNode):
    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, temp_id=None), description='The image to edge enhance.')
    @classmethod
    def get_node_type(cls): return "nodetool.image.enhance.EdgeEnhance"



class Equalize(GraphNode):
    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, temp_id=None), description='The image to equalize.')
    @classmethod
    def get_node_type(cls): return "nodetool.image.enhance.Equalize"



class RankFilter(GraphNode):
    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, temp_id=None), description='The image to rank filter.')
    size: int | GraphNode | tuple[GraphNode, str] = Field(default=3, description='Rank filter size.')
    rank: int | GraphNode | tuple[GraphNode, str] = Field(default=3, description='Rank filter rank.')
    @classmethod
    def get_node_type(cls): return "nodetool.image.enhance.RankFilter"



class Sharpen(GraphNode):
    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, temp_id=None), description='The image to sharpen.')
    @classmethod
    def get_node_type(cls): return "nodetool.image.enhance.Sharpen"



class Sharpness(GraphNode):
    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, temp_id=None), description='The image to adjust the brightness for.')
    factor: float | GraphNode | tuple[GraphNode, str] = Field(default=1.0, description='Factor to adjust the contrast. 1.0 means no change.')
    @classmethod
    def get_node_type(cls): return "nodetool.image.enhance.Sharpness"



class UnsharpMask(GraphNode):
    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, temp_id=None), description='The image to unsharp mask.')
    radius: int | GraphNode | tuple[GraphNode, str] = Field(default=2, description='Unsharp mask radius.')
    percent: int | GraphNode | tuple[GraphNode, str] = Field(default=150, description='Unsharp mask percent.')
    threshold: int | GraphNode | tuple[GraphNode, str] = Field(default=3, description='Unsharp mask threshold.')
    @classmethod
    def get_node_type(cls): return "nodetool.image.enhance.UnsharpMask"


