from pydantic import BaseModel, Field
import typing
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode


class Append(GraphNode):
    """
    Adds a value to the end of a list.
    list, add, insert, extend

    Use cases:
    - Grow a list dynamically
    - Add new elements to an existing list
    - Implement a stack-like structure
    """

    values: list[Any] | GraphNode | tuple[GraphNode, str] = Field(default=[], description=None)
    value: Any | GraphNode | tuple[GraphNode, str] = Field(default=None, description=None)

    @classmethod
    def get_node_type(cls): return "nodetool.list.Append"



class Average(GraphNode):
    """
    Calculates the arithmetic mean of a list of numbers.
    list, average, mean, aggregate, math

    Use cases:
    - Find average value
    - Calculate mean of numeric data
    """

    values: list[float] | GraphNode | tuple[GraphNode, str] = Field(default=[], description=None)

    @classmethod
    def get_node_type(cls): return "nodetool.list.Average"



class Chunk(GraphNode):
    """
    Splits a list into smaller chunks of specified size.
    list, chunk, split, group

    Use cases:
    - Batch processing
    - Pagination
    - Creating sublists of fixed size
    """

    values: list[Any] | GraphNode | tuple[GraphNode, str] = Field(default=[], description=None)
    chunk_size: int | GraphNode | tuple[GraphNode, str] = Field(default=1, description=None)

    @classmethod
    def get_node_type(cls): return "nodetool.list.Chunk"



class Dedupe(GraphNode):
    """
    Removes duplicate elements from a list, ensuring uniqueness.
    list, unique, distinct, deduplicate

    Use cases:
    - Remove redundant entries
    - Create a set-like structure
    - Ensure list elements are unique
    """

    values: list[Any] | GraphNode | tuple[GraphNode, str] = Field(default=[], description=None)

    @classmethod
    def get_node_type(cls): return "nodetool.list.Dedupe"



class Difference(GraphNode):
    """
    Finds elements that exist in first list but not in second list.
    list, set, difference, subtract

    Use cases:
    - Find unique elements in one list
    - Remove items present in another list
    - Identify distinct elements
    """

    list1: list[Any] | GraphNode | tuple[GraphNode, str] = Field(default=[], description=None)
    list2: list[Any] | GraphNode | tuple[GraphNode, str] = Field(default=[], description=None)

    @classmethod
    def get_node_type(cls): return "nodetool.list.Difference"



class Extend(GraphNode):
    """
    Merges one list into another, extending the original list.
    list, merge, concatenate, combine

    Use cases:
    - Combine multiple lists
    - Add all elements from one list to another
    """

    values: list[Any] | GraphNode | tuple[GraphNode, str] = Field(default=[], description=None)
    other_values: list[Any] | GraphNode | tuple[GraphNode, str] = Field(default=[], description=None)

    @classmethod
    def get_node_type(cls): return "nodetool.list.Extend"



class FilterDicts(GraphNode):
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

    values: list[dict] | GraphNode | tuple[GraphNode, str] = Field(default=[], description=None)
    condition: str | GraphNode | tuple[GraphNode, str] = Field(default='', description="\n        The filtering condition using pandas query syntax.\n\n        Basic Operators:\n        - Comparison: >, <, >=, <=, ==, !=\n        - Logical: and, or, not\n        - Membership: in, not in\n        \n        Example Conditions:\n        # Basic comparisons\n        age > 30\n        price <= 100\n        status == 'active'\n        \n        See node documentation for more examples.\n        ")

    @classmethod
    def get_node_type(cls): return "nodetool.list.FilterDicts"


import nodetool.nodes.nodetool.list

