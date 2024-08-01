from pydantic import BaseModel, Field
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode


class Combine(GraphNode):
    dict_a: dict[str, Any] | GraphNode | tuple[GraphNode, str] = Field(default={}, description=None)
    dict_b: dict[str, Any] | GraphNode | tuple[GraphNode, str] = Field(default={}, description=None)
    @classmethod
    def get_node_type(cls): return "nodetool.dictionary.Combine"



class ConvertToDataframe(GraphNode):
    dictionary: dict[str, Any] | GraphNode | tuple[GraphNode, str] = Field(default={}, description=None)
    @classmethod
    def get_node_type(cls): return "nodetool.dictionary.ConvertToDataframe"



class Filter(GraphNode):
    dictionary: dict[str, Any] | GraphNode | tuple[GraphNode, str] = Field(default={}, description=None)
    keys: list[str] | GraphNode | tuple[GraphNode, str] = Field(default=[], description=None)
    @classmethod
    def get_node_type(cls): return "nodetool.dictionary.Filter"



class GetValue(GraphNode):
    dictionary: dict[str, Any] | GraphNode | tuple[GraphNode, str] = Field(default={}, description=None)
    key: str | GraphNode | tuple[GraphNode, str] = Field(default='', description=None)
    @classmethod
    def get_node_type(cls): return "nodetool.dictionary.GetValue"



class ParseJSON(GraphNode):
    json_string: str | GraphNode | tuple[GraphNode, str] = Field(default='', description=None)
    @classmethod
    def get_node_type(cls): return "nodetool.dictionary.ParseJSON"



class Remove(GraphNode):
    dictionary: dict[str, Any] | GraphNode | tuple[GraphNode, str] = Field(default={}, description=None)
    key: str | GraphNode | tuple[GraphNode, str] = Field(default='', description=None)
    @classmethod
    def get_node_type(cls): return "nodetool.dictionary.Remove"



class Update(GraphNode):
    dictionary: dict[str, Any] | GraphNode | tuple[GraphNode, str] = Field(default={}, description=None)
    new_pairs: dict[str, Any] | GraphNode | tuple[GraphNode, str] = Field(default={}, description=None)
    @classmethod
    def get_node_type(cls): return "nodetool.dictionary.Update"



class Zip(GraphNode):
    keys: list[Any] | GraphNode | tuple[GraphNode, str] = Field(default=[], description=None)
    values: list[Any] | GraphNode | tuple[GraphNode, str] = Field(default=[], description=None)
    @classmethod
    def get_node_type(cls): return "nodetool.dictionary.Zip"


