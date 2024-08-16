# nodetool.nodes.nodetool.dictionary

## Combine

Merges two dictionaries, with second dictionary values taking precedence.

Use cases:
- Combine default and custom configurations
- Merge partial updates with existing data
- Create aggregate data structures

**Fields:**
dict_a: dict
dict_b: dict

## ConflictResolution

An enumeration.

## Filter

Creates a new dictionary with only specified keys from the input.

Use cases:
- Extract relevant fields from a larger data structure
- Implement data access controls
- Prepare specific data subsets for processing

**Fields:**
dictionary: dict
keys: list

## GetValue

Retrieves a value from a dictionary using a specified key.

Use cases:
- Access a specific item in a configuration dictionary
- Retrieve a value from a parsed JSON object
- Extract a particular field from a data structure

**Fields:**
dictionary: dict
key: str

## ParseJSON

Parses a JSON string into a Python dictionary.

Use cases:
- Process API responses
- Load configuration files
- Deserialize stored data

**Fields:**
json_string: str

## ReduceDictionaries

Reduces a list of dictionaries into one dictionary based on a specified key field.

Use cases:
- Aggregate data by a specific field
- Create summary dictionaries from list of records
- Combine multiple data points into a single structure

**Fields:**
dictionaries: list
key_field: str
value_field: str | None
conflict_resolution: ConflictResolution

## Remove

Removes a key-value pair from a dictionary.

Use cases:
- Delete a specific configuration option
- Remove sensitive information before processing
- Clean up temporary entries in a data structure

**Fields:**
dictionary: dict
key: str

## Update

Updates a dictionary with new key-value pairs.

Use cases:
- Extend a configuration with additional settings
- Add new entries to a cache or lookup table
- Merge user input with existing data

**Fields:**
dictionary: dict
new_pairs: dict

## Zip

Creates a dictionary from parallel lists of keys and values.

Use cases:
- Convert separate data columns into key-value pairs
- Create lookups from parallel data structures
- Transform list data into associative arrays

**Fields:**
keys: list
values: list

