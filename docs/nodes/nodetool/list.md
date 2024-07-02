# nodetool.nodes.nodetool.list

## Append

Adds a value to the end of a list.

**Tags:** list, add, insert, push, extend, concatenate

**Inherits from:** BaseNode

- **values** (`list[typing.Any]`)
- **value** (`Any`)

## Dedupe

Removes duplicate elements from a list, ensuring uniqueness.

**Tags:** list, unique, distinct, deduplicate, remove, filter

**Inherits from:** BaseNode

- **values** (`list[typing.Any]`)

## Extend

Merges one list into another, extending the original list.

**Tags:** list, merge, concatenate, append, add, insert, push

**Inherits from:** BaseNode

- **values** (`list[typing.Any]`)
- **other_values** (`list[typing.Any]`)

## Filter

Filters a list based on a custom Python condition. Example: {value} % 2 == 0

**Tags:** list, filter, python, condition

**Inherits from:** BaseNode

- **values**: The list to filter. (`list[typing.Any]`)
- **condition**: The Python code to use as the filtering condition. (`str`)

## Index

Retrieve a single value from a list at a specific index.

**Tags:** list, get, pick, extract, value

**Inherits from:** BaseNode

- **values** (`list[typing.Any]`)
- **index** (`int`)

## Length

Calculates and outputs the length of a given list.

**Tags:** list, count, size

**Inherits from:** BaseNode

- **values** (`list[typing.Any]`)

## Map

Transforms each element in a list based on custom Python code. Example: {value} * {index}

**Tags:** list, python, change

**Inherits from:** BaseNode

- **values**: The list to map. (`list[typing.Any]`)
- **code**: Python code to use for mapping. (`str`)

## Range

Generates a list of integers within a specified range.

**Tags:** list, range, int, index, count, sequence, numbers

**Inherits from:** BaseNode

- **start** (`int`)
- **stop** (`int`)
- **step** (`int`)

## Reduce

Performs a custom reduction operation on a list using Python code. Example: {value} + {acc}

**Tags:** list, remove, filter, reduce, python

**Inherits from:** BaseNode

- **values**: The list to reduce. (`list[typing.Any]`)
- **initial_value**: The initial value for the reduction. If not provided, the first value in the list is used. (`Any`)
- **reduction_code**: The Python code to use for the reduction. (`str`)

## Reverse

Inverts the order of elements in a list.

**Tags:** list, reverse, order, invert, flip

**Inherits from:** BaseNode

- **values** (`list[typing.Any]`)

## SaveList

Saves a list to a text file, placing each element on a new line.

**Tags:** list, save, file, serialize, text, toString

**Inherits from:** BaseNode

- **values**: The list to save. (`list[typing.Any]`)
- **name** (`str`)

## Select

Selects specific values from a list using index positions.

**Tags:** list, select, index, get, pick, extract, subset

**Inherits from:** BaseNode

- **values** (`list[typing.Any]`)
- **indices** (`list[int]`)

## Slice

Extracts a subset from a list based on start, stop, and step indices.

**Tags:** list, slice, extract, subset, reduce, filter, select, range, get

**Inherits from:** BaseNode

- **values** (`list[typing.Any]`)
- **start** (`int`)
- **stop** (`int`)
- **step** (`int`)

