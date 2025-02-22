from datetime import datetime
from enum import Enum
from functools import reduce
from io import BytesIO
import random
from pydantic import BaseModel, Field
from nodetool.metadata.types import TextRef
from nodetool.workflows.processing_context import ProcessingContext
from nodetool.workflows.base_node import BaseNode
from typing import Any
import pandas as pd


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

    values: list[Any] = Field(default=[])
    start: int = Field(default=0)
    stop: int = Field(default=0)
    step: int = Field(default=1)

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

    values: list[Any] = Field(default=[])
    indices: list[int] = Field(default=[])

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

    values: list[Any] = Field(default=[])
    index: int = Field(default=0)

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

    values: list[Any] = Field(default=[])
    name: str = Field(
        title="Name",
        default="text.txt",
        description="""
        Name of the output file.
        You can use time and date variables to create unique names:
        %Y - Year
        %m - Month
        %d - Day
        %H - Hour
        %M - Minute
        %S - Second
        """,
    )

    def required_inputs(self):
        return ["values"]

    async def process(self, context: ProcessingContext) -> TextRef:
        values = "\n".join([str(value) for value in self.values])
        filename = datetime.now().strftime(self.name)
        asset = await context.create_asset(
            name=filename, content_type="text/plain", content=BytesIO(values.encode())
        )
        return TextRef(uri=asset.get_url or "", asset_id=asset.id)


class Randomize(BaseNode):
    """
    Randomly shuffles the elements of a list.
    list, shuffle, random, order

    Use cases:
    - Randomize the order of items in a playlist
    - Implement random sampling without replacement
    - Create randomized data sets for testing
    """

    values: list[Any] = []

    async def process(self, context: ProcessingContext) -> list[Any]:
        shuffled = self.values.copy()
        random.shuffle(shuffled)
        return shuffled


class Sort(BaseNode):
    """
    Sorts the elements of a list in ascending or descending order.
    list, sort, order, arrange

    Use cases:
    - Organize data in a specific order
    - Prepare data for binary search or other algorithms
    - Rank items based on their values
    """

    class SortOrder(str, Enum):
        ASCENDING = "ascending"
        DESCENDING = "descending"

    values: list[Any] = []
    order: SortOrder = SortOrder.ASCENDING

    async def process(self, context: ProcessingContext) -> list[Any]:
        return sorted(self.values, reverse=(self.order == self.SortOrder.DESCENDING))


class FilterDicts(BaseNode):
    """
    Filter a list of dictionaries based on a condition.
    list, filter, query, condition

    Basic Operators:
    - Comparison: >, <, >=, <=, ==, !=
    - Logical: and, or, not
    - Membership: in, not in

    Example Conditions:
    # Basic comparisons
    age > 30
    price <= 100
    status == 'active'

    # Multiple conditions
    age > 30 and salary < 50000
    (price >= 100) and (price <= 200)
    department in ['Sales', 'Marketing']

    # String operations
    name.str.startswith('J')
    email.str.contains('@company.com')

    # Datetime conditions
    date > '2024-01-01'
    date.dt.year == 2024
    date.dt.month >= 6
    date.dt.day_name() == 'Monday'

    # Date ranges
    date.between('2024-01-01', '2024-12-31')
    date >= '2024-01-01' and date < '2025-01-01'

    # Complex datetime
    date.dt.hour < 12
    date.dt.dayofweek <= 4  # Weekdays only

    # Numeric operations
    price.between(100, 200)
    quantity % 2 == 0  # Even numbers

    # Special values
    value.isna()  # Check for NULL/NaN
    value.notna()  # Check for non-NULL/non-NaN

    Note: Dates should be in ISO format (YYYY-MM-DD) or include time (YYYY-MM-DD HH:MM:SS)

    Use cases:
    - Filter list of dictionary objects based on criteria
    - Extract subset of data meeting specific conditions
    - Clean data by removing unwanted entries
    """

    values: list[dict] = Field(default=[])
    condition: str = Field(
        default="",
        description="""
        The filtering condition using pandas query syntax.

        Basic Operators:
        - Comparison: >, <, >=, <=, ==, !=
        - Logical: and, or, not
        - Membership: in, not in
        
        Example Conditions:
        # Basic comparisons
        age > 30
        price <= 100
        status == 'active'
        
        See node documentation for more examples.
        """,
    )

    async def process(self, context: ProcessingContext) -> list[dict]:
        # check for valid list of dicts
        if not isinstance(self.values, list) or not all(
            isinstance(item, dict) for item in self.values
        ):
            raise ValueError("Input must be a list of dictionaries.")

        # Convert list of dicts to pandas DataFrame for consistent query handling
        df = pd.DataFrame(self.values)
        filtered_df = df.query(self.condition)
        # Convert back to list of dicts
        return filtered_df.to_dict("records")


