import ast
from enum import Enum
from functools import reduce
from io import BytesIO, StringIO
from pydantic import Field
from nodetool.metadata.types import TextRef
from nodetool.workflows.processing_context import ProcessingContext
from nodetool.workflows.base_node import BaseNode
from typing import Any, Literal


class Length(BaseNode):
    """
    Calculates the length of a list.
    list, count, size

    Use cases:
    - Determine the number of elements in a list
    - Check if a list is empty
    - Validate list size constraints
    """

    values: list[Any] = []

    async def process(self, context: ProcessingContext) -> int:
        return len(self.values)


class GenerateSequence(BaseNode):
    """
    Generates a list of integers within a specified range.
    list, range, sequence, numbers

    Use cases:
    - Create numbered lists
    - Generate index sequences
    - Produce arithmetic progressions
    """

    start: int = 0
    stop: int = 0
    step: int = 1

    async def process(self, context: ProcessingContext) -> list[int]:
        return list(range(self.start, self.stop, self.step))


class Slice(BaseNode):
    """
    Extracts a subset from a list using start, stop, and step indices.
    list, slice, subset, extract

    Use cases:
    - Get a portion of a list
    - Implement pagination
    - Extract every nth element
    """

    values: list[Any] = []
    start: int = 0
    stop: int = 0
    step: int = 1

    async def process(self, context: ProcessingContext) -> list[Any]:
        return self.values[self.start : self.stop : self.step]


class SelectElements(BaseNode):
    """
    Selects specific values from a list using index positions.
    list, select, index, extract

    Use cases:
    - Pick specific elements by their positions
    - Rearrange list elements
    - Create a new list from selected indices
    """

    values: list[Any] = []
    indices: list[int] = []

    async def process(self, context: ProcessingContext) -> list[Any]:
        return [self.values[index] for index in self.indices]


class GetElement(BaseNode):
    """
    Retrieves a single value from a list at a specific index.
    list, get, extract, value

    Use cases:
    - Access a specific element by position
    - Implement array-like indexing
    - Extract the first or last element
    """

    values: list[Any] = []
    index: int = 0

    async def process(self, context: ProcessingContext) -> Any:
        return self.values[self.index]


class Append(BaseNode):
    """
    Adds a value to the end of a list.
    list, add, insert, extend

    Use cases:
    - Grow a list dynamically
    - Add new elements to an existing list
    - Implement a stack-like structure
    """

    values: list[Any] = []
    value: Any = None

    async def process(self, context: ProcessingContext) -> list[Any]:
        self.values.append(self.value)
        return self.values


class Extend(BaseNode):
    """
    Merges one list into another, extending the original list.
    list, merge, concatenate, combine

    Use cases:
    - Combine multiple lists
    - Add all elements from one list to another
    """

    values: list[Any] = []
    other_values: list[Any] = []

    async def process(self, context: ProcessingContext) -> list[Any]:
        self.values.extend(self.other_values)
        return self.values


class Dedupe(BaseNode):
    """
    Removes duplicate elements from a list, ensuring uniqueness.
    list, unique, distinct, deduplicate

    Use cases:
    - Remove redundant entries
    - Create a set-like structure
    - Ensure list elements are unique
    """

    values: list[Any] = []

    async def process(self, context: ProcessingContext) -> list[Any]:
        return list(set(self.values))


class Filter(BaseNode):
    """
    Filters a list based on a custom Python condition.
    list, filter, condition, select

    Use cases:
    - Remove elements that don't meet a condition
    - Select elements based on complex criteria
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


class Reduce(BaseNode):
    """
    Performs a custom reduction operation on a list using Python code.
    list, reduce, aggregate, accumulate

    Use cases:
    - Calculate a sum or product of list elements
    - Find the maximum or minimum value
    - Implement custom aggregation logic

    Example reduction code:
    ```python
    {acc} + {value}
    ```

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


class TransformElements(BaseNode):
    """
    Transforms each element in a list based on custom Python code.
    list, transform, modify, apply

    Use cases:
    - Apply a function to every list element
    - Convert data types within a list
    - Perform calculations on each element

    Example mapping code:
    {value} * 100
    """

    values: list[Any] = Field(default_factory=list, description="The list to map.")
    code: str = Field("", description="Python code to use for mapping.")

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


class Reverse(BaseNode):
    """
    Inverts the order of elements in a list.
    list, reverse, invert, flip

    Use cases:
    - Reverse the order of a sequence
    """

    values: list[Any] = []

    async def process(self, context: ProcessingContext) -> list[Any]:
        return self.values[::(-1)]


class SaveList(BaseNode):
    """
    Saves a list to a text file, placing each element on a new line.
    list, save, file, serialize

    Use cases:
    - Export list data to a file
    - Create a simple text-based database
    - Generate line-separated output
    """

    values: list[Any] = Field(default_factory=list, description="The list to save.")
    name: str = Field(title="Name", default="text.txt")

    async def process(self, context: ProcessingContext) -> TextRef:
        values = "\n".join([str(value) for value in self.values])
        asset = await context.create_asset(
            name=self.name, content_type="text/plain", content=BytesIO(values.encode())
        )
        return TextRef(uri=asset.get_url or "", asset_id=asset.id)
