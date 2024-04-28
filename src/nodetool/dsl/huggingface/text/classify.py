from pydantic import BaseModel, Field
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode

from nodetool.nodes.huggingface.text.classify import ModelId

class Classifier(GraphNode):
    model: ModelId | GraphNode | tuple[GraphNode, str] = Field(default=ModelId('cardiffnlp/twitter-roberta-base-sentiment-latest'), description='The model ID to use for the classification')
    inputs: str | GraphNode | tuple[GraphNode, str] = Field(default=PydanticUndefined, description='The input text to classify')
    @classmethod
    def get_node_type(cls): return "huggingface.text.classify.Classifier"


