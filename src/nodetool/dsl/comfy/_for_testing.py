from pydantic import BaseModel, Field
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode


class HyperTile(GraphNode):
    model: UNet | GraphNode | tuple[GraphNode, str] = Field(default=UNet(type='comfy.unet'), description='The model to use for generating hyper-tiles.')
    tile_size: int | GraphNode | tuple[GraphNode, str] = Field(default=256, description='The size of the tile to generate.')
    swap_size: int | GraphNode | tuple[GraphNode, str] = Field(default=2, description='The swap size used during generation.')
    max_depth: int | GraphNode | tuple[GraphNode, str] = Field(default=0, description='The maximum depth for tiling.')
    scale_depth: bool | GraphNode | tuple[GraphNode, str] = Field(default=False, description='Whether to scale the depth progressively.')
    @classmethod
    def get_node_type(cls): return "comfy._for_testing.HyperTile"


