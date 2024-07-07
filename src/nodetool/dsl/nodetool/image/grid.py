from pydantic import BaseModel, Field
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode


class CombineImageGrid(GraphNode):
    tiles: list[ImageRef] | GraphNode | tuple[GraphNode, str] = Field(default=[], description='List of image tiles to combine.')
    original_width: int | GraphNode | tuple[GraphNode, str] = Field(default=0, description='Width of the original image.')
    original_height: int | GraphNode | tuple[GraphNode, str] = Field(default=0, description='Height of the original image.')
    tile_width: int | GraphNode | tuple[GraphNode, str] = Field(default=512, description='Width of each tile.')
    tile_height: int | GraphNode | tuple[GraphNode, str] = Field(default=512, description='Height of each tile.')
    overlap: int | GraphNode | tuple[GraphNode, str] = Field(default=0, description='Overlap between tiles.')
    @classmethod
    def get_node_type(cls): return "nodetool.image.grid.CombineImageGrid"



class SliceImageGrid(GraphNode):
    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, temp_id=None), description='The image to slice into a grid.')
    tile_width: int | GraphNode | tuple[GraphNode, str] = Field(default=512, description='Width of each tile.')
    tile_height: int | GraphNode | tuple[GraphNode, str] = Field(default=512, description='Height of each tile.')
    overlap: int | GraphNode | tuple[GraphNode, str] = Field(default=0, description='Overlap between tiles.')
    @classmethod
    def get_node_type(cls): return "nodetool.image.grid.SliceImageGrid"


