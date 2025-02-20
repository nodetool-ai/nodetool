from pydantic import BaseModel, Field
import typing
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode


class If(GraphNode):
    """
    Conditionally executes one of two branches based on a condition.
    control, flow, condition, logic, else, true, false, switch, toggle, flow-control

    Use cases:
    - Branch workflow based on conditions
    - Handle different cases in data processing
    - Implement decision logic
    """

    condition: bool | GraphNode | tuple[GraphNode, str] = Field(default=False, description='The condition to evaluate')
    value: Any | GraphNode | tuple[GraphNode, str] = Field(default=None, description='The value to pass to the next node')

    @classmethod
    def get_node_type(cls): return "nodetool.control.If"


