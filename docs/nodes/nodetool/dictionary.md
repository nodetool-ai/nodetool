# nodetool.nodes.nodetool.dictionary

## Access

Retrieves a specific value from a dictionary using a key.

**Tags:** dictionary, dict, select, get, value, access, key

**Inherits from:** BaseNode

- **dictionary** (`dict[str, typing.Any]`)
- **key** (`str`)

## Delete

Removes a key-value pair from a dictionary based on the specified key.

**Tags:** dictionary, dict, remove

**Inherits from:** BaseNode

- **dictionary** (`dict[str, typing.Any]`)
- **key** (`str`)

## DictFromJson

Converts a JSON string into a dictionary.

**Tags:** dictionary, json, parse

**Inherits from:** BaseNode

- **json_string** (`str`)

## DictFromList

Generates a dictionary by pairing lists of keys and values.

**Tags:** dictionary, create, keys, values

**Inherits from:** BaseNode

- **keys** (`list[typing.Any]`)
- **values** (`list[typing.Any]`)

## DictToDataframe

Converts a dictionary into a dataframe, each value in the dictionary becomes a column.

**Tags:** dictionary, dataframe, pandas

**Inherits from:** BaseNode

- **dictionary** (`dict[str, typing.Any]`)

## Merge

Combines two dictionaries into one. Note: Values from the second input override duplicates.

**Tags:** dictionary, merge, combine

**Inherits from:** BaseNode

- **dict_a** (`dict[str, typing.Any]`)
- **dict_b** (`dict[str, typing.Any]`)

## RowsToDataframe

Converts a list of dictionaries into a dataframe, each dictionary becomes a row.

**Tags:** dictionary, dataframe, pandas

**Inherits from:** BaseNode

- **rows** (`list[dict[str, typing.Any]]`)

## SelectKeys

Filters a dictionary to include only specified keys.

**Tags:** dictionary, keys, filter

**Inherits from:** BaseNode

- **dictionary** (`dict[str, typing.Any]`)
- **keys** (`list[str]`)

## Update

Updates a dictionary with one or more new key-value pairs.

**Tags:** dictionary, dict, add, insert

**Inherits from:** BaseNode

- **dictionary** (`dict[str, typing.Any]`)
- **new_pairs** (`dict[str, typing.Any]`)

