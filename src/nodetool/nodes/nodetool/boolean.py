from enum import Enum
from pydantic import Field
from nodetool.workflows.base_node import BaseNode
from nodetool.workflows.processing_context import ProcessingContext
from typing import Any


class ConditionalSwitch(BaseNode):
    """
    Performs a conditional check on a boolean input and returns a value based on the result.
    if, condition, flow-control, branch, true, false, switch, toggle

    Use cases:
    - Implement conditional logic in workflows
    - Create dynamic branches in workflows
    - Implement decision points in workflows
    """

    condition: bool = Field(default=False, description="The condition to check")
    if_true: Any = Field(
        default=None, description="The value to return if the condition is true"
    )
    if_false: Any = Field(
        default=None, description="The value to return if the condition is false"
    )

    async def process(self, context: ProcessingContext) -> Any:
        return self.if_true if self.condition else self.if_false


class LogicalOperator(BaseNode):
    """
    Performs logical operations on two boolean inputs.
    boolean, logic, operator, condition, flow-control, branch, else, true, false, switch, toggle

    Use cases:
    - Combine multiple conditions in decision-making
    - Implement complex logical rules in workflows
    - Create advanced filters or triggers
    """

    class BooleanOperation(str, Enum):
        AND = "and"
        OR = "or"
        XOR = "xor"
        NAND = "nand"
        NOR = "nor"

    a: bool = Field(default=False, description="First boolean input")
    b: bool = Field(default=False, description="Second boolean input")
    operation: BooleanOperation = Field(
        default=BooleanOperation.AND, description="Logical operation to perform"
    )

    async def process(self, context: ProcessingContext) -> bool:
        if self.operation == self.BooleanOperation.AND:
            return self.a and self.b
        elif self.operation == self.BooleanOperation.OR:
            return self.a or self.b
        elif self.operation == self.BooleanOperation.XOR:
            return self.a ^ self.b
        elif self.operation == self.BooleanOperation.NAND:
            return not (self.a and self.b)
        elif self.operation == self.BooleanOperation.NOR:
            return not (self.a or self.b)
        else:
            raise ValueError(f"Unsupported operation: {self.operation}")


class Not(BaseNode):
    """
    Performs logical NOT operation on a boolean input.
    boolean, logic, not, invert, !, negation, condition, else, true, false, switch, toggle, flow-control, branch

    Use cases:
    - Invert a condition's result
    - Implement toggle functionality
    - Create opposite logic branches
    """

    value: bool = Field(default=False, description="Boolean input to negate")

    async def process(self, context: ProcessingContext) -> bool:
        return not self.value


class Compare(BaseNode):
    """
    Compares two values using a specified comparison operator.
    compare, condition, logic

    Use cases:
    - Implement decision points in workflows
    - Filter data based on specific criteria
    - Create dynamic thresholds or limits
    """

    class Comparison(str, Enum):
        EQUAL = "=="
        NOT_EQUAL = "!="
        GREATER_THAN = ">"
        LESS_THAN = "<"
        GREATER_THAN_OR_EQUAL = ">="
        LESS_THAN_OR_EQUAL = "<="

    a: Any = Field(default=None, description="First value to compare")
    b: Any = Field(default=None, description="Second value to compare")
    comparison: Comparison = Field(
        default=Comparison.EQUAL, description="Comparison operator to use"
    )

    async def process(self, context: ProcessingContext) -> bool:
        if self.comparison == self.Comparison.EQUAL:
            return self.a == self.b
        elif self.comparison == self.Comparison.NOT_EQUAL:
            return self.a != self.b
        elif self.comparison == self.Comparison.GREATER_THAN:
            return self.a > self.b
        elif self.comparison == self.Comparison.LESS_THAN:
            return self.a < self.b
        elif self.comparison == self.Comparison.GREATER_THAN_OR_EQUAL:
            return self.a >= self.b
        elif self.comparison == self.Comparison.LESS_THAN_OR_EQUAL:
            return self.a <= self.b
        else:
            raise ValueError(f"Unsupported comparison: {self.comparison}")


class IsNone(BaseNode):
    """
    Checks if a value is None.
    null, none, check

    Use cases:
    - Validate input presence
    - Handle optional parameters
    - Implement null checks in data processing
    """

    value: Any = Field(default=None, description="The value to check for None")

    async def process(self, context: ProcessingContext) -> bool:
        return self.value is None


class IsIn(BaseNode):
    """
    Checks if a value is present in a list of options.
    membership, contains, check

    Use cases:
    - Validate input against a set of allowed values
    - Implement category or group checks
    - Filter data based on inclusion criteria
    """

    value: Any = Field(default=None, description="The value to check for membership")
    options: list[Any] = Field(
        default=[], description="The list of options to check against"
    )

    async def process(self, context: ProcessingContext) -> bool:
        return self.value in self.options


class All(BaseNode):
    """
    Checks if all boolean values in a list are True.
    boolean, all, check, logic, condition, flow-control, branch


    Use cases:
    - Ensure all conditions in a set are met
    - Implement comprehensive checks
    - Validate multiple criteria simultaneously
    """

    values: list[bool] = Field(
        default=[], description="List of boolean values to check"
    )

    async def process(self, context: ProcessingContext) -> bool:
        return all(self.values)


class Some(BaseNode):
    """
    Checks if any boolean value in a list is True.
    boolean, any, check, logic, condition, flow-control, branch

    Use cases:
    - Check if at least one condition in a set is met
    - Implement optional criteria checks
    - Create flexible validation rules
    """

    values: list[bool] = Field(
        default=[], description="List of boolean values to check"
    )

    async def process(self, context: ProcessingContext) -> bool:
        return any(self.values)
