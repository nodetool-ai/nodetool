from pydantic import BaseModel, Field
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode

from nodetool.nodes.huggingface.text.generate import ModelId

class TextGeneration(GraphNode):
    model: ModelId | GraphNode | tuple[GraphNode, str] = Field(default=ModelId('microsoft/phi-2'), description='The model ID to use for the classification')
    inputs: str | GraphNode | tuple[GraphNode, str] = Field(default=PydanticUndefined, description='The input text to the model')
    @classmethod
    def get_node_type(cls): return "huggingface.text.generate.TextGeneration"


