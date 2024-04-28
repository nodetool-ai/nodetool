from pydantic import BaseModel, Field
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode

from nodetool.nodes.nodetool.image.classify import Model

class Classify(GraphNode):
    model: Model | GraphNode | tuple[GraphNode, str] = Field(default=Model('microsoft/resnet-18'), description='The classification model to use')
    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None), description='The image to classify')
    @classmethod
    def get_node_type(cls): return "nodetool.image.classify.Classify"


