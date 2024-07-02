# nodetool.nodes.nodetool.text.extract

## Chunk

This node chunks a string into substrings of a specified number of words.

**Inherits from:** BaseNode

- **text** (`str | nodetool.metadata.types.TextRef`)
- **length** (`int`)
- **overlap** (`int`)
- **separator** (`str | None`)

## Extract

This node extracts a substring from a string.
#### Inputs
- `text`: The string from which the substring will be extracted.
- `start`: The starting index of the substring.
- `end`: The ending index of the substring.

**Tags:** 

**Inherits from:** BaseNode

- **text** (`str | nodetool.metadata.types.TextRef`)
- **start** (`int`)
- **end** (`int`)

## ExtractJSON

This node uses a JSONPath to extract a specific object from a JSON object.
The Extract JSON Node operates by accepting an input of a JSON object and a JSONPath expression then
returns the object matching that JSONPath from the JSON object.

#### Applications
- Extracting specific data from a larger JSON object as part of a data processing or analysis workflow.
- Retrieving and analyzing specific values from complex JSON structures.
- Preprocessing data for subsequent nodes in an AI workflow.

#### Example
Suppose you have a large JSON object containing various pieces of information and you want to extract the price information.
You can use the Extract JSON Node by feeding in the JSON object and specifying the JSONPath expression to the price field.
The node will return the price information which can then be input to another node for further processing, such as a decision-making node or a data visualization node.

**Tags:** 

**Inherits from:** BaseNode

- **text** (`str | nodetool.metadata.types.TextRef`)
- **json_path** (`str`)
- **find_all** (`bool`)

## ExtractRegex

This node extracts a list of substrings from a string using a regular expression.

#### Applications
- Extracting substrings from a string using a regular expression.

#### Example
Suppose you have a string that contains a question and answer.
Using a regex you can extract the question and answer as separate substrings.

**Tags:** Each group in the regular expression is extracted as a separate substring.

**Inherits from:** BaseNode

- **text** (`str | nodetool.metadata.types.TextRef`)
- **regex** (`str`)
- **dotall** (`bool`)
- **ignorecase** (`bool`)
- **multiline** (`bool`)

## FindAllRegex

This node extracts a list of substrings from a string using a regular expression.

**Tags:** Each match in the regular expression is extracted as a separate substring.

**Inherits from:** BaseNode

- **text** (`str | nodetool.metadata.types.TextRef`)
- **regex** (`str`)
- **dotall** (`bool`)
- **ignorecase** (`bool`)
- **multiline** (`bool`)

## ParseJSON

This node parses a JSON string into a Python object.
#### Applications
- Parsing JSON strings into Python objects for further processing.

**Tags:** 

**Inherits from:** BaseNode

- **text** (`str | nodetool.metadata.types.TextRef`)

