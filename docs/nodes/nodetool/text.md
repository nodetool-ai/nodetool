# nodetool.nodes.nodetool.text

## Chunk

Splits text into chunks of specified word length.

Use cases:
- Preparing text for processing by models with input length limits
- Creating manageable text segments for parallel processing
- Generating summaries of text sections

**Tags:** text, chunk, split

- **text** (str | nodetool.metadata.types.TextRef)
- **length** (int)
- **overlap** (int)
- **separator** (str | None)

## Concat

Concatenates two text inputs into a single output.

Use cases:
- Joining outputs from multiple text processing nodes
- Combining parts of sentences or paragraphs
- Merging text data from different sources

**Tags:** text, concatenation, combine

- **a** (str | nodetool.metadata.types.TextRef)
- **b** (str | nodetool.metadata.types.TextRef)

## Extract

Extracts a substring from input text.

Use cases:
- Extracting specific portions of text for analysis
- Trimming unwanted parts from text data
- Focusing on relevant sections of longer documents

**Tags:** text, extract, substring

- **text** (str | nodetool.metadata.types.TextRef)
- **start** (int)
- **end** (int)

## ExtractJSON

Extracts data from JSON using JSONPath expressions.

Use cases:
- Retrieving specific fields from complex JSON structures
- Filtering and transforming JSON data for analysis
- Extracting nested data from API responses or configurations

**Tags:** json, extract, jsonpath

- **text** (str | nodetool.metadata.types.TextRef)
- **json_path** (str)
- **find_all** (bool)

## ExtractRegex

Extracts substrings matching regex groups from text.

Use cases:
- Extracting structured data (e.g., dates, emails) from unstructured text
- Parsing specific patterns in log files or documents
- Isolating relevant information from complex text formats

**Tags:** text, regex, extract

- **text** (str | nodetool.metadata.types.TextRef)
- **regex** (str)
- **dotall** (bool)
- **ignorecase** (bool)
- **multiline** (bool)

## FindAllRegex

Finds all regex matches in text as separate substrings.

Use cases:
- Identifying all occurrences of a pattern in text
- Extracting multiple instances of structured data
- Analyzing frequency and distribution of specific text patterns

**Tags:** text, regex, find

- **text** (str | nodetool.metadata.types.TextRef)
- **regex** (str)
- **dotall** (bool)
- **ignorecase** (bool)
- **multiline** (bool)

## JSONToDataframe

Transforms a JSON string into a pandas DataFrame.

Use cases:
- Converting API responses to tabular format
- Preparing JSON data for analysis or visualization
- Structuring unstructured JSON data for further processing

**Tags:** json, dataframe, conversion

- **text** (str | nodetool.metadata.types.TextRef)

## Join

Joins a list of strings into a single string using a specified separator.

Use cases:
- Combining multiple text elements with a consistent delimiter
- Creating comma-separated lists from individual items
- Assembling formatted text from array elements

**Tags:** text, join, combine

- **strings** (list[str | nodetool.metadata.types.TextRef])
- **separator** (str)

## ParseJSON

Parses a JSON string into a Python object.

Use cases:
- Converting JSON API responses for further processing
- Preparing structured data for analysis or storage
- Extracting configuration or settings from JSON files

**Tags:** json, parse, convert

- **text** (str | nodetool.metadata.types.TextRef)

## Replace

Replaces a substring in a text with another substring.

Use cases:
- Correcting or updating specific text patterns
- Sanitizing or normalizing text data
- Implementing simple text transformations

**Tags:** text, replace, substitute

- **text** (str | nodetool.metadata.types.TextRef)
- **old** (str)
- **new** (str)

## SaveText

Saves input text to a file in the assets folder.

Use cases:
- Persisting processed text results
- Creating text files for downstream nodes or external use
- Archiving text data within the workflow

**Tags:** text, save, file

- **value** (str | nodetool.metadata.types.TextRef)
- **name** (str)

## Split

Separates text into a list of strings based on a specified delimiter.

Use cases:
- Parsing CSV or similar delimited data
- Breaking down sentences into words or phrases
- Extracting specific elements from structured text

**Tags:** text, split, tokenize

- **text** (str | nodetool.metadata.types.TextRef)
- **delimiter** (str)

## Template

Replaces placeholders in a string with provided values.

Use cases:
- Generating personalized messages with dynamic content
- Creating parameterized queries or commands
- Formatting text output based on variable inputs

**Tags:** text, template, formatting

- **string** (str | nodetool.metadata.types.TextRef)
- **values** (dict[str, typing.Any])

## TextID

Returns the asset id.

- **text** (TextRef)

### convert_result

**Args:**
- **context (ProcessingContext)**
- **input (list[nodetool.metadata.types.TextRef | str])**
- **result (str)**

**Returns:** nodetool.metadata.types.TextRef | str

### to_string

**Args:**
- **context (ProcessingContext)**
- **text (nodetool.metadata.types.TextRef | str)**

**Returns:** str

