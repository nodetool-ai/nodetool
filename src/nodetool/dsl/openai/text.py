from pydantic import BaseModel, Field
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode

from nodetool.nodes.openai.text import EmbeddingModel

class Embedding(GraphNode):
    input: str | nodetool.metadata.types.TextRef | GraphNode | tuple[GraphNode, str] = Field(default='', description=None)
    model: EmbeddingModel | GraphNode | tuple[GraphNode, str] = Field(default=EmbeddingModel('text-embedding-3-small'), description=None)
    chunk_size: int | GraphNode | tuple[GraphNode, str] = Field(default=4096, description=None)
    @classmethod
    def get_node_type(cls): return "openai.text.Embedding"


from nodetool.metadata.types import GPTModel
from nodetool.nodes.openai.text import ResponseFormat

class GPT(GraphNode):
    model: GPTModel | GraphNode | tuple[GraphNode, str] = Field(default=GPTModel('gpt-3.5-turbo-0125'), description=None)
    system: str | GraphNode | tuple[GraphNode, str] = Field(default='You are a friendly assistant.', description=None)
    prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='', description=None)
    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None), description=None)
    presence_penalty: float | GraphNode | tuple[GraphNode, str] = Field(default=0.0, description=None)
    frequency_penalty: float | GraphNode | tuple[GraphNode, str] = Field(default=0.0, description=None)
    temperature: float | GraphNode | tuple[GraphNode, str] = Field(default=1.0, description=None)
    max_tokens: int | GraphNode | tuple[GraphNode, str] = Field(default=100, description=None)
    top_p: float | GraphNode | tuple[GraphNode, str] = Field(default=1.0, description=None)
    response_format: ResponseFormat | GraphNode | tuple[GraphNode, str] = Field(default=ResponseFormat('text'), description=None)
    @classmethod
    def get_node_type(cls): return "openai.text.GPT"


