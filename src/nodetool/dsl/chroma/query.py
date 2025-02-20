from pydantic import BaseModel, Field
import typing
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode


class HybridSearch(GraphNode):
    """
    Hybrid search combining semantic and keyword-based search for better retrieval.
    Uses reciprocal rank fusion to combine results from both methods.
    """

    collection: Collection | GraphNode | tuple[GraphNode, str] = Field(default=Collection(type='collection', name=''), description='The collection to query')
    text: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The text to query')
    n_results: int | GraphNode | tuple[GraphNode, str] = Field(default=5, description='The number of final results to return')
    k_constant: float | GraphNode | tuple[GraphNode, str] = Field(default=60.0, description='Constant for reciprocal rank fusion (default: 60.0)')
    min_keyword_length: int | GraphNode | tuple[GraphNode, str] = Field(default=3, description='Minimum length for keyword tokens')

    @classmethod
    def get_node_type(cls): return "chroma.query.HybridSearch"



class QueryImage(GraphNode):
    """
    Query the index for similar images.
    """

    collection: Collection | GraphNode | tuple[GraphNode, str] = Field(default=Collection(type='collection', name=''), description='The collection to query')
    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='The image to query')
    n_results: int | GraphNode | tuple[GraphNode, str] = Field(default=1, description='The number of results to return')

    @classmethod
    def get_node_type(cls): return "chroma.query.QueryImage"



class QueryText(GraphNode):
    """
    Query the index for similar text.
    """

    collection: Collection | GraphNode | tuple[GraphNode, str] = Field(default=Collection(type='collection', name=''), description='The collection to query')
    text: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The text to query')
    n_results: int | GraphNode | tuple[GraphNode, str] = Field(default=1, description='The number of results to return')

    @classmethod
    def get_node_type(cls): return "chroma.query.QueryText"



class RemoveOverlap(GraphNode):
    """
    Removes overlapping words between consecutive strings in a list.
    Splits text into words and matches word sequences for more accurate overlap detection.
    """

    documents: list[str] | GraphNode | tuple[GraphNode, str] = Field(default=[], description='List of strings to process for overlap removal')
    min_overlap_words: int | GraphNode | tuple[GraphNode, str] = Field(default=2, description='Minimum number of words that must overlap to be considered')

    @classmethod
    def get_node_type(cls): return "chroma.query.RemoveOverlap"