class FilterStrings(BaseNode):
    """
    Filters a list of strings based on various criteria.
    list, filter, strings, text

    Use cases:
    - Filter strings by length
    - Filter strings containing specific text
    - Filter strings by prefix/suffix
    - Filter strings using regex patterns
    """

    class FilterType(str, Enum):
        CONTAINS = "contains"
        STARTS_WITH = "starts_with"
        ENDS_WITH = "ends_with"
        LENGTH_GREATER = "length_greater"
        LENGTH_LESS = "length_less"
        EXACT_LENGTH = "exact_length"

    values: list[str] = Field(default=[])
    filter_type: FilterType = Field(
        default=FilterType.CONTAINS, description="The type of filter to apply"
    )
    criteria: str = Field(
        default="",
        description="The filtering criteria (text to match or length as string)",
    )

    async def process(self, context: ProcessingContext) -> list[str]:
        if not isinstance(self.values, list) or not all(
            isinstance(item, str) for item in self.values
        ):
            raise ValueError("Input must be a list of strings")

        if self.filter_type in [
            self.FilterType.LENGTH_GREATER,
            self.FilterType.LENGTH_LESS,
            self.FilterType.EXACT_LENGTH,
        ]:
            try:
                length_criteria = int(self.criteria)
            except ValueError:
                raise ValueError("Length criteria must be a valid integer")

        filtered = []
        for item in self.values:
            if self.filter_type == self.FilterType.CONTAINS:
                if self.criteria in item:
                    filtered.append(item)
            elif self.filter_type == self.FilterType.STARTS_WITH:
                if item.startswith(self.criteria):
                    filtered.append(item)
            elif self.filter_type == self.FilterType.ENDS_WITH:
                if item.endswith(self.criteria):
                    filtered.append(item)
            elif self.filter_type == self.FilterType.LENGTH_GREATER:
                if len(item) > length_criteria:
                    filtered.append(item)
            elif self.filter_type == self.FilterType.LENGTH_LESS:
                if len(item) < length_criteria:
                    filtered.append(item)
            elif self.filter_type == self.FilterType.EXACT_LENGTH:
                if len(item) == length_criteria:
                    filtered.append(item)

        return filtered


class FilterNumbers(BaseNode):
    """
    Filters a list of numbers based on various numerical conditions.
    list, filter, numbers, numeric

    Use cases:
    - Filter numbers by comparison (greater than, less than, equal to)
    - Filter even/odd numbers
    - Filter positive/negative numbers
    """

    class FilterNumberType(str, Enum):
        GREATER_THAN = "greater_than"
        LESS_THAN = "less_than"
        EQUAL_TO = "equal_to"
        EVEN = "even"
        ODD = "odd"
        POSITIVE = "positive"
        NEGATIVE = "negative"

    values: list[float] = Field(default=[])
    filter_type: FilterNumberType = Field(
        default=FilterNumberType.GREATER_THAN, description="The type of filter to apply"
    )
    value: float | None = Field(
        default=None,
        description="The comparison value (for greater_than, less_than, equal_to)",
    )

    async def process(self, context: ProcessingContext) -> list[float]:
        if not isinstance(self.values, list) or not all(
            isinstance(item, (int, float)) for item in self.values
        ):
            raise ValueError("Input must be a list of numbers")

        filtered = []
        for item in self.values:
            if self.filter_type == self.FilterNumberType.GREATER_THAN:
                if self.value is None:
                    raise ValueError("Value must be specified for greater_than filter")
                if item > self.value:
                    filtered.append(item)
            elif self.filter_type == self.FilterNumberType.LESS_THAN:
                if self.value is None:
                    raise ValueError("Value must be specified for less_than filter")
                if item < self.value:
                    filtered.append(item)
            elif self.filter_type == self.FilterNumberType.EQUAL_TO:
                if self.value is None:
                    raise ValueError("Value must be specified for equal_to filter")
                if item == self.value:
                    filtered.append(item)
            elif self.filter_type == self.FilterNumberType.EVEN:
                if isinstance(item, int) and item % 2 == 0:
                    filtered.append(item)
            elif self.filter_type == self.FilterNumberType.ODD:
                if isinstance(item, int) and item % 2 != 0:
                    filtered.append(item)
            elif self.filter_type == self.FilterNumberType.POSITIVE:
                if item > 0:
                    filtered.append(item)
            elif self.filter_type == self.FilterNumberType.NEGATIVE:
                if item < 0:
                    filtered.append(item)

        return filtered


