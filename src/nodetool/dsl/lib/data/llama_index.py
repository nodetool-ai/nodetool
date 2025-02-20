from pydantic import BaseModel, Field
import typing
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode


class HTMLSplitter(GraphNode):
    """
    Split HTML content into semantic chunks based on HTML tags.
    html, text, semantic, tags, parsing
    """

    document_id: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='Document ID to associate with the HTML content')
    text: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='HTML content to split')

    @classmethod
    def get_node_type(cls): return "lib.data.llama_index.HTMLSplitter"



class JSONSplitter(GraphNode):
    """
    Split JSON content into semantic chunks.
    json, parsing, semantic, structured
    """

    document_id: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='Document ID to associate with the JSON content')
    text: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='JSON content to split')
    include_metadata: bool | GraphNode | tuple[GraphNode, str] = Field(default=True, description='Whether to include metadata in nodes')
    include_prev_next_rel: bool | GraphNode | tuple[GraphNode, str] = Field(default=True, description='Whether to include prev/next relationships')

    @classmethod
    def get_node_type(cls): return "lib.data.llama_index.JSONSplitter"



class SemanticSplitter(GraphNode):
    """
    Split text semantically.
    chroma, embedding, collection, RAG, index, text, markdown, semantic
    """

    embed_model: LlamaModel | GraphNode | tuple[GraphNode, str] = Field(default=LlamaModel(type='llama_model', name='', repo_id='', modified_at='', size=0, digest='', details={}), description='Embedding model to use')
    document_id: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='Document ID to associate with the text content')
    text: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='Text content to split')
    buffer_size: int | GraphNode | tuple[GraphNode, str] = Field(default=1, description='Buffer size for semantic splitting')
    threshold: int | GraphNode | tuple[GraphNode, str] = Field(default=95, description='Breakpoint percentile threshold for semantic splitting')

    @classmethod
    def get_node_type(cls): return "lib.data.llama_index.SemanticSplitter"


