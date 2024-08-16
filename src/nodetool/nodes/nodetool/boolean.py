from enum import Enum
from pydantic import Field
from nodetool.workflows.base_node import BaseNode
from nodetool.workflows.processing_context import ProcessingContext
from typing import Any


class BooleanOperation(str, Enum):
    AND = "and"
    OR = "or"
    XOR = "xor"
    NAND = "nand"
    NOR = "nor"


class LogicalOperator(BaseNode):
    """
    Performs logical operations on two boolean inputs.
    boolean, logic, operator

    Use cases:
    - Combine multiple conditions in decision-making
    - Implement complex logical rules in workflows
    - Create advanced filters or triggers
    """

    a: bool = Field(default=False, description="First boolean input")
    b: bool = Field(default=False, description="Second boolean input")
    operation: BooleanOperation = Field(
        default=BooleanOperation.AND, description="Logical operation to perform"
    )

    async def process(self, context: ProcessingContext) -> bool:
        if self.operation == BooleanOperation.AND:
            return self.a and self.b
        elif self.operation == BooleanOperation.OR:
            return self.a or self.b
        elif self.operation == BooleanOperation.XOR:
            return self.a ^ self.b
        elif self.operation == BooleanOperation.NAND:
            return not (self.a and self.b)
        elif self.operation == BooleanOperation.NOR:
            return not (self.a or self.b)
        else:
            raise ValueError(f"Unsupported operation: {self.operation}")


class Not(BaseNode):
    """
    Performs logical NOT operation on a boolean input.
    boolean, logic, not, invert

    Use cases:
    - Invert a condition's result
    - Implement toggle functionality
    - Create opposite logic branches
    """

    value: bool = Field(default=False, description="Boolean input to negate")

    async def process(self, context: ProcessingContext) -> bool:
        return not self.value


class Comparison(str, Enum):
    EQUAL = "=="
    NOT_EQUAL = "!="
    GREATER_THAN = ">"
    LESS_THAN = "<"
    GREATER_THAN_OR_EQUAL = ">="
    LESS_THAN_OR_EQUAL = "<="


class Compare(BaseNode):
    """
    Compares two values using a specified comparison operator.
    compare, condition, logic

    Use cases:
    - Implement decision points in workflows
    - Filter data based on specific criteria
    - Create dynamic thresholds or limits
    """

    a: Any = Field(description="First value to compare")
    b: Any = Field(description="Second value to compare")
    comparison: Comparison = Field(
        default=Comparison.EQUAL, description="Comparison operator to use"
    )

    async def process(self, context: ProcessingContext) -> bool:
        if self.comparison == Comparison.EQUAL:
            return self.a == self.b
        elif self.comparison == Comparison.NOT_EQUAL:
            return self.a != self.b
        elif self.comparison == Comparison.GREATER_THAN:
            return self.a > self.b
        elif self.comparison == Comparison.LESS_THAN:
            return self.a < self.b
        elif self.comparison == Comparison.GREATER_THAN_OR_EQUAL:
            return self.a >= self.b
        elif self.comparison == Comparison.LESS_THAN_OR_EQUAL:
            return self.a <= self.b
        else:
            raise ValueError(f"Unsupported comparison: {self.comparison}")


class If(BaseNode):
    """
    Selects between two values based on a condition.
    conditional, if-else, branch

    Use cases:
    - Implement conditional logic in workflows
    - Create dynamic output selection
    - Handle different cases based on input conditions
    """

    condition: bool = Field(description="The condition to evaluate")
    if_true: Any = Field(description="Value to return if the condition is true")
    if_false: Any = Field(description="Value to return if the condition is false")

    async def process(self, context: ProcessingContext) -> Any:
        return self.if_true if self.condition else self.if_false


class IsNone(BaseNode):
    """
    Checks if a value is None.
    null, none, check

    Use cases:
    - Validate input presence
    - Handle optional parameters
    - Implement null checks in data processing
    """

    value: Any = Field(description="The value to check for None")

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

    value: Any = Field(description="The value to check for membership")
    options: list[Any] = Field(description="The list of options to check against")

    async def process(self, context: ProcessingContext) -> bool:
        return self.value in self.options


class All(BaseNode):
    """
    Checks if all boolean values in a list are True.
    boolean, all, check

    Use cases:
    - Ensure all conditions in a set are met
    - Implement comprehensive checks
    - Validate multiple criteria simultaneously
    """

    values: list[bool] = Field(description="List of boolean values to check")

    async def process(self, context: ProcessingContext) -> bool:
        return all(self.values)


class Some(BaseNode):
    """
    Checks if any boolean value in a list is True.
    boolean, any, check

    Use cases:
    - Check if at least one condition in a set is met
    - Implement optional criteria checks
    - Create flexible validation rules
    """

    values: list[bool] = Field(description="List of boolean values to check")

    async def process(self, context: ProcessingContext) -> bool:
        return any(self.values)