class FilterNumberRange(BaseNode):
    """
    Filters a list of numbers to find values within a specified range.
    list, filter, numbers, range, between

    Use cases:
    - Find numbers within a specific range
    - Filter data points within bounds
    - Implement range-based filtering
    """

    values: list[float] = Field(default=[])
    min_value: float = Field(default=0)
    max_value: float = Field(default=0)
    inclusive: bool = Field(default=True)

    async def process(self, context: ProcessingContext) -> list[float]:
        if not isinstance(self.values, list) or not all(
            isinstance(item, (int, float)) for item in self.values
        ):
            raise ValueError("Input must be a list of numbers")

        if self.inclusive:
            return [x for x in self.values if self.min_value <= x <= self.max_value]
        else:
            return [x for x in self.values if self.min_value < x < self.max_value]


class FilterRegex(BaseNode):
    """
    Filters a list of strings using regular expressions.
    list, filter, regex, pattern, text

    Use cases:
    - Filter strings using complex patterns
    - Extract strings matching specific formats (emails, dates, etc.)
    - Advanced text pattern matching
    """

    values: list[str] = Field(default=[])
    pattern: str = Field(
        default="", description="The regular expression pattern to match against."
    )
    full_match: bool = Field(
        default=False,
        description="Whether to match the entire string or find pattern anywhere in string",
    )

    async def process(self, context: ProcessingContext) -> list[str]:
        if not isinstance(self.values, list) or not all(
            isinstance(item, str) for item in self.values
        ):
            raise ValueError("Input must be a list of strings")

        import re

        try:
            regex = re.compile(self.pattern)
        except re.error as e:
            raise ValueError(f"Invalid regular expression pattern: {e}")

        filtered = []
        for item in self.values:
            if self.full_match:
                if regex.fullmatch(item):
                    filtered.append(item)
            else:  # partial match
                if regex.search(item):
                    filtered.append(item)

        return filtered


class FilterNone(BaseNode):
    """
    Filters out None values from a list.
    list, filter, none, null

    Use cases:
    - Clean data by removing null values
    - Get only valid entries
    - Remove placeholder values
    """

    values: list[Any] = Field(default=[])

    async def process(self, context: ProcessingContext) -> list[Any]:
        return [x for x in self.values if x is not None]


