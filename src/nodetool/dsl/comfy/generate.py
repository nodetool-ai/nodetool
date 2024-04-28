from pydantic import BaseModel, Field
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode


class EmptyImage(GraphNode):
    width: int | GraphNode | tuple[GraphNode, str] = Field(default=512, description='The width of the empty image.')
    height: int | GraphNode | tuple[GraphNode, str] = Field(default=512, description='The height of the empty image.')
    batch_size: int | GraphNode | tuple[GraphNode, str] = Field(default=1, description='The batch size for the empty images.')
    color: int | GraphNode | tuple[GraphNode, str] = Field(default=0, description='The default color for the image, represented as an integer.')
    @classmethod
    def get_node_type(cls): return "comfy.generate.EmptyImage"


