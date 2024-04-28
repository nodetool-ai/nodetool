from pydantic import BaseModel, Field
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode


class ModNet(GraphNode):
    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None), description='input image')
    @classmethod
    def get_node_type(cls): return "replicate.image.process.ModNet"



class RemoveBackground(GraphNode):
    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None), description='Input image')
    @classmethod
    def get_node_type(cls): return "replicate.image.process.RemoveBackground"