class FilterDictsByValue(BaseNode):
    """
    Filters a list of dictionaries based on their values using various criteria.
    list, filter, dictionary, values

    Use cases:
    - Filter dictionaries by value content
    - Filter dictionaries by value type
    - Filter dictionaries by value patterns
    """

    class FilterType(str, Enum):
        CONTAINS = "contains"
        STARTS_WITH = "starts_with"
        ENDS_WITH = "ends_with"
        EQUALS = "equals"
        TYPE_IS = "type_is"
        LENGTH_GREATER = "length_greater"
        LENGTH_LESS = "length_less"
        EXACT_LENGTH = "exact_length"

    values: list[dict] = Field(default=[])
    key: str = Field(default="", description="The dictionary key to check")
    filter_type: FilterType = Field(
        default=FilterType.CONTAINS, description="The type of filter to apply"
    )
    criteria: str = Field(
        default="",
        description="The filtering criteria (text to match, type name, or length as string)",
    )

    async def process(self, context: ProcessingContext) -> list[dict]:
        if not isinstance(self.values, list) or not all(
            isinstance(item, dict) for item in self.values
        ):
            raise ValueError("Input must be a list of dictionaries")

        if self.filter_type in [
            self.FilterType.LENGTH_GREATER,
            self.FilterType.LENGTH_LESS,
            self.FilterType.EXACT_LENGTH,
        ]:
            try:
                length_criteria = int(self.criteria)
            except ValueError:
                raise ValueError("Length criteria must be a valid integer")

        filtered = []
        for item in self.values:
            if self.key not in item:
                continue

            value = item[self.key]
            value_str = str(value)

            if self.filter_type == self.FilterType.CONTAINS:
                if self.criteria in value_str:
                    filtered.append(item)
            elif self.filter_type == self.FilterType.STARTS_WITH:
                if value_str.startswith(self.criteria):
                    filtered.append(item)
            elif self.filter_type == self.FilterType.ENDS_WITH:
                if value_str.endswith(self.criteria):
                    filtered.append(item)
            elif self.filter_type == self.FilterType.EQUALS:
                if value_str == self.criteria:
                    filtered.append(item)
            elif self.filter_type == self.FilterType.TYPE_IS:
                if type(value).__name__ == self.criteria:
                    filtered.append(item)
            elif self.filter_type == self.FilterType.LENGTH_GREATER:
                if hasattr(value, "__len__") and len(value) > length_criteria:
                    filtered.append(item)
            elif self.filter_type == self.FilterType.LENGTH_LESS:
                if hasattr(value, "__len__") and len(value) < length_criteria:
                    filtered.append(item)
            elif self.filter_type == self.FilterType.EXACT_LENGTH:
                if hasattr(value, "__len__") and len(value) == length_criteria:
                    filtered.append(item)

        return filtered


class FilterDictsByRange(BaseNode):
    """
    Filters a list of dictionaries based on a numeric range for a specified key.
    list, filter, dictionary, range, between

    Use cases:
    - Filter records based on numeric ranges (e.g., price range, age range)
    - Find entries with values within specified bounds
    - Filter data sets based on numeric criteria
    """

    values: list[dict] = Field(default=[])
    key: str = Field(
        default="", description="The dictionary key to check for the range"
    )
    min_value: float = Field(
        default=0, description="The minimum value (inclusive) of the range"
    )
    max_value: float = Field(
        default=0, description="The maximum value (inclusive) of the range"
    )
    inclusive: bool = Field(
        default=True,
        description="If True, includes the min and max values in the results",
    )

    async def process(self, context: ProcessingContext) -> list[dict]:
        if not isinstance(self.values, list) or not all(
            isinstance(item, dict) for item in self.values
        ):
            raise ValueError("Input must be a list of dictionaries")

        filtered = []
        for item in self.values:
            if self.key not in item:
                continue

            value = item[self.key]
            if not isinstance(value, (int, float)):
                continue

            if self.inclusive:
                if self.min_value <= value <= self.max_value:
                    filtered.append(item)
            else:
                if self.min_value < value < self.max_value:
                    filtered.append(item)

        return filtered