class FilterDictsByNumber(GraphNode):
    """
    Filters a list of dictionaries based on numeric values for a specified key.
    list, filter, dictionary, numbers, numeric

    Use cases:
    - Filter dictionaries by numeric comparisons (greater than, less than, equal to)
    - Filter records with even/odd numeric values
    - Filter entries with positive/negative numbers
    """

    FilterDictNumberType: typing.ClassVar[type] = nodetool.nodes.nodetool.list.FilterDictsByNumber.FilterDictNumberType
    values: list[dict] | GraphNode | tuple[GraphNode, str] = Field(default=[], description=None)
    key: str | GraphNode | tuple[GraphNode, str] = Field(default='', description=None)
    filter_type: nodetool.nodes.nodetool.list.FilterDictsByNumber.FilterDictNumberType = Field(default=FilterDictNumberType.GREATER_THAN, description=None)
    value: float | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description=None)

    @classmethod
    def get_node_type(cls): return "nodetool.list.FilterDictsByNumber"



class FilterDictsByRange(GraphNode):
    """
    Filters a list of dictionaries based on a numeric range for a specified key.
    list, filter, dictionary, range, between

    Use cases:
    - Filter records based on numeric ranges (e.g., price range, age range)
    - Find entries with values within specified bounds
    - Filter data sets based on numeric criteria
    """

    values: list[dict] | GraphNode | tuple[GraphNode, str] = Field(default=[], description=None)
    key: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The dictionary key to check for the range')
    min_value: float | GraphNode | tuple[GraphNode, str] = Field(default=0, description='The minimum value (inclusive) of the range')
    max_value: float | GraphNode | tuple[GraphNode, str] = Field(default=0, description='The maximum value (inclusive) of the range')
    inclusive: bool | GraphNode | tuple[GraphNode, str] = Field(default=True, description='If True, includes the min and max values in the results')

    @classmethod
    def get_node_type(cls): return "nodetool.list.FilterDictsByRange"


import nodetool.nodes.nodetool.list

class FilterDictsByValue(GraphNode):
    """
    Filters a list of dictionaries based on their values using various criteria.
    list, filter, dictionary, values

    Use cases:
    - Filter dictionaries by value content
    - Filter dictionaries by value type
    - Filter dictionaries by value patterns
    """

    FilterType: typing.ClassVar[type] = nodetool.nodes.nodetool.list.FilterDictsByValue.FilterType
    values: list[dict] | GraphNode | tuple[GraphNode, str] = Field(default=[], description=None)
    key: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The dictionary key to check')
    filter_type: nodetool.nodes.nodetool.list.FilterDictsByValue.FilterType = Field(default=FilterType.CONTAINS, description='The type of filter to apply')
    criteria: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The filtering criteria (text to match, type name, or length as string)')

    @classmethod
    def get_node_type(cls): return "nodetool.list.FilterDictsByValue"



class FilterDictsRegex(GraphNode):
    """
    Filters a list of dictionaries using regular expressions on specified keys.
    list, filter, regex, dictionary, pattern

    Use cases:
    - Filter dictionaries with values matching complex patterns
    - Search for dictionaries containing emails, dates, or specific formats
    - Advanced text pattern matching across dictionary values
    """

    values: list[dict] | GraphNode | tuple[GraphNode, str] = Field(default=[], description=None)
    key: str | GraphNode | tuple[GraphNode, str] = Field(default='', description=None)
    pattern: str | GraphNode | tuple[GraphNode, str] = Field(default='', description=None)
    full_match: bool | GraphNode | tuple[GraphNode, str] = Field(default=False, description=None)

    @classmethod
    def get_node_type(cls): return "nodetool.list.FilterDictsRegex"



class FilterNone(GraphNode):
    """
    Filters out None values from a list.
    list, filter, none, null

    Use cases:
    - Clean data by removing null values
    - Get only valid entries
    - Remove placeholder values
    """

    values: list[Any] | GraphNode | tuple[GraphNode, str] = Field(default=[], description=None)

    @classmethod
    def get_node_type(cls): return "nodetool.list.FilterNone"



class FilterNumberRange(GraphNode):
    """
    Filters a list of numbers to find values within a specified range.
    list, filter, numbers, range, between

    Use cases:
    - Find numbers within a specific range
    - Filter data points within bounds
    - Implement range-based filtering
    """

    values: list[float] | GraphNode | tuple[GraphNode, str] = Field(default=[], description=None)
    min_value: float | GraphNode | tuple[GraphNode, str] = Field(default=0, description=None)
    max_value: float | GraphNode | tuple[GraphNode, str] = Field(default=0, description=None)
    inclusive: bool | GraphNode | tuple[GraphNode, str] = Field(default=True, description=None)

    @classmethod
    def get_node_type(cls): return "nodetool.list.FilterNumberRange"


