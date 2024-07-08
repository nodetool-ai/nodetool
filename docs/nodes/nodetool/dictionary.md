# nodetool.nodes.nodetool.dictionary

## AddToDictionary

Updates a dictionary with new key-value pairs.

Use cases:
- Extend a configuration with additional settings
- Add new entries to a cache or lookup table
- Merge user input with existing data

**Tags:** dictionary, add, update

- **dictionary** (dict[str, typing.Any])
- **new_pairs** (dict[str, typing.Any])

## CombineDictionaries

Merges two dictionaries, with second dictionary values taking precedence.

Use cases:
- Combine default and custom configurations
- Merge partial updates with existing data
- Create aggregate data structures

**Tags:** dictionary, merge, update

- **dict_a** (dict[str, typing.Any])
- **dict_b** (dict[str, typing.Any])

## ConvertDictionariesToDataframe

Converts a list of dictionaries into a multi-row pandas DataFrame.

Use cases:
- Transform list of JSON objects into tabular format
- Prepare multiple data records for analysis
- Convert API results to a structured dataset

**Tags:** dictionaries, dataframe, convert

- **rows** (list[dict[str, typing.Any]])

## ConvertDictionaryToDataframe

Transforms a single dictionary into a one-row pandas DataFrame.

Use cases:
- Prepare dictionary data for tabular analysis
- Convert configuration to a data record
- Initiate a DataFrame from a single data point

**Tags:** dictionary, dataframe, convert

- **dictionary** (dict[str, typing.Any])

## ConvertJSONToDictionary

Parses a JSON string into a Python dictionary.

Use cases:
- Process API responses
- Load configuration files
- Deserialize stored data

**Tags:** json, parse, dictionary

- **json_string** (str)

## CreateDictionaryFromList

Creates a dictionary from parallel lists of keys and values.

Use cases:
- Convert separate data columns into key-value pairs
- Create lookups from parallel data structures
- Transform list data into associative arrays

**Tags:** dictionary, create, zip

- **keys** (list[typing.Any])
- **values** (list[typing.Any])

## FilterDictionaryKeys

Creates a new dictionary with only specified keys from the input.

Use cases:
- Extract relevant fields from a larger data structure
- Implement data access controls
- Prepare specific data subsets for processing

**Tags:** dictionary, filter, select

- **dictionary** (dict[str, typing.Any])
- **keys** (list[str])

## GetDictionaryValue

Retrieves a value from a dictionary using a specified key.

Use cases:
- Access a specific item in a configuration dictionary
- Retrieve a value from a parsed JSON object
- Extract a particular field from a data structure

**Tags:** dictionary, get, value, key

- **dictionary** (dict[str, typing.Any])
- **key** (str)

## RemoveFromDictionary

Removes a key-value pair from a dictionary.

Use cases:
- Delete a specific configuration option
- Remove sensitive information before processing
- Clean up temporary entries in a data structure

**Tags:** dictionary, remove, delete

- **dictionary** (dict[str, typing.Any])
- **key** (str)