class FilterDictsByNumber(BaseNode):
    """
    Filters a list of dictionaries based on numeric values for a specified key.
    list, filter, dictionary, numbers, numeric

    Use cases:
    - Filter dictionaries by numeric comparisons (greater than, less than, equal to)
    - Filter records with even/odd numeric values
    - Filter entries with positive/negative numbers
    """

    class FilterDictNumberType(str, Enum):
        GREATER_THAN = "greater_than"
        LESS_THAN = "less_than"
        EQUAL_TO = "equal_to"
        EVEN = "even"
        ODD = "odd"
        POSITIVE = "positive"
        NEGATIVE = "negative"

    values: list[dict] = Field(default=[])
    key: str = Field(default="")
    filter_type: FilterDictNumberType = Field(default=FilterDictNumberType.GREATER_THAN)
    value: float | None = Field(default=None)

    async def process(self, context: ProcessingContext) -> list[dict]:
        if not isinstance(self.values, list) or not all(
            isinstance(item, dict) for item in self.values
        ):
            raise ValueError("Input must be a list of dictionaries")

        filtered = []
        for item in self.values:
            if self.key not in item:
                continue

            num = item[self.key]
            if not isinstance(num, (int, float)):
                continue

            if self.filter_type == self.FilterDictNumberType.GREATER_THAN:
                if self.value is None:
                    raise ValueError("Value must be specified for greater_than filter")
                if num > self.value:
                    filtered.append(item)
            elif self.filter_type == self.FilterDictNumberType.LESS_THAN:
                if self.value is None:
                    raise ValueError("Value must be specified for less_than filter")
                if num < self.value:
                    filtered.append(item)
            elif self.filter_type == self.FilterDictNumberType.EQUAL_TO:
                if self.value is None:
                    raise ValueError("Value must be specified for equal_to filter")
                if num == self.value:
                    filtered.append(item)
            elif self.filter_type == self.FilterDictNumberType.EVEN:
                if isinstance(num, int) and num % 2 == 0:
                    filtered.append(item)
            elif self.filter_type == self.FilterDictNumberType.ODD:
                if isinstance(num, int) and num % 2 != 0:
                    filtered.append(item)
            elif self.filter_type == self.FilterDictNumberType.POSITIVE:
                if num > 0:
                    filtered.append(item)
            elif self.filter_type == self.FilterDictNumberType.NEGATIVE:
                if num < 0:
                    filtered.append(item)

        return filtered


class FilterDictsRegex(BaseNode):
    """
    Filters a list of dictionaries using regular expressions on specified keys.
    list, filter, regex, dictionary, pattern

    Use cases:
    - Filter dictionaries with values matching complex patterns
    - Search for dictionaries containing emails, dates, or specific formats
    - Advanced text pattern matching across dictionary values
    """

    values: list[dict] = Field(default=[])
    key: str = Field(default="")
    pattern: str = Field(default="")
    full_match: bool = Field(default=False)

    async def process(self, context: ProcessingContext) -> list[dict]:
        if not isinstance(self.values, list) or not all(
            isinstance(item, dict) for item in self.values
        ):
            raise ValueError("Input must be a list of dictionaries")

        import re

        try:
            regex = re.compile(self.pattern)
        except re.error as e:
            raise ValueError(f"Invalid regular expression pattern: {e}")

        filtered = []
        for item in self.values:
            if self.key not in item:
                continue

            value = str(item[self.key])

            if self.full_match:
                if regex.fullmatch(value):
                    filtered.append(item)
            else:  # partial match
                if regex.search(value):
                    filtered.append(item)

        return filtered


class Intersection(BaseNode):
    """
    Finds common elements between two lists.
    list, set, intersection, common

    Use cases:
    - Find elements present in both lists
    - Identify shared items between collections
    - Filter for matching elements
    """

    list1: list[Any] = Field(default=[])
    list2: list[Any] = Field(default=[])

    async def process(self, context: ProcessingContext) -> list[Any]:
        return list(set(self.list1).intersection(set(self.list2)))


class Union(BaseNode):
    """
    Combines unique elements from two lists.
    list, set, union, combine

    Use cases:
    - Merge lists while removing duplicates
    - Combine collections uniquely
    - Create comprehensive set of items
    """

    list1: list[Any] = Field(default=[])
    list2: list[Any] = Field(default=[])

    async def process(self, context: ProcessingContext) -> list[Any]:
        return list(set(self.list1).union(set(self.list2)))


class Difference(BaseNode):
    """
    Finds elements that exist in first list but not in second list.
    list, set, difference, subtract

    Use cases:
    - Find unique elements in one list
    - Remove items present in another list
    - Identify distinct elements
    """

    list1: list[Any] = Field(default=[])
    list2: list[Any] = Field(default=[])

    async def process(self, context: ProcessingContext) -> list[Any]:
        return list(set(self.list1).difference(set(self.list2)))


