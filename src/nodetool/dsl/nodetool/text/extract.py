from pydantic import BaseModel, Field
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode


class Chunk(GraphNode):
    text: str | nodetool.metadata.types.TextRef | GraphNode | tuple[GraphNode, str] = Field(default='', description=None)
    length: int | GraphNode | tuple[GraphNode, str] = Field(default=100, description=None)
    overlap: int | GraphNode | tuple[GraphNode, str] = Field(default=0, description=None)
    separator: str | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description=None)
    @classmethod
    def get_node_type(cls): return "nodetool.text.extract.Chunk"



class Embedding(GraphNode):
    input: str | nodetool.metadata.types.TextRef | GraphNode | tuple[GraphNode, str] = Field(default='', description=None)
    model: LlamaModel | GraphNode | tuple[GraphNode, str] = Field(default=LlamaModel(type='llama_model', name='', repo_id='', filename='', local_path=None), description=None)
    n_gpu_layers: int | GraphNode | tuple[GraphNode, str] = Field(default=0, description='The number of layers on the GPU')
    chunk_size: int | GraphNode | tuple[GraphNode, str] = Field(default=4096, description='The size of the chunks to split the input into')
    @classmethod
    def get_node_type(cls): return "nodetool.text.extract.Embedding"



class Extract(GraphNode):
    text: str | nodetool.metadata.types.TextRef | GraphNode | tuple[GraphNode, str] = Field(default='', description=None)
    start: int | GraphNode | tuple[GraphNode, str] = Field(default=0, description=None)
    end: int | GraphNode | tuple[GraphNode, str] = Field(default=0, description=None)
    @classmethod
    def get_node_type(cls): return "nodetool.text.extract.Extract"



class ExtractJSON(GraphNode):
    text: str | nodetool.metadata.types.TextRef | GraphNode | tuple[GraphNode, str] = Field(default=PydanticUndefined, description=None)
    json_path: str | GraphNode | tuple[GraphNode, str] = Field(default='$.*', description=None)
    find_all: bool | GraphNode | tuple[GraphNode, str] = Field(default=False, description=None)
    @classmethod
    def get_node_type(cls): return "nodetool.text.extract.ExtractJSON"



class ExtractRegex(GraphNode):
    text: str | nodetool.metadata.types.TextRef | GraphNode | tuple[GraphNode, str] = Field(default='', description=None)
    regex: str | GraphNode | tuple[GraphNode, str] = Field(default='', description=None)
    dotall: bool | GraphNode | tuple[GraphNode, str] = Field(default=False, description=None)
    ignorecase: bool | GraphNode | tuple[GraphNode, str] = Field(default=False, description=None)
    multiline: bool | GraphNode | tuple[GraphNode, str] = Field(default=False, description=None)
    @classmethod
    def get_node_type(cls): return "nodetool.text.extract.ExtractRegex"



class FindAllRegex(GraphNode):
    text: str | nodetool.metadata.types.TextRef | GraphNode | tuple[GraphNode, str] = Field(default='', description=None)
    regex: str | GraphNode | tuple[GraphNode, str] = Field(default='', description=None)
    dotall: bool | GraphNode | tuple[GraphNode, str] = Field(default=False, description=None)
    ignorecase: bool | GraphNode | tuple[GraphNode, str] = Field(default=False, description=None)
    multiline: bool | GraphNode | tuple[GraphNode, str] = Field(default=False, description=None)
    @classmethod
    def get_node_type(cls): return "nodetool.text.extract.FindAllRegex"



class ParseJSON(GraphNode):
    text: str | nodetool.metadata.types.TextRef | GraphNode | tuple[GraphNode, str] = Field(default='', description=None)
    @classmethod
    def get_node_type(cls): return "nodetool.text.extract.ParseJSON"


