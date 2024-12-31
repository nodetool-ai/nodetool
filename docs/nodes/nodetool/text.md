# nodetool.nodes.nodetool.text

## Chunk

Splits text into chunks of specified word length.

Use cases:
- Preparing text for processing by models with input length limits
- Creating manageable text segments for parallel processing
- Generating summaries of text sections

**Tags:** text, chunk, split

**Fields:**
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

**Fields:**
- **a** (str | nodetool.metadata.types.TextRef)
- **b** (str | nodetool.metadata.types.TextRef)


## Extract

Extracts a substring from input text.

Use cases:
- Extracting specific portions of text for analysis
- Trimming unwanted parts from text data
- Focusing on relevant sections of longer documents

**Tags:** text, extract, substring

**Fields:**
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

**Fields:**
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

**Fields:**
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

**Fields:**
- **text** (str | nodetool.metadata.types.TextRef)
- **regex** (str)
- **dotall** (bool)
- **ignorecase** (bool)
- **multiline** (bool)


## HTMLToText

Converts HTML to plain text by removing tags and decoding entities using BeautifulSoup.

Use cases:
- Cleaning HTML content for text analysis
- Extracting readable content from web pages
- Preparing HTML data for natural language processing

**Tags:** html, text, convert

**Fields:**
- **text** (str | nodetool.metadata.types.TextRef)
- **preserve_linebreaks**: Convert block-level elements to newlines (bool)


## JSONToDataframe

Transforms a JSON string into a pandas DataFrame.

Use cases:
- Converting API responses to tabular format
- Preparing JSON data for analysis or visualization
- Structuring unstructured JSON data for further processing

**Tags:** json, dataframe, conversion

**Fields:**
- **text** (str | nodetool.metadata.types.TextRef)


## Join

Joins a list of strings into a single string using a specified separator.

Use cases:
- Combining multiple text elements with a consistent delimiter
- Creating comma-separated lists from individual items
- Assembling formatted text from array elements

**Tags:** text, join, combine

**Fields:**
- **strings** (list[str | nodetool.metadata.types.TextRef])
- **separator** (str)


## ParagraphSplitter

Splits text into paragraphs with source tracking metadata.

Use cases:
- Dividing documents into traceable paragraph chunks
- Processing text by natural document sections with source tracking
- Maintaining context in text analysis

**Tags:** text, split, paragraphs

**Fields:**
- **text** (str | nodetool.metadata.types.TextRef)
- **min_length** (int)
- **source_id** (str)


## ParseJSON

Parses a JSON string into a Python object.

Use cases:
- Converting JSON API responses for further processing
- Preparing structured data for analysis or storage
- Extracting configuration or settings from JSON files

**Tags:** json, parse, convert

**Fields:**
- **text** (str | nodetool.metadata.types.TextRef)


## RegexExtract

Extract named groups from text using regex.

Use cases:
- Parse structured data
- Extract semantic components
- Named field extraction

**Tags:** regex, extract, groups

**Fields:**
- **text**: Text to extract from (str)
- **pattern**: Regular expression pattern with named groups (str)


## RegexMatch

Find all matches of a regex pattern in text.

Use cases:
- Extract specific patterns from text
- Validate text against patterns
- Find all occurrences of a pattern

**Tags:** regex, search, pattern, match

**Fields:**
- **text**: Text to search in (str)
- **pattern**: Regular expression pattern (str)
- **group**: Capture group to extract (0 for full match) (typing.Optional[int])


## RegexReplace

Replace text matching a regex pattern.

Use cases:
- Clean or standardize text
- Remove unwanted patterns
- Transform text formats

**Tags:** regex, replace, substitute

**Fields:**
- **text**: Text to perform replacements on (str)
- **pattern**: Regular expression pattern (str)
- **replacement**: Replacement text (str)
- **count**: Maximum replacements (0 for unlimited) (int)


## RegexSplit

Split text using a regex pattern as delimiter.

Use cases:
- Parse structured text
- Extract fields from formatted strings
- Tokenize text

**Tags:** regex, split, tokenize

**Fields:**
- **text**: Text to split (str)
- **pattern**: Regular expression pattern to split on (str)
- **maxsplit**: Maximum number of splits (0 for unlimited) (int)


## RegexValidate

Check if text matches a regex pattern.

Use cases:
- Validate input formats (email, phone, etc)
- Check text structure
- Filter text based on patterns

**Tags:** regex, validate, check

**Fields:**
- **text**: Text to validate (str)
- **pattern**: Regular expression pattern (str)


## Replace

Replaces a substring in a text with another substring.

Use cases:
- Correcting or updating specific text patterns
- Sanitizing or normalizing text data
- Implementing simple text transformations

**Tags:** text, replace, substitute

**Fields:**
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

**Fields:**
- **text** (str | nodetool.metadata.types.TextRef)
- **folder**: Name of the output folder. (FolderRef)
- **name** (str)

### required_inputs

**Args:**


## SentenceSplitter

Splits text into sentences with source tracking metadata.

Use cases:
- Breaking down documents into traceable sentence-level chunks
- Preparing text for sentence-based analysis with source tracking
- Creating manageable units for language model processing

**Tags:** text, split, sentences

**Fields:**
- **text** (str | nodetool.metadata.types.TextRef)
- **min_length** (int)
- **source_id** (str)


## Slice

Slices text using Python's slice notation (start:stop:step).

Use cases:
- Extracting specific portions of text with flexible indexing
- Reversing text using negative step
- Taking every nth character with step parameter

Examples:
- start=0, stop=5: first 5 characters
- start=-5: last 5 characters
- step=2: every second character
- step=-1: reverse the text

**Tags:** text, slice, substring

**Fields:**
- **text** (str | nodetool.metadata.types.TextRef)
- **start** (int | None)
- **stop** (int | None)
- **step** (int | None)


## Split

Separates text into a list of strings based on a specified delimiter.

Use cases:
- Parsing CSV or similar delimited data
- Breaking down sentences into words or phrases
- Extracting specific elements from structured text

**Tags:** text, split, tokenize

**Fields:**
- **text** (str | nodetool.metadata.types.TextRef)
- **delimiter** (str)


## Template

Replaces placeholders in a string with provided values.

Use cases:
- Generating personalized messages with dynamic content
- Creating parameterized queries or commands
- Formatting text output based on variable inputs

Examples:
- text: "Hello, {name}!" values: {"name": "Alice"} -> "Hello, Alice!"
- text: "Hello, {0} {1}!" values: ["Alice", "Meyer"] -> "Hello, Alice Meyer!"
- text: "Hello, {0}!" values: "Alice" -> "Hello, Alice!"

**Tags:** text, template, formatting

**Fields:**
- **string** (str | nodetool.metadata.types.TextRef)
- **values** (str | list | dict[str, typing.Any])


## TextID

Returns the asset id.

**Fields:**
- **text** (TextRef)


## TokenSplitter

Splits text into token-based chunks with source tracking metadata.

Use cases:
- Creating fixed-size chunks for language model input with source tracking
- Maintaining context with overlapping text segments
- Optimizing text processing for specific token limits

**Tags:** text, split, tokens

**Fields:**
- **text** (str | nodetool.metadata.types.TextRef)
- **chunk_size** (int)
- **overlap** (int)
- **source_id** (str)


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