class Chunk(BaseNode):
    """
    Splits a list into smaller chunks of specified size.
    list, chunk, split, group

    Use cases:
    - Batch processing
    - Pagination
    - Creating sublists of fixed size
    """

    values: list[Any] = Field(default=[])
    chunk_size: int = Field(default=1, gt=0)

    async def process(self, context: ProcessingContext) -> list[list[Any]]:
        return [
            self.values[i : i + self.chunk_size]
            for i in range(0, len(self.values), self.chunk_size)
        ]


class Transform(BaseNode):
    """
    Applies a transformation to each element in a list.
    list, transform, map, convert

    Use cases:
    - Convert types (str to int, etc.)
    - Apply formatting
    - Mathematical operations
    """

    class TransformType(str, Enum):
        TO_INT = "to_int"
        TO_FLOAT = "to_float"
        TO_STRING = "to_string"
        UPPERCASE = "uppercase"
        LOWERCASE = "lowercase"
        STRIP = "strip"

    values: list[Any] = Field(default=[])
    transform_type: TransformType = Field(default=TransformType.TO_STRING)

    async def process(self, context: ProcessingContext) -> list[Any]:
        try:
            if self.transform_type == self.TransformType.TO_INT:
                return [int(x) for x in self.values]
            elif self.transform_type == self.TransformType.TO_FLOAT:
                return [float(x) for x in self.values]
            elif self.transform_type == self.TransformType.TO_STRING:
                return [str(x) for x in self.values]
            elif self.transform_type == self.TransformType.UPPERCASE:
                return [str(x).upper() for x in self.values]
            elif self.transform_type == self.TransformType.LOWERCASE:
                return [str(x).lower() for x in self.values]
            else:  # STRIP
                return [str(x).strip() for x in self.values]
        except (ValueError, TypeError) as e:
            raise ValueError(f"Transform failed: {str(e)}")


class Sum(BaseNode):
    """
    Calculates the sum of a list of numbers.
    list, sum, aggregate, math

    Use cases:
    - Calculate total of numeric values
    - Add up all elements in a list
    """

    values: list[float] = Field(default=[])

    async def process(self, context: ProcessingContext) -> float:
        if not self.values:
            raise ValueError("Cannot sum empty list")
        if not all(isinstance(x, (int, float)) for x in self.values):
            raise ValueError("All values must be numbers")
        return sum(self.values)


class Average(BaseNode):
    """
    Calculates the arithmetic mean of a list of numbers.
    list, average, mean, aggregate, math

    Use cases:
    - Find average value
    - Calculate mean of numeric data
    """

    values: list[float] = Field(default=[])

    async def process(self, context: ProcessingContext) -> float:
        if not self.values:
            raise ValueError("Cannot average empty list")
        if not all(isinstance(x, (int, float)) for x in self.values):
            raise ValueError("All values must be numbers")
        return sum(self.values) / len(self.values)


class Minimum(BaseNode):
    """
    Finds the smallest value in a list of numbers.
    list, min, minimum, aggregate, math

    Use cases:
    - Find lowest value
    - Get smallest number in dataset
    """

    values: list[float] = Field(default=[])

    async def process(self, context: ProcessingContext) -> float:
        if not self.values:
            raise ValueError("Cannot find minimum of empty list")
        if not all(isinstance(x, (int, float)) for x in self.values):
            raise ValueError("All values must be numbers")
        return min(self.values)


class Maximum(BaseNode):
    """
    Finds the largest value in a list of numbers.
    list, max, maximum, aggregate, math

    Use cases:
    - Find highest value
    - Get largest number in dataset
    """

    values: list[float] = Field(default=[])

    async def process(self, context: ProcessingContext) -> float:
        if not self.values:
            raise ValueError("Cannot find maximum of empty list")
        if not all(isinstance(x, (int, float)) for x in self.values):
            raise ValueError("All values must be numbers")
        return max(self.values)


class Product(BaseNode):
    """
    Calculates the product of all numbers in a list.
    list, product, multiply, aggregate, math

    Use cases:
    - Multiply all numbers together
    - Calculate compound values
    """

    values: list[float] = Field(default=[])

    async def process(self, context: ProcessingContext) -> float:
        if not self.values:
            raise ValueError("Cannot calculate product of empty list")
        if not all(isinstance(x, (int, float)) for x in self.values):
            raise ValueError("All values must be numbers")
        return reduce(lambda x, y: x * y, self.values)


