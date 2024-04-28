from pydantic import BaseModel, Field
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode


class Concat(GraphNode):
    a: str | nodetool.metadata.types.TextRef | GraphNode | tuple[GraphNode, str] = Field(default='', description=None)
    b: str | nodetool.metadata.types.TextRef | GraphNode | tuple[GraphNode, str] = Field(default='', description=None)
    @classmethod
    def get_node_type(cls): return "nodetool.text.Concat"



class JSONToDataframe(GraphNode):
    text: str | nodetool.metadata.types.TextRef | GraphNode | tuple[GraphNode, str] = Field(default=PydanticUndefined, description=None)
    @classmethod
    def get_node_type(cls): return "nodetool.text.JSONToDataframe"



class Join(GraphNode):
    strings: list[str | nodetool.metadata.types.TextRef] | GraphNode | tuple[GraphNode, str] = Field(default=[], description=None)
    separator: str | GraphNode | tuple[GraphNode, str] = Field(default='', description=None)
    @classmethod
    def get_node_type(cls): return "nodetool.text.Join"



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


