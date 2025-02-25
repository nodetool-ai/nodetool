from pydantic import BaseModel, Field
import typing
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode


class All(GraphNode):
    """
    Checks if all boolean values in a list are True.
    boolean, all, check, logic, condition, flow-control, branch


    Use cases:
    - Ensure all conditions in a set are met
    - Implement comprehensive checks
    - Validate multiple criteria simultaneously
    """

    values: list[bool] | GraphNode | tuple[GraphNode, str] = Field(default=[], description='List of boolean values to check')

    @classmethod
    def get_node_type(cls): return "nodetool.boolean.All"


import nodetool.nodes.nodetool.boolean

class Compare(GraphNode):
    """
    Compares two values using a specified comparison operator.
    compare, condition, logic

    Use cases:
    - Implement decision points in workflows
    - Filter data based on specific criteria
    - Create dynamic thresholds or limits
    """

    Comparison: typing.ClassVar[type] = nodetool.nodes.nodetool.boolean.Compare.Comparison
    a: Any | GraphNode | tuple[GraphNode, str] = Field(default=None, description='First value to compare')
    b: Any | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Second value to compare')
    comparison: nodetool.nodes.nodetool.boolean.Compare.Comparison = Field(default=Comparison.EQUAL, description='Comparison operator to use')

    @classmethod
    def get_node_type(cls): return "nodetool.boolean.Compare"



class ConditionalSwitch(GraphNode):
    """
    Performs a conditional check on a boolean input and returns a value based on the result.
    if, condition, flow-control, branch, true, false, switch, toggle

    Use cases:
    - Implement conditional logic in workflows
    - Create dynamic branches in workflows
    - Implement decision points in workflows
    """

    condition: bool | GraphNode | tuple[GraphNode, str] = Field(default=False, description='The condition to check')
    if_true: Any | GraphNode | tuple[GraphNode, str] = Field(default=None, description='The value to return if the condition is true')
    if_false: Any | GraphNode | tuple[GraphNode, str] = Field(default=None, description='The value to return if the condition is false')

    @classmethod
    def get_node_type(cls): return "nodetool.boolean.ConditionalSwitch"



class IsIn(GraphNode):
    """
    Checks if a value is present in a list of options.
    membership, contains, check

    Use cases:
    - Validate input against a set of allowed values
    - Implement category or group checks
    - Filter data based on inclusion criteria
    """

    value: Any | GraphNode | tuple[GraphNode, str] = Field(default=None, description='The value to check for membership')
    options: list[Any] | GraphNode | tuple[GraphNode, str] = Field(default=[], description='The list of options to check against')

    @classmethod
    def get_node_type(cls): return "nodetool.boolean.IsIn"



class IsNone(GraphNode):
    """
    Checks if a value is None.
    null, none, check

    Use cases:
    - Validate input presence
    - Handle optional parameters
    - Implement null checks in data processing
    """

    value: Any | GraphNode | tuple[GraphNode, str] = Field(default=None, description='The value to check for None')

    @classmethod
    def get_node_type(cls): return "nodetool.boolean.IsNone"


import nodetool.nodes.nodetool.boolean

class LogicalOperator(GraphNode):
    """
    Performs logical operations on two boolean inputs.
    boolean, logic, operator, condition, flow-control, branch, else, true, false, switch, toggle

    Use cases:
    - Combine multiple conditions in decision-making
    - Implement complex logical rules in workflows
    - Create advanced filters or triggers
    """

    BooleanOperation: typing.ClassVar[type] = nodetool.nodes.nodetool.boolean.LogicalOperator.BooleanOperation
    a: bool | GraphNode | tuple[GraphNode, str] = Field(default=False, description='First boolean input')
    b: bool | GraphNode | tuple[GraphNode, str] = Field(default=False, description='Second boolean input')
    operation: nodetool.nodes.nodetool.boolean.LogicalOperator.BooleanOperation = Field(default=BooleanOperation.AND, description='Logical operation to perform')

    @classmethod
    def get_node_type(cls): return "nodetool.boolean.LogicalOperator"



class Not(GraphNode):
    """
    Performs logical NOT operation on a boolean input.
    boolean, logic, not, invert, !, negation, condition, else, true, false, switch, toggle, flow-control, branch

    Use cases:
    - Invert a condition's result
    - Implement toggle functionality
    - Create opposite logic branches
    """

    value: bool | GraphNode | tuple[GraphNode, str] = Field(default=False, description='Boolean input to negate')

    @classmethod
    def get_node_type(cls): return "nodetool.boolean.Not"



class Some(GraphNode):
    """
    Checks if any boolean value in a list is True.
    boolean, any, check, logic, condition, flow-control, branch

    Use cases:
    - Check if at least one condition in a set is met
    - Implement optional criteria checks
    - Create flexible validation rules
    """

    values: list[bool] | GraphNode | tuple[GraphNode, str] = Field(default=[], description='List of boolean values to check')

    @classmethod
    def get_node_type(cls): return "nodetool.boolean.Some"


