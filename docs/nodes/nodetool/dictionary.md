# nodetool.nodes.nodetool.dictionary

## Combine

Merges two dictionaries, with second dictionary values taking precedence.

Use cases:
- Combine default and custom configurations
- Merge partial updates with existing data
- Create aggregate data structures

**Tags:** dictionary, merge, update

**Fields:**
- **dict_a** (dict[str, typing.Any])
- **dict_b** (dict[str, typing.Any])


## ConflictResolution

## Filter

Creates a new dictionary with only specified keys from the input.

Use cases:
- Extract relevant fields from a larger data structure
- Implement data access controls
- Prepare specific data subsets for processing

**Tags:** dictionary, filter, select

**Fields:**
- **dictionary** (dict[str, typing.Any])
- **keys** (list[str])


## GetValue

Retrieves a value from a dictionary using a specified key.

Use cases:
- Access a specific item in a configuration dictionary
- Retrieve a value from a parsed JSON object
- Extract a particular field from a data structure

**Tags:** dictionary, get, value, key

**Fields:**
- **dictionary** (dict[str, typing.Any])
- **key** (str)
- **default** (Any)


## MakeDictionary

Creates a simple dictionary with up to three key-value pairs.

Use cases:
- Create configuration entries
- Initialize simple data structures
- Build basic key-value mappings

**Tags:** dictionary, create, simple

**Fields:**
- **key1**: First key (str)
- **value1**: First value (Any)
- **key2**: Second key (optional) (str)
- **value2**: Second value (optional) (Any)
- **key3**: Third key (optional) (str)
- **value3**: Third value (optional) (Any)


## ParseJSON

Parses a JSON string into a Python dictionary.

Use cases:
- Process API responses
- Load configuration files
- Deserialize stored data

**Tags:** json, parse, dictionary

**Fields:**
- **json_string** (str)


## ReduceDictionaries

Reduces a list of dictionaries into one dictionary based on a specified key field.

Use cases:
- Aggregate data by a specific field
- Create summary dictionaries from list of records
- Combine multiple data points into a single structure

**Tags:** dictionary, reduce, aggregate

**Fields:**
- **dictionaries**: List of dictionaries to be reduced (list[dict[str, typing.Any]])
- **key_field**: The field to use as the key in the resulting dictionary (str)
- **value_field**: Optional field to use as the value. If not specified, the entire dictionary (minus the key field) will be used as the value. (str | None)
- **conflict_resolution**: How to handle conflicts when the same key appears multiple times (ConflictResolution)


## Remove

Removes a key-value pair from a dictionary.

Use cases:
- Delete a specific configuration option
- Remove sensitive information before processing
- Clean up temporary entries in a data structure

**Tags:** dictionary, remove, delete

**Fields:**
- **dictionary** (dict[str, typing.Any])
- **key** (str)


## Update

Updates a dictionary with new key-value pairs.

Use cases:
- Extend a configuration with additional settings
- Add new entries to a cache or lookup table
- Merge user input with existing data

**Tags:** dictionary, add, update

**Fields:**
- **dictionary** (dict[str, typing.Any])
- **new_pairs** (dict[str, typing.Any])


## Zip

Creates a dictionary from parallel lists of keys and values.

Use cases:
- Convert separate data columns into key-value pairs
- Create lookups from parallel data structures
- Transform list data into associative arrays

**Tags:** dictionary, create, zip

**Fields:**
- **keys** (list[typing.Any])
- **values** (list[typing.Any])


