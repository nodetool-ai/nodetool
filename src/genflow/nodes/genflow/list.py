import ast
from enum import Enum
from functools import reduce
from io import BytesIO, StringIO
from pydantic import Field
from genflow.metadata.types import TextRef
from genflow.workflows.processing_context import ProcessingContext
from genflow.workflows.genflow_node import GenflowNode
from typing import Any, Literal


class ListLengthNode(GenflowNode):
    """
    This node calculates and returns the length of a list.
    """

    values: list[Any] = []

    async def process(self, context: ProcessingContext) -> int:
        return len(self.values)


class RangeNode(GenflowNode):
    """
    Range Node is a node that generates a list of integers within a specified range.
    """

    start: int = 0
    stop: int = 0
    step: int = 1

    async def process(self, context: ProcessingContext) -> list[int]:
        return list(range(self.start, self.stop, self.step))


class SliceNode(GenflowNode):
    """
    This node extracts a subset or 'slice' of a list.
    """

    values: list[Any] = []
    start: int = 0
    stop: int = 0
    step: int = 1

    async def process(self, context: ProcessingContext) -> list[Any]:
        return self.values[self.start : self.stop : self.step]


class SelectNode(GenflowNode):
    """
    This node selects specific values from a list.
    """

    values: list[Any] = []
    indices: list[int] = []

    async def process(self, context: ProcessingContext) -> list[Any]:
        return [self.values[index] for index in self.indices]


class IndexNode(GenflowNode):
    """
    The Node is used to retrieve a value from a list.
    """

    values: list[Any] = []
    index: int = 0

    async def process(self, context: ProcessingContext) -> Any:
        return self.values[self.index]


class AppendNode(GenflowNode):
    """
    This node adds a value to the end of a list.
    """

    values: list[Any] = []
    value: Any = None

    async def process(self, context: ProcessingContext) -> list[Any]:
        self.values.append(self.value)
        return self.values


class ExtendNode(GenflowNode):
    """
    This node is designed to extend a list with another list.
    """

    values: list[Any] = []
    other_values: list[Any] = []

    async def process(self, context: ProcessingContext) -> list[Any]:
        self.values.extend(self.other_values)
        return self.values


class DedupeNode(GenflowNode):
    """
    This node removes duplicate elements from a list.
    """

    values: list[Any] = []

    async def process(self, context: ProcessingContext) -> list[Any]:
        return list(set(self.values))


class FilterNode(GenflowNode):
    """
    This node filters a list based on a user-provided Python code string.
    """

    values: list[Any] = Field(default_factory=list, description="The list to filter.")
    condition: str = Field(
        "", description="The Python code to use as the filtering condition."
    )

    async def process(self, context: ProcessingContext) -> list[Any]:
        def safe_eval(expr: str, value: Any, index: int) -> bool:
            try:
                return eval(ast.literal_eval(expr.format(value=value, index=index)))
            except (ValueError, SyntaxError):
                return False

        return [
            value
            for (index, value) in enumerate(self.values)
            if safe_eval(self.condition, value, index)
        ]


class ReduceNode(GenflowNode):
    """
    The Reduce Node is designed to perform reduction operation on a list using user-provided Python code.
    """

    values: list[Any] = Field(default_factory=list, description="The list to reduce.")
    initial_value: Any = Field(
        None,
        description="The initial value for the reduction. If not provided, the first value in the list is used.",
    )
    reduction_code: str = Field(
        "", description="The Python code to use for the reduction."
    )

    async def process(self, context: ProcessingContext) -> Any:
        def safe_eval(expr: str, value: Any, acc: Any) -> Any:
            try:
                return eval(ast.literal_eval(expr.format(value=value, acc=acc)))
            except (ValueError, SyntaxError):
                return acc

        return reduce(
            (lambda acc, value: safe_eval(self.reduction_code, value, acc)),
            self.values,
            (
                self.initial_value
                if (self.initial_value is not None)
                else self.values[0]
            ),
        )


class MapNode(GenflowNode):
    """
    This node allows mapping of a list using user-specified Python code.

    #### Example
    Imagine you have a list of numbers and you want to create a new list where each number is multiplied by its index in the original list. You would:

    1. Provide the numbers list to the 'values' field.
    2. Write the Python code: '{value} * {index}', and feed it into the 'map_code' field.

    The MapListNode would then output a new list with each value being the original value multiplied by its index.
    """

    values: list[Any] = Field(default_factory=list, description="The list to map.")
    code: str = Field("", description="The Python code to use for the mapping.")

    async def process(self, context: ProcessingContext) -> list[Any]:
        def safe_eval(expr: str, value: Any, index: int) -> Any:
            try:
                return eval(ast.literal_eval(expr.format(value=value, index=index)))
            except (ValueError, SyntaxError):
                return value

        return [
            safe_eval(self.code, value, index)
            for (index, value) in enumerate(self.values)
        ]


class ReverseNode(GenflowNode):
    """
    This node reverses a list.
    """

    values: list[Any] = []

    async def process(self, context: ProcessingContext) -> list[Any]:
        return self.values[::(-1)]


class SaveListNode(GenflowNode):
    """
    This node saves a list to a text file.
    Each item in the list is saved on a separate line.
    """

    values: list[Any] = Field(default_factory=list, description="The list to save.")
    name: str = Field(title="Name", default="text.txt")

    async def process(self, context: ProcessingContext) -> TextRef:
        values = "\n".join([str(value) for value in self.values])
        asset, s3_uri = await context.create_asset(
            name=self.name, content_type="text/plain", content=BytesIO(values.encode())
        )
        return TextRef(uri=s3_uri, asset_id=asset.id)
