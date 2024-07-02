# nodetool.nodes.nodetool.text

## Concat

Concat Node is a function that combines the output from several nodes into a single output.
This node is beneficial for users who need a simple way to concatenate, or combine, the outputs of two or more nodes. Particularly useful in instances where several outputs need to be streamlined into a single output.

#### Applications
- Concatenating the result of two different text processing nodes, such as word frequency and sentiment analysis, into a single output for further processing.
- Combining various elements of a sentence or paragraph to streamline the information.

**Tags:** 

**Inherits from:** BaseNode

- **a** (`str | nodetool.metadata.types.TextRef`)
- **b** (`str | nodetool.metadata.types.TextRef`)

## JSONToDataframe

This node transforms a list of JSON strings into a dataframe.
The JSON To Dataframe Node allows you to easily convert JSON formatted data into a tabular structure. A JSON string, representing multiple entries, is transformed into a Pandas dataframe which can be used for further data manipulations and analysis.

**Tags:** 

**Inherits from:** BaseNode

- **text** (`str | nodetool.metadata.types.TextRef`)

## Join

This node joins a list of strings into a single string.

**Inherits from:** BaseNode

- **strings** (`list[str | nodetool.metadata.types.TextRef]`)
- **separator** (`str`)

## Replace

This node replaces a substring in a string with another substring.

**Inherits from:** BaseNode

- **text** (`str | nodetool.metadata.types.TextRef`)
- **old** (`str`)
- **new** (`str`)

## SaveText

This node saves a text file to the assets folder.
The Save Text Node is used to save a text file to the assets folder. The node accepts a string as input and saves it to a text file. The text file is then uploaded to the assets folder and can be used as input to other nodes in the workflow.

**Tags:** 

**Inherits from:** BaseNode

- **value** (`str | nodetool.metadata.types.TextRef`)
- **name** (`str`)

## Split

The Split Node separates a given text into a list of strings based on a specified delimiter.
This node is designed to break down provided text based on a specified separator or delimiter. The delimiter can be any character or combination of characters. The output is a list of strings divided based on the given delimiter.

#### Applications
- Breaking down user input into manageable segments.
- Splitting text data received from other nodes for further data manipulation.

**Tags:** 

**Inherits from:** BaseNode

- **text** (`str | nodetool.metadata.types.TextRef`)
- **delimiter** (`str`)

## Template

This node replaces placeholders in a string with values.

**Inherits from:** BaseNode

- **string** (`str | nodetool.metadata.types.TextRef`)
- **values** (`dict[str, typing.Any]`)

## TextID

Returns the asset id.

**Inherits from:** BaseNode

- **text** (`TextRef`)

## Function: `convert_result(context: nodetool.workflows.processing_context.ProcessingContext, input: list[nodetool.metadata.types.TextRef | str], result: str) -> nodetool.metadata.types.TextRef | str`

**Parameters:**

- `context` (ProcessingContext)
- `input` (list[nodetool.metadata.types.TextRef | str])
- `result` (str)

**Returns:** `nodetool.metadata.types.TextRef | str`

- [nodetool.nodes.nodetool.text.extract](text/extract.md)
- [nodetool.nodes.nodetool.text.generate](text/generate.md)
- [nodetool.nodes.nodetool.text.rerank](text/rerank.md)
## Function: `to_string(context: nodetool.workflows.processing_context.ProcessingContext, text: nodetool.metadata.types.TextRef | str) -> str`

**Parameters:**

- `context` (ProcessingContext)
- `text` (nodetool.metadata.types.TextRef | str)

**Returns:** `str`

