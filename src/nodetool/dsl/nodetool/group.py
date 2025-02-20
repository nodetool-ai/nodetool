from pydantic import BaseModel, Field
import typing
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode


class GroupNode(GraphNode):
    """
    A special node type that can contain a subgraph of nodes.
    group, workflow, structure, organize

    This node type allows for hierarchical structuring of workflows.
    """


    @classmethod
    def get_node_type(cls): return "nodetool.workflows.base_node.Group"



class Loop(GraphNode):
    """
    Loops over a list of items and processes the remaining nodes for each item.
    loop, itereate, repeat, for, each, batch

    Use cases:
    - Loop over a list of items and process the nodes inside the group
    """

    input: Any | GraphNode | tuple[GraphNode, str] = Field(default=[], description='The input data to loop over.')

    @classmethod
    def get_node_type(cls): return "nodetool.group.Loop"