import nodetool.nodes.nodetool.list

class FilterNumbers(GraphNode):
    """
    Filters a list of numbers based on various numerical conditions.
    list, filter, numbers, numeric

    Use cases:
    - Filter numbers by comparison (greater than, less than, equal to)
    - Filter even/odd numbers
    - Filter positive/negative numbers
    """

    FilterNumberType: typing.ClassVar[type] = nodetool.nodes.nodetool.list.FilterNumbers.FilterNumberType
    values: list[float] | GraphNode | tuple[GraphNode, str] = Field(default=[], description=None)
    filter_type: nodetool.nodes.nodetool.list.FilterNumbers.FilterNumberType = Field(default=FilterNumberType.GREATER_THAN, description='The type of filter to apply')
    value: float | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='The comparison value (for greater_than, less_than, equal_to)')

    @classmethod
    def get_node_type(cls): return "nodetool.list.FilterNumbers"



class FilterRegex(GraphNode):
    """
    Filters a list of strings using regular expressions.
    list, filter, regex, pattern, text

    Use cases:
    - Filter strings using complex patterns
    - Extract strings matching specific formats (emails, dates, etc.)
    - Advanced text pattern matching
    """

    values: list[str] | GraphNode | tuple[GraphNode, str] = Field(default=[], description=None)
    pattern: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The regular expression pattern to match against.')
    full_match: bool | GraphNode | tuple[GraphNode, str] = Field(default=False, description='Whether to match the entire string or find pattern anywhere in string')

    @classmethod
    def get_node_type(cls): return "nodetool.list.FilterRegex"


import nodetool.nodes.nodetool.list

class FilterStrings(GraphNode):
    """
    Filters a list of strings based on various criteria.
    list, filter, strings, text

    Use cases:
    - Filter strings by length
    - Filter strings containing specific text
    - Filter strings by prefix/suffix
    - Filter strings using regex patterns
    """

    FilterType: typing.ClassVar[type] = nodetool.nodes.nodetool.list.FilterStrings.FilterType
    values: list[str] | GraphNode | tuple[GraphNode, str] = Field(default=[], description=None)
    filter_type: nodetool.nodes.nodetool.list.FilterStrings.FilterType = Field(default=FilterType.CONTAINS, description='The type of filter to apply')
    criteria: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The filtering criteria (text to match or length as string)')

    @classmethod
    def get_node_type(cls): return "nodetool.list.FilterStrings"



class Flatten(GraphNode):
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

    values: list[Any] | GraphNode | tuple[GraphNode, str] = Field(default=[], description=None)
    max_depth: int | GraphNode | tuple[GraphNode, str] = Field(default=-1, description=None)

    @classmethod
    def get_node_type(cls): return "nodetool.list.Flatten"



class GenerateSequence(GraphNode):
    """
    Generates a list of integers within a specified range.
    list, range, sequence, numbers

    Use cases:
    - Create numbered lists
    - Generate index sequences
    - Produce arithmetic progressions
    """

    start: int | GraphNode | tuple[GraphNode, str] = Field(default=0, description=None)
    stop: int | GraphNode | tuple[GraphNode, str] = Field(default=0, description=None)
    step: int | GraphNode | tuple[GraphNode, str] = Field(default=1, description=None)

    @classmethod
    def get_node_type(cls): return "nodetool.list.GenerateSequence"



class GetElement(GraphNode):
    """
    Retrieves a single value from a list at a specific index.
    list, get, extract, value

    Use cases:
    - Access a specific element by position
    - Implement array-like indexing
    - Extract the first or last element
    """

    values: list[Any] | GraphNode | tuple[GraphNode, str] = Field(default=[], description=None)
    index: int | GraphNode | tuple[GraphNode, str] = Field(default=0, description=None)

    @classmethod
    def get_node_type(cls): return "nodetool.list.GetElement"



