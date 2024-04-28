from pydantic import BaseModel, Field
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode

from nodetool.nodes.huggingface.text.summarize import ModelId

class Summarize(GraphNode):
    model: ModelId | GraphNode | tuple[GraphNode, str] = Field(default=ModelId('Falconsai/text_summarization'), description='The model ID to use for the summarization')
    inputs: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The input text to the model')
    @classmethod
    def get_node_type(cls): return "huggingface.text.summarize.Summarize"


