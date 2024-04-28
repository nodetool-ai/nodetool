from pydantic import BaseModel, Field
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode


class GroupInput(GraphNode):
    items: list[Any] | GraphNode | tuple[GraphNode, str] = Field(default=[], description=None)
    name: str | GraphNode | tuple[GraphNode, str] = Field(default='', description=None)
    @classmethod
    def get_node_type(cls): return "nodetool.input.GroupInput"



class GroupNode(GraphNode):
    @classmethod
    def get_node_type(cls): return "nodetool.workflows.base_node.Group"



class GroupOutput(GraphNode):
    input: Any | GraphNode | tuple[GraphNode, str] = Field(default=None, description=None)
    name: str | GraphNode | tuple[GraphNode, str] = Field(default='', description=None)
    @classmethod
    def get_node_type(cls): return "nodetool.output.GroupOutput"



class Loop(GraphNode):
    @classmethod
    def get_node_type(cls): return "nodetool.group.Loop"


