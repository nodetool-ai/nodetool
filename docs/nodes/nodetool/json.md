# nodetool.nodes.nodetool.json

## BaseGetJSONPath

Base class for extracting typed data from a JSON object using a path expression.

Examples for an object {"a": {"b": {"c": 1}}}
"a.b.c" -> 1
"a.b" -> {"c": 1}
"a" -> {"b": {"c": 1}}

Use cases:
- Navigate complex JSON structures
- Extract specific values from nested JSON with type safety

**Tags:** json, path, extract

**Fields:**
- **data**: JSON object to extract from (typing.Any)
- **path**: Path to the desired value (dot notation) (str)


## FilterJSON

Filter JSON array based on a key-value condition.

Use cases:
- Filter arrays of objects
- Search JSON data

**Tags:** json, filter, array

**Fields:**
- **array**: Array of JSON objects to filter (typing.List[dict])
- **key**: Key to filter on (str)
- **value**: Value to match (typing.Any)


## GetJSONPathBool

Extract a boolean value from a JSON path

**Tags:** json, path, extract, boolean

**Fields:**
- **data**: JSON object to extract from (typing.Any)
- **path**: Path to the desired value (dot notation) (str)
- **default** (bool)


## GetJSONPathDict

Extract a dictionary value from a JSON path

**Tags:** json, path, extract, object

**Fields:**
- **data**: JSON object to extract from (typing.Any)
- **path**: Path to the desired value (dot notation) (str)
- **default** (dict)


## GetJSONPathFloat

Extract a float value from a JSON path

**Tags:** json, path, extract, number

**Fields:**
- **data**: JSON object to extract from (typing.Any)
- **path**: Path to the desired value (dot notation) (str)
- **default** (float)


## GetJSONPathInt

Extract an integer value from a JSON path

**Tags:** json, path, extract, number

**Fields:**
- **data**: JSON object to extract from (typing.Any)
- **path**: Path to the desired value (dot notation) (str)
- **default** (int)


## GetJSONPathList

Extract a list value from a JSON path

**Tags:** json, path, extract, array

**Fields:**
- **data**: JSON object to extract from (typing.Any)
- **path**: Path to the desired value (dot notation) (str)
- **default** (list)


## GetJSONPathStr

Extract a string value from a JSON path

**Tags:** json, path, extract, string

**Fields:**
- **data**: JSON object to extract from (typing.Any)
- **path**: Path to the desired value (dot notation) (str)
- **default** (str)


## JSONTemplate

Template JSON strings with variable substitution.

Example:
template: '{"name": "$user", "age": $age}'
values: {"user": "John", "age": 30}
result: '{"name": "John", "age": 30}'

Use cases:
- Create dynamic JSON payloads
- Generate JSON with variable data
- Build API request templates

**Tags:** json, template, substitute, variables

**Fields:**
- **template**: JSON template string with $variable placeholders (str)
- **values**: Dictionary of values to substitute into the template (typing.Dict[str, typing.Any])


## ParseDict

Parse a JSON string into a Python dictionary.

Use cases:
- Convert JSON API responses to Python dictionaries
- Process JSON configuration files
- Parse object-like JSON data

**Tags:** json, parse, decode, dictionary

**Fields:**
- **json_string**: JSON string to parse into a dictionary (str)


## ParseList

Parse a JSON string into a Python list.

Use cases:
- Convert JSON array responses to Python lists
- Process JSON data collections
- Parse array-like JSON data

**Tags:** json, parse, decode, array, list

**Fields:**
- **json_string**: JSON string to parse into a list (str)


## StringifyJSON

Convert a Python object to a JSON string.

Use cases:
- Prepare data for API requests
- Save data in JSON format

**Tags:** json, stringify, encode

**Fields:**
- **data**: Data to convert to JSON (typing.Any)
- **indent**: Number of spaces for indentation (int)


## ValidateJSON

Validate JSON data against a schema.

Use cases:
- Ensure API payloads match specifications
- Validate configuration files

**Tags:** json, validate, schema

**Fields:**
- **data**: JSON data to validate (typing.Any)
- **schema**: JSON schema for validation (dict)


