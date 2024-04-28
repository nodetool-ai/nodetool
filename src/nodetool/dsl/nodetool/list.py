from pydantic import BaseModel, Field
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode


class Append(GraphNode):
    values: list[Any] | GraphNode | tuple[GraphNode, str] = Field(default=[], description=None)
    value: Any | GraphNode | tuple[GraphNode, str] = Field(default=None, description=None)
    @classmethod
    def get_node_type(cls): return "nodetool.list.Append"



class Dedupe(GraphNode):
    values: list[Any] | GraphNode | tuple[GraphNode, str] = Field(default=[], description=None)
    @classmethod
    def get_node_type(cls): return "nodetool.list.Dedupe"



class Extend(GraphNode):
    values: list[Any] | GraphNode | tuple[GraphNode, str] = Field(default=[], description=None)
    other_values: list[Any] | GraphNode | tuple[GraphNode, str] = Field(default=[], description=None)
    @classmethod
    def get_node_type(cls): return "nodetool.list.Extend"



class Filter(GraphNode):
    values: list[Any] | GraphNode | tuple[GraphNode, str] = Field(default=PydanticUndefined, description='The list to filter.')
    condition: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The Python code to use as the filtering condition.')
    @classmethod
    def get_node_type(cls): return "nodetool.list.Filter"



class Index(GraphNode):
    values: list[Any] | GraphNode | tuple[GraphNode, str] = Field(default=[], description=None)
    index: int | GraphNode | tuple[GraphNode, str] = Field(default=0, description=None)
    @classmethod
    def get_node_type(cls): return "nodetool.list.Index"



class Length(GraphNode):
    values: list[Any] | GraphNode | tuple[GraphNode, str] = Field(default=[], description=None)
    @classmethod
    def get_node_type(cls): return "nodetool.list.Length"



class Map(GraphNode):
    values: list[Any] | GraphNode | tuple[GraphNode, str] = Field(default=PydanticUndefined, description='The list to map.')
    code: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='Python code to use for mapping.')
    @classmethod
    def get_node_type(cls): return "nodetool.list.Map"



class Range(GraphNode):
    start: int | GraphNode | tuple[GraphNode, str] = Field(default=0, description=None)
    stop: int | GraphNode | tuple[GraphNode, str] = Field(default=0, description=None)
    step: int | GraphNode | tuple[GraphNode, str] = Field(default=1, description=None)
    @classmethod
    def get_node_type(cls): return "nodetool.list.Range"



class Reduce(GraphNode):
    values: list[Any] | GraphNode | tuple[GraphNode, str] = Field(default=PydanticUndefined, description='The list to reduce.')
    initial_value: Any | GraphNode | tuple[GraphNode, str] = Field(default=None, description='The initial value for the reduction. If not provided, the first value in the list is used.')
    reduction_code: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The Python code to use for the reduction.')
    @classmethod
    def get_node_type(cls): return "nodetool.list.Reduce"



class Reverse(GraphNode):
    values: list[Any] | GraphNode | tuple[GraphNode, str] = Field(default=[], description=None)
    @classmethod
    def get_node_type(cls): return "nodetool.list.Reverse"



class SaveList(GraphNode):
    values: list[Any] | GraphNode | tuple[GraphNode, str] = Field(default=PydanticUndefined, description='The list to save.')
    name: str | GraphNode | tuple[GraphNode, str] = Field(default='text.txt', description=None)
    @classmethod
    def get_node_type(cls): return "nodetool.list.SaveList"



class Select(GraphNode):
    values: list[Any] | GraphNode | tuple[GraphNode, str] = Field(default=[], description=None)
    indices: list[int] | GraphNode | tuple[GraphNode, str] = Field(default=[], description=None)
    @classmethod
    def get_node_type(cls): return "nodetool.list.Select"



class Slice(GraphNode):
    values: list[Any] | GraphNode | tuple[GraphNode, str] = Field(default=[], description=None)
    start: int | GraphNode | tuple[GraphNode, str] = Field(default=0, description=None)
    stop: int | GraphNode | tuple[GraphNode, str] = Field(default=0, description=None)
    step: int | GraphNode | tuple[GraphNode, str] = Field(default=1, description=None)
    @classmethod
    def get_node_type(cls): return "nodetool.list.Slice"


