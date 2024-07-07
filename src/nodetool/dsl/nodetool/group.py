from pydantic import BaseModel, Field
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode


class GroupNode(GraphNode):
    @classmethod
    def get_node_type(cls): return "nodetool.workflows.base_node.Group"



class Loop(GraphNode):
    input: Any | GraphNode | tuple[GraphNode, str] = Field(default=PydanticUndefined, description='The input data to loop over.')
    @classmethod
    def get_node_type(cls): return "nodetool.group.Loop"


