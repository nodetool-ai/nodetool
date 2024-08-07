# nodetool.nodes.nodetool.list

## Append

Adds a value to the end of a list.

Use cases:
- Grow a list dynamically
- Add new elements to an existing list
- Implement a stack-like structure

**Tags:** list, add, insert, extend

- **values** (list)
- **value** (typing.Any)

## Dedupe

Removes duplicate elements from a list, ensuring uniqueness.

Use cases:
- Remove redundant entries
- Create a set-like structure
- Ensure list elements are unique

**Tags:** list, unique, distinct, deduplicate

- **values** (list)

## Extend

Merges one list into another, extending the original list.

Use cases:
- Combine multiple lists
- Add all elements from one list to another

**Tags:** list, merge, concatenate, combine

- **values** (list)
- **other_values** (list)

## Filter

Filters a list based on a custom Python condition.

Use cases:
- Remove elements that don't meet a condition
- Select elements based on complex criteria

**Tags:** list, filter, condition, select

- **values**: The list to filter. (list)
- **condition**: The Python code to use as the filtering condition. (str)

## GenerateSequence

Generates a list of integers within a specified range.

Use cases:
- Create numbered lists
- Generate index sequences
- Produce arithmetic progressions

**Tags:** list, range, sequence, numbers

- **start** (int)
- **stop** (int)
- **step** (int)

## GetElement

Retrieves a single value from a list at a specific index.

Use cases:
- Access a specific element by position
- Implement array-like indexing
- Extract the first or last element

**Tags:** list, get, extract, value

- **values** (list)
- **index** (int)

## Length

Calculates the length of a list.

Use cases:
- Determine the number of elements in a list
- Check if a list is empty
- Validate list size constraints

**Tags:** list, count, size

- **values** (list)

## Reduce

Performs a custom reduction operation on a list using Python code.

Use cases:
- Calculate a sum or product of list elements
- Find the maximum or minimum value
- Implement custom aggregation logic

Example reduction code:
```python
{acc} + {value}
```

**Tags:** list, reduce, aggregate, accumulate

- **values**: The list to reduce. (list)
- **initial_value**: The initial value for the reduction. If not provided, the first value in the list is used. (typing.Any)
- **reduction_code**: The Python code to use for the reduction. (str)

## Reverse

Inverts the order of elements in a list.

Use cases:
- Reverse the order of a sequence

**Tags:** list, reverse, invert, flip

- **values** (list)

## SaveList

Saves a list to a text file, placing each element on a new line.

Use cases:
- Export list data to a file
- Create a simple text-based database
- Generate line-separated output

**Tags:** list, save, file, serialize

- **values**: The list to save. (list)
- **name** (str)

## SelectElements

Selects specific values from a list using index positions.

Use cases:
- Pick specific elements by their positions
- Rearrange list elements
- Create a new list from selected indices

**Tags:** list, select, index, extract

- **values** (list)
- **indices** (list)

## Slice

Extracts a subset from a list using start, stop, and step indices.

Use cases:
- Get a portion of a list
- Implement pagination
- Extract every nth element

**Tags:** list, slice, subset, extract

- **values** (list)
- **start** (int)
- **stop** (int)
- **step** (int)

## TransformElements

Transforms each element in a list based on custom Python code.

Use cases:
- Apply a function to every list element
- Convert data types within a list
- Perform calculations on each element

Example mapping code:
{value} * 100

**Tags:** list, transform, modify, apply

- **values**: The list to map. (list)
- **code**: Python code to use for mapping. (str)

