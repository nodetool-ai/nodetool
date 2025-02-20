from pydantic import BaseModel, Field
import typing
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode


class Count(GraphNode):
    """
    Count the number of documents in a collection.
    chroma, embedding, collection, RAG
    """

    collection: Collection | GraphNode | tuple[GraphNode, str] = Field(default=Collection(type='collection', name=''), description='The collection to count')

    @classmethod
    def get_node_type(cls): return "chroma.collections.Count"



class GetDocuments(GraphNode):
    """
    Get documents from a chroma collection.
    chroma, embedding, collection, RAG, retrieve
    """

    collection: Collection | GraphNode | tuple[GraphNode, str] = Field(default=Collection(type='collection', name=''), description='The collection to get')
    ids: list[str] | GraphNode | tuple[GraphNode, str] = Field(default=[], description='The ids of the documents to get')
    limit: int | GraphNode | tuple[GraphNode, str] = Field(default=100, description='The limit of the documents to get')
    offset: int | GraphNode | tuple[GraphNode, str] = Field(default=0, description='The offset of the documents to get')

    @classmethod
    def get_node_type(cls): return "chroma.collections.GetDocuments"



class GetOrCreateCollection(GraphNode):
    """
    Get or create a collection.
    chroma, embedding, collection, RAG, get, create
    """

    name: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The name of the collection to create')
    embedding_model: LlamaModel | GraphNode | tuple[GraphNode, str] = Field(default=LlamaModel(type='llama_model', name='', repo_id='', modified_at='', size=0, digest='', details={}), description='The embedding model to use')

    @classmethod
    def get_node_type(cls): return "chroma.collections.GetOrCreateCollection"



class Peek(GraphNode):
    """
    Peek at the documents in a collection.
    chroma, embedding, collection, RAG, preview
    """

    collection: Collection | GraphNode | tuple[GraphNode, str] = Field(default=Collection(type='collection', name=''), description='The collection to peek')
    limit: int | GraphNode | tuple[GraphNode, str] = Field(default=100, description='The limit of the documents to peek')

    @classmethod
    def get_node_type(cls): return "chroma.collections.Peek"


