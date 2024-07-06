from pydantic import BaseModel, Field
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode


class AddToDictionary(GraphNode):
    dictionary: dict[str, Any] | GraphNode | tuple[GraphNode, str] = Field(default={}, description=None)
    new_pairs: dict[str, Any] | GraphNode | tuple[GraphNode, str] = Field(default={}, description=None)
    @classmethod
    def get_node_type(cls): return "nodetool.dictionary.AddToDictionary"



class CombineDictionaries(GraphNode):
    dict_a: dict[str, Any] | GraphNode | tuple[GraphNode, str] = Field(default={}, description=None)
    dict_b: dict[str, Any] | GraphNode | tuple[GraphNode, str] = Field(default={}, description=None)
    @classmethod
    def get_node_type(cls): return "nodetool.dictionary.CombineDictionaries"



class ConvertDictionariesToDataframe(GraphNode):
    rows: list[dict[str, Any]] | GraphNode | tuple[GraphNode, str] = Field(default=[], description=None)
    @classmethod
    def get_node_type(cls): return "nodetool.dictionary.ConvertDictionariesToDataframe"



class ConvertDictionaryToDataframe(GraphNode):
    dictionary: dict[str, Any] | GraphNode | tuple[GraphNode, str] = Field(default={}, description=None)
    @classmethod
    def get_node_type(cls): return "nodetool.dictionary.ConvertDictionaryToDataframe"



class ConvertJSONToDictionary(GraphNode):
    json_string: str | GraphNode | tuple[GraphNode, str] = Field(default='', description=None)
    @classmethod
    def get_node_type(cls): return "nodetool.dictionary.ConvertJSONToDictionary"



class CreateDictionaryFromList(GraphNode):
    keys: list[Any] | GraphNode | tuple[GraphNode, str] = Field(default=[], description=None)
    values: list[Any] | GraphNode | tuple[GraphNode, str] = Field(default=[], description=None)
    @classmethod
    def get_node_type(cls): return "nodetool.dictionary.CreateDictionaryFromList"



class FilterDictionaryKeys(GraphNode):
    dictionary: dict[str, Any] | GraphNode | tuple[GraphNode, str] = Field(default={}, description=None)
    keys: list[str] | GraphNode | tuple[GraphNode, str] = Field(default=[], description=None)
    @classmethod
    def get_node_type(cls): return "nodetool.dictionary.FilterDictionaryKeys"



class GetDictionaryValue(GraphNode):
    dictionary: dict[str, Any] | GraphNode | tuple[GraphNode, str] = Field(default={}, description=None)
    key: str | GraphNode | tuple[GraphNode, str] = Field(default='', description=None)
    @classmethod
    def get_node_type(cls): return "nodetool.dictionary.GetDictionaryValue"



class RemoveFromDictionary(GraphNode):
    dictionary: dict[str, Any] | GraphNode | tuple[GraphNode, str] = Field(default={}, description=None)
    key: str | GraphNode | tuple[GraphNode, str] = Field(default='', description=None)
    @classmethod
    def get_node_type(cls): return "nodetool.dictionary.RemoveFromDictionary"


