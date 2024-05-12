from pydantic import BaseModel, Field
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode

from nodetool.nodes.anthropic.text import Model

class Claude(GraphNode):
    model: Model | GraphNode | tuple[GraphNode, str] = Field(default=Model('claude-3-opus-20240229'), description=None)
    system: str | GraphNode | tuple[GraphNode, str] = Field(default='You are a friendly assistant.', description=None)
    prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='', description=None)
    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None), description=None)
    max_tokens: int | GraphNode | tuple[GraphNode, str] = Field(default=100, description=None)
    temperature: float | GraphNode | tuple[GraphNode, str] = Field(default=1.0, description=None)
    top_k: int | GraphNode | tuple[GraphNode, str] = Field(default=40, description=None)
    top_p: float | GraphNode | tuple[GraphNode, str] = Field(default=1.0, description=None)
    @classmethod
    def get_node_type(cls): return "anthropic.text.Claude"


