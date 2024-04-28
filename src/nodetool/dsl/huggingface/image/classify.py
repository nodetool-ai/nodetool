from pydantic import BaseModel, Field
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode

from nodetool.nodes.huggingface.image.classify import ModelId

class Classifier(GraphNode):
    model: ModelId | GraphNode | tuple[GraphNode, str] = Field(default=ModelId('google/vit-base-patch16-224'), description='The model ID to use for the classification')
    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None), description='The input image to classify')
    @classmethod
    def get_node_type(cls): return "huggingface.image.classify.Classifier"


