from pydantic import BaseModel, Field
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode

from nodetool.nodes.nodetool.text.rerank import Model

class Rerank(GraphNode):
    model: Model | GraphNode | tuple[GraphNode, str] = Field(default=Model('mixedbread-ai/mxbai-rerank-large-v1'), description='The reranking model to use')
    query: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The question to rerank')
    documents: list[str] | GraphNode | tuple[GraphNode, str] = Field(default=[], description='The answers to be ranked by the model.')
    top_k: int | GraphNode | tuple[GraphNode, str] = Field(default=PydanticUndefined, description=None)
    @classmethod
    def get_node_type(cls): return "nodetool.text.rerank.Rerank"