class MapField(BaseNode):
    """
    Extracts a specific field from a list of dictionaries or objects.
    list, map, field, extract, pluck

    Use cases:
    - Extract specific fields from a list of objects
    - Transform complex data structures into simple lists
    - Collect values for a particular key across multiple dictionaries
    """

    values: list[dict | object] = Field(default=[])
    field: str = Field(default="")
    default: Any = Field(default=None)

    async def process(self, context: ProcessingContext) -> list[Any]:
        if not isinstance(self.values, list) or not all(
            isinstance(item, (dict, object)) for item in self.values
        ):
            raise ValueError("Input must be a list of dictionaries or objects")

        def get_value(item: dict | object) -> Any:
            if isinstance(item, dict):
                return item.get(self.field, self.default)
            elif isinstance(item, object):
                return getattr(item, self.field, self.default)
            return self.default

        return [get_value(item) for item in self.values]


class MapTemplate(BaseNode):
    """
    Maps a template string over a list of dictionaries or objects using Jinja2 templating.
    list, template, map, formatting

    Use cases:
    - Formatting multiple records into strings
    - Generating text from structured data
    - Creating text representations of data collections

    Examples:
    - template: "Name: {{ name }}, Age: {{ age }}"
      values: [{"name": "Alice", "age": 30}, {"name": "Bob", "age": 25}]
      -> ["Name: Alice, Age: 30", "Name: Bob, Age: 25"]

    Available filters:
    - truncate(length): Truncates text to given length
    - upper: Converts text to uppercase
    - lower: Converts text to lowercase
    - title: Converts text to title case
    - trim: Removes whitespace from start/end
    - replace(old, new): Replaces substring
    - default(value): Sets default if value is undefined
    - first: Gets first character/item
    - last: Gets last character/item
    - length: Gets length of string/list
    - sort: Sorts list
    - join(delimiter): Joins list with delimiter
    """

    template: str = Field(
        default="",
        description="""
        Template string with Jinja2 placeholders for formatting
        Examples:
        - "Name: {{ name }}, Age: {{ age }}"
        - "{{ title|truncate(20) }}"
        - "{{ name|upper }}"
        """,
    )
    values: list[dict[str, Any] | object] = Field(default=[])

    async def process(self, context: ProcessingContext) -> list[str]:
        from jinja2 import Environment, BaseLoader

        if not self.values:
            return []

        # Create Jinja2 environment
        env = Environment(loader=BaseLoader())
        template = env.from_string(self.template)

        results = []
        for item in self.values:
            try:
                if isinstance(item, dict):
                    results.append(template.render(**item))
                elif isinstance(item, object):
                    # Convert object attributes to dict
                    item_dict = {
                        attr: getattr(item, attr)
                        for attr in dir(item)
                        if not attr.startswith("_")
                    }
                    results.append(template.render(**item_dict))
            except Exception as e:
                # Skip items that don't match the template
                continue

        return results


class Flatten(BaseNode):
    """
    Flattens a nested list structure into a single flat list.
    list, flatten, nested, structure

    Use cases:
    - Convert nested lists into a single flat list
    - Simplify complex list structures
    - Process hierarchical data as a sequence

    Examples:
    [[1, 2], [3, 4]] -> [1, 2, 3, 4]
    [[1, [2, 3]], [4, [5, 6]]] -> [1, 2, 3, 4, 5, 6]
    """

    values: list[Any] = Field(default=[])
    max_depth: int = Field(default=-1, ge=-1)

    def _flatten(self, lst: list[Any], current_depth: int = 0) -> list[Any]:
        result = []
        for item in lst:
            if isinstance(item, list) and (
                self.max_depth == -1 or current_depth < self.max_depth
            ):
                result.extend(self._flatten(item, current_depth + 1))
            else:
                result.append(item)
        return result

    async def process(self, context: ProcessingContext) -> list[Any]:
        if not isinstance(self.values, list):
            raise ValueError("Input must be a list")
        return self._flatten(self.values)
