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
    def get_node_type(cls): return "nodetool.text.Chunk"



class Concat(GraphNode):
    a: str | nodetool.metadata.types.TextRef | GraphNode | tuple[GraphNode, str] = Field(default='', description=None)
    b: str | nodetool.metadata.types.TextRef | GraphNode | tuple[GraphNode, str] = Field(default='', description=None)
    @classmethod
    def get_node_type(cls): return "nodetool.text.Concat"



class Extract(GraphNode):
    text: str | nodetool.metadata.types.TextRef | GraphNode | tuple[GraphNode, str] = Field(default='', description=None)
    start: int | GraphNode | tuple[GraphNode, str] = Field(default=0, description=None)
    end: int | GraphNode | tuple[GraphNode, str] = Field(default=0, description=None)
    @classmethod
    def get_node_type(cls): return "nodetool.text.Extract"



class ExtractJSON(GraphNode):
    text: str | nodetool.metadata.types.TextRef | GraphNode | tuple[GraphNode, str] = Field(default=PydanticUndefined, description=None)
    json_path: str | GraphNode | tuple[GraphNode, str] = Field(default='$.*', description=None)
    find_all: bool | GraphNode | tuple[GraphNode, str] = Field(default=False, description=None)
    @classmethod
    def get_node_type(cls): return "nodetool.text.ExtractJSON"



class ExtractRegex(GraphNode):
    text: str | nodetool.metadata.types.TextRef | GraphNode | tuple[GraphNode, str] = Field(default='', description=None)
    regex: str | GraphNode | tuple[GraphNode, str] = Field(default='', description=None)
    dotall: bool | GraphNode | tuple[GraphNode, str] = Field(default=False, description=None)
    ignorecase: bool | GraphNode | tuple[GraphNode, str] = Field(default=False, description=None)
    multiline: bool | GraphNode | tuple[GraphNode, str] = Field(default=False, description=None)
    @classmethod
    def get_node_type(cls): return "nodetool.text.ExtractRegex"



class FindAllRegex(GraphNode):
    text: str | nodetool.metadata.types.TextRef | GraphNode | tuple[GraphNode, str] = Field(default='', description=None)
    regex: str | GraphNode | tuple[GraphNode, str] = Field(default='', description=None)
    dotall: bool | GraphNode | tuple[GraphNode, str] = Field(default=False, description=None)
    ignorecase: bool | GraphNode | tuple[GraphNode, str] = Field(default=False, description=None)
    multiline: bool | GraphNode | tuple[GraphNode, str] = Field(default=False, description=None)
    @classmethod
    def get_node_type(cls): return "nodetool.text.FindAllRegex"



class JSONToDataframe(GraphNode):
    text: str | nodetool.metadata.types.TextRef | GraphNode | tuple[GraphNode, str] = Field(default=PydanticUndefined, description=None)
    @classmethod
    def get_node_type(cls): return "nodetool.text.JSONToDataframe"



class Join(GraphNode):
    strings: list[str | nodetool.metadata.types.TextRef] | GraphNode | tuple[GraphNode, str] = Field(default=[], description=None)
    separator: str | GraphNode | tuple[GraphNode, str] = Field(default='', description=None)
    @classmethod
    def get_node_type(cls): return "nodetool.text.Join"



class ParseJSON(GraphNode):
    text: str | nodetool.metadata.types.TextRef | GraphNode | tuple[GraphNode, str] = Field(default='', description=None)
    @classmethod
    def get_node_type(cls): return "nodetool.text.ParseJSON"



class Replace(GraphNode):
    text: str | nodetool.metadata.types.TextRef | GraphNode | tuple[GraphNode, str] = Field(default='', description=None)
    old: str | GraphNode | tuple[GraphNode, str] = Field(default='', description=None)
    new: str | GraphNode | tuple[GraphNode, str] = Field(default='', description=None)
    @classmethod
    def get_node_type(cls): return "nodetool.text.Replace"



class SaveText(GraphNode):
    value: str | nodetool.metadata.types.TextRef | GraphNode | tuple[GraphNode, str] = Field(default=PydanticUndefined, description=None)
    name: str | GraphNode | tuple[GraphNode, str] = Field(default='text.txt', description=None)
    @classmethod
    def get_node_type(cls): return "nodetool.text.SaveText"



class Split(GraphNode):
    text: str | nodetool.metadata.types.TextRef | GraphNode | tuple[GraphNode, str] = Field(default='', description=None)
    delimiter: str | GraphNode | tuple[GraphNode, str] = Field(default=',', description=None)
    @classmethod
    def get_node_type(cls): return "nodetool.text.Split"



class Template(GraphNode):
    string: str | nodetool.metadata.types.TextRef | GraphNode | tuple[GraphNode, str] = Field(default='', description=None)
    values: dict[str, Any] | GraphNode | tuple[GraphNode, str] = Field(default={}, description=None)
    @classmethod
    def get_node_type(cls): return "nodetool.text.Template"



class TextID(GraphNode):
    text: TextRef | GraphNode | tuple[GraphNode, str] = Field(default='', description=None)
    @classmethod
    def get_node_type(cls): return "nodetool.text.TextID"


