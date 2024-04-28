from pydantic import BaseModel, Field
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode


class ChromaNode(GraphNode):
    @classmethod
    def get_node_type(cls): return "nodetool.vector.Chroma"



class IndexFolder(GraphNode):
    folder: FolderRef | GraphNode | tuple[GraphNode, str] = Field(default=FolderRef(type='folder', uri='', asset_id=None), description='The folder to index')
    @classmethod
    def get_node_type(cls): return "nodetool.vector.IndexFolder"



class NearestNeighbors(GraphNode):
    documents: list[Tensor] | GraphNode | tuple[GraphNode, str] = Field(default=[], description='The list of documents to search')
    query: Tensor | GraphNode | tuple[GraphNode, str] = Field(default=Tensor(type='tensor', value=[], dtype=None), description='The query to search for')
    n_neighbors: int | GraphNode | tuple[GraphNode, str] = Field(default=1, description='The number of neighbors to return')
    @classmethod
    def get_node_type(cls): return "nodetool.vector.NearestNeighbors"



class QueryImage(GraphNode):
    folder: FolderRef | GraphNode | tuple[GraphNode, str] = Field(default=FolderRef(type='folder', uri='', asset_id=None), description='The folder to query')
    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None), description='The image to query')
    n_results: int | GraphNode | tuple[GraphNode, str] = Field(default=1, description='The number of results to return')
    @classmethod
    def get_node_type(cls): return "nodetool.vector.QueryImage"



class QueryText(GraphNode):
    folder: FolderRef | GraphNode | tuple[GraphNode, str] = Field(default=FolderRef(type='folder', uri='', asset_id=None), description='The folder to query')
    text: TextRef | GraphNode | tuple[GraphNode, str] = Field(default=TextRef(type='text', uri='', asset_id=None), description='The text to query')
    n_results: int | GraphNode | tuple[GraphNode, str] = Field(default=1, description='The number of results to return')
    @classmethod
    def get_node_type(cls): return "nodetool.vector.QueryText"


