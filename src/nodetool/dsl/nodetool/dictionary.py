from pydantic import BaseModel, Field
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode


class Access(GraphNode):
    dictionary: dict[str, Any] | GraphNode | tuple[GraphNode, str] = Field(default={}, description=None)
    key: str | GraphNode | tuple[GraphNode, str] = Field(default='', description=None)
    @classmethod
    def get_node_type(cls): return "nodetool.dictionary.Access"



class Delete(GraphNode):
    dictionary: dict[str, Any] | GraphNode | tuple[GraphNode, str] = Field(default={}, description=None)
    key: str | GraphNode | tuple[GraphNode, str] = Field(default='', description=None)
    @classmethod
    def get_node_type(cls): return "nodetool.dictionary.Delete"



class DictFromJson(GraphNode):
    json_string: str | GraphNode | tuple[GraphNode, str] = Field(default='', description=None)
    @classmethod
    def get_node_type(cls): return "nodetool.dictionary.DictFromJson"



class DictFromList(GraphNode):
    keys: list[Any] | GraphNode | tuple[GraphNode, str] = Field(default=[], description=None)
    values: list[Any] | GraphNode | tuple[GraphNode, str] = Field(default=[], description=None)
    @classmethod
    def get_node_type(cls): return "nodetool.dictionary.DictFromList"



class DictToDataframe(GraphNode):
    dictionary: dict[str, Any] | GraphNode | tuple[GraphNode, str] = Field(default={}, description=None)
    @classmethod
    def get_node_type(cls): return "nodetool.dictionary.DictToDataframe"



class Merge(GraphNode):
    dict_a: dict[str, Any] | GraphNode | tuple[GraphNode, str] = Field(default={}, description=None)
    dict_b: dict[str, Any] | GraphNode | tuple[GraphNode, str] = Field(default={}, description=None)
    @classmethod
    def get_node_type(cls): return "nodetool.dictionary.Merge"



class RowsToDataframe(GraphNode):
    rows: list[dict[str, Any]] | GraphNode | tuple[GraphNode, str] = Field(default=[], description=None)
    @classmethod
    def get_node_type(cls): return "nodetool.dictionary.RowsToDataframe"



class SelectKeys(GraphNode):
    dictionary: dict[str, Any] | GraphNode | tuple[GraphNode, str] = Field(default={}, description=None)
    keys: list[str] | GraphNode | tuple[GraphNode, str] = Field(default=[], description=None)
    @classmethod
    def get_node_type(cls): return "nodetool.dictionary.SelectKeys"



class Update(GraphNode):
    dictionary: dict[str, Any] | GraphNode | tuple[GraphNode, str] = Field(default={}, description=None)
    new_pairs: dict[str, Any] | GraphNode | tuple[GraphNode, str] = Field(default={}, description=None)
    @classmethod
    def get_node_type(cls): return "nodetool.dictionary.Update"