class Intersection(GraphNode):
    """
    Finds common elements between two lists.
    list, set, intersection, common

    Use cases:
    - Find elements present in both lists
    - Identify shared items between collections
    - Filter for matching elements
    """

    list1: list[Any] | GraphNode | tuple[GraphNode, str] = Field(default=[], description=None)
    list2: list[Any] | GraphNode | tuple[GraphNode, str] = Field(default=[], description=None)

    @classmethod
    def get_node_type(cls): return "nodetool.list.Intersection"



class Length(GraphNode):
    """
    Calculates the length of a list.
    list, count, size

    Use cases:
    - Determine the number of elements in a list
    - Check if a list is empty
    - Validate list size constraints
    """

    values: list[Any] | GraphNode | tuple[GraphNode, str] = Field(default=[], description=None)

    @classmethod
    def get_node_type(cls): return "nodetool.list.Length"



class MapField(GraphNode):
    """
    Extracts a specific field from a list of dictionaries or objects.
    list, map, field, extract, pluck

    Use cases:
    - Extract specific fields from a list of objects
    - Transform complex data structures into simple lists
    - Collect values for a particular key across multiple dictionaries
    """

    values: list[dict | object] | GraphNode | tuple[GraphNode, str] = Field(default=[], description=None)
    field: str | GraphNode | tuple[GraphNode, str] = Field(default='', description=None)
    default: Any | GraphNode | tuple[GraphNode, str] = Field(default=None, description=None)

    @classmethod
    def get_node_type(cls): return "nodetool.list.MapField"



class MapTemplate(GraphNode):
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

    template: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='\n        Template string with Jinja2 placeholders for formatting\n        Examples:\n        - "Name: {{ name }}, Age: {{ age }}"\n        - "{{ title|truncate(20) }}"\n        - "{{ name|upper }}"\n        ')
    values: list[dict[str, typing.Any] | object] | GraphNode | tuple[GraphNode, str] = Field(default=[], description=None)

    @classmethod
    def get_node_type(cls): return "nodetool.list.MapTemplate"



class Maximum(GraphNode):
    """
    Finds the largest value in a list of numbers.
    list, max, maximum, aggregate, math

    Use cases:
    - Find highest value
    - Get largest number in dataset
    """

    values: list[float] | GraphNode | tuple[GraphNode, str] = Field(default=[], description=None)

    @classmethod
    def get_node_type(cls): return "nodetool.list.Maximum"



class Minimum(GraphNode):
    """
    Finds the smallest value in a list of numbers.
    list, min, minimum, aggregate, math

    Use cases:
    - Find lowest value
    - Get smallest number in dataset
    """

    values: list[float] | GraphNode | tuple[GraphNode, str] = Field(default=[], description=None)

    @classmethod
    def get_node_type(cls): return "nodetool.list.Minimum"



class Product(GraphNode):
    """
    Calculates the product of all numbers in a list.
    list, product, multiply, aggregate, math

    Use cases:
    - Multiply all numbers together
    - Calculate compound values
    """

    values: list[float] | GraphNode | tuple[GraphNode, str] = Field(default=[], description=None)

    @classmethod
    def get_node_type(cls): return "nodetool.list.Product"



class Randomize(GraphNode):
    """
    Randomly shuffles the elements of a list.
    list, shuffle, random, order

    Use cases:
    - Randomize the order of items in a playlist
    - Implement random sampling without replacement
    - Create randomized data sets for testing
    """

    values: list[Any] | GraphNode | tuple[GraphNode, str] = Field(default=[], description=None)

    @classmethod
    def get_node_type(cls): return "nodetool.list.Randomize"



class Reverse(GraphNode):
    """
    Inverts the order of elements in a list.
    list, reverse, invert, flip

    Use cases:
    - Reverse the order of a sequence
    """

    values: list[Any] | GraphNode | tuple[GraphNode, str] = Field(default=[], description=None)

    @classmethod
    def get_node_type(cls): return "nodetool.list.Reverse"



