from pydantic import BaseModel, Field
import typing
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode


class Reranker(GraphNode):
    """
    Reranks pairs of text based on their semantic similarity.
    text, ranking, reranking, natural language processing

    Use cases:
    - Improve search results ranking
    - Question-answer pair scoring
    - Document relevance ranking
    """

    model: HFReranker | GraphNode | tuple[GraphNode, str] = Field(default=HFReranker(type='hf.reranker', repo_id='', path=None, allow_patterns=None, ignore_patterns=None), description='The model ID to use for reranking')
    query: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The query text to compare against candidates')
    candidates: List | GraphNode | tuple[GraphNode, str] = Field(default=[], description='List of candidate texts to rank')

    @classmethod
    def get_node_type(cls): return "huggingface.ranking.Reranker"