class SaveList(GraphNode):
    """
    Saves a list to a text file, placing each element on a new line.
    list, save, file, serialize

    Use cases:
    - Export list data to a file
    - Create a simple text-based database
    - Generate line-separated output
    """

    values: list[Any] | GraphNode | tuple[GraphNode, str] = Field(default=[], description=None)
    name: str | GraphNode | tuple[GraphNode, str] = Field(default='text.txt', description='\n        Name of the output file.\n        You can use time and date variables to create unique names:\n        %Y - Year\n        %m - Month\n        %d - Day\n        %H - Hour\n        %M - Minute\n        %S - Second\n        ')

    @classmethod
    def get_node_type(cls): return "nodetool.list.SaveList"



class SelectElements(GraphNode):
    """
    Selects specific values from a list using index positions.
    list, select, index, extract

    Use cases:
    - Pick specific elements by their positions
    - Rearrange list elements
    - Create a new list from selected indices
    """

    values: list[Any] | GraphNode | tuple[GraphNode, str] = Field(default=[], description=None)
    indices: list[int] | GraphNode | tuple[GraphNode, str] = Field(default=[], description=None)

    @classmethod
    def get_node_type(cls): return "nodetool.list.SelectElements"



class Slice(GraphNode):
    """
    Extracts a subset from a list using start, stop, and step indices.
    list, slice, subset, extract

    Use cases:
    - Get a portion of a list
    - Implement pagination
    - Extract every nth element
    """

    values: list[Any] | GraphNode | tuple[GraphNode, str] = Field(default=[], description=None)
    start: int | GraphNode | tuple[GraphNode, str] = Field(default=0, description=None)
    stop: int | GraphNode | tuple[GraphNode, str] = Field(default=0, description=None)
    step: int | GraphNode | tuple[GraphNode, str] = Field(default=1, description=None)

    @classmethod
    def get_node_type(cls): return "nodetool.list.Slice"


import nodetool.nodes.nodetool.list

class Sort(GraphNode):
    """
    Sorts the elements of a list in ascending or descending order.
    list, sort, order, arrange

    Use cases:
    - Organize data in a specific order
    - Prepare data for binary search or other algorithms
    - Rank items based on their values
    """

    SortOrder: typing.ClassVar[type] = nodetool.nodes.nodetool.list.Sort.SortOrder
    values: list[Any] | GraphNode | tuple[GraphNode, str] = Field(default=[], description=None)
    order: nodetool.nodes.nodetool.list.Sort.SortOrder = Field(default=SortOrder.ASCENDING, description=None)

    @classmethod
    def get_node_type(cls): return "nodetool.list.Sort"



class Sum(GraphNode):
    """
    Calculates the sum of a list of numbers.
    list, sum, aggregate, math

    Use cases:
    - Calculate total of numeric values
    - Add up all elements in a list
    """

    values: list[float] | GraphNode | tuple[GraphNode, str] = Field(default=[], description=None)

    @classmethod
    def get_node_type(cls): return "nodetool.list.Sum"


import nodetool.nodes.nodetool.list

class Transform(GraphNode):
    """
    Applies a transformation to each element in a list.
    list, transform, map, convert

    Use cases:
    - Convert types (str to int, etc.)
    - Apply formatting
    - Mathematical operations
    """

    TransformType: typing.ClassVar[type] = nodetool.nodes.nodetool.list.Transform.TransformType
    values: list[Any] | GraphNode | tuple[GraphNode, str] = Field(default=[], description=None)
    transform_type: nodetool.nodes.nodetool.list.Transform.TransformType = Field(default=TransformType.TO_STRING, description=None)

    @classmethod
    def get_node_type(cls): return "nodetool.list.Transform"



class Union(GraphNode):
    """
    Combines unique elements from two lists.
    list, set, union, combine

    Use cases:
    - Merge lists while removing duplicates
    - Combine collections uniquely
    - Create comprehensive set of items
    """

    list1: list[Any] | GraphNode | tuple[GraphNode, str] = Field(default=[], description=None)
    list2: list[Any] | GraphNode | tuple[GraphNode, str] = Field(default=[], description=None)

    @classmethod
    def get_node_type(cls): return "nodetool.list.Union"


