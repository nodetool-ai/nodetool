# nodetool.nodes.nodetool.text

## Chunk

Splits text into chunks of specified word length.

Use cases:
- Preparing text for processing by models with input length limits
- Creating manageable text segments for parallel processing
- Generating summaries of text sections

**Tags:** text, chunk, split

**Fields:**
- **text** (str)
- **length** (int)
- **overlap** (int)
- **separator** (str | None)


## Concat

Concatenates two text inputs into a single output.

Use cases:
- Joining outputs from multiple text processing nodes
- Combining parts of sentences or paragraphs
- Merging text data from different sources

**Tags:** text, concatenation, combine, +

**Fields:**
- **a** (str)
- **b** (str)


## Contains

Checks if text contains a specified substring.

Use cases:
- Searching for keywords in text
- Filtering content based on presence of terms
- Validating text content

**Tags:** text, check, contains, compare, validate, substring, string

**Fields:**
- **text** (str)
- **substring** (str)
- **case_sensitive** (bool)


## CountTokens

Counts the number of tokens in text using tiktoken.

Use cases:
- Checking text length for LLM input limits
- Estimating API costs
- Managing token budgets in text processing

**Tags:** text, tokens, count, encoding

**Fields:**
- **text** (str)
- **encoding**: The tiktoken encoding to use for token counting (TiktokenEncoding)


## EndsWith

Checks if text ends with a specified suffix.

Use cases:
- Validating file extensions
- Checking string endings
- Filtering text based on ending content

**Tags:** text, check, suffix, compare, validate, substring, string

**Fields:**
- **text** (str)
- **suffix** (str)


## Extract

Extracts a substring from input text.

Use cases:
- Extracting specific portions of text for analysis
- Trimming unwanted parts from text data
- Focusing on relevant sections of longer documents

**Tags:** text, extract, substring

**Fields:**
- **text** (str)
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
- **text** (str)
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
- **text** (str)
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
- **text** (str)
- **regex** (str)
- **dotall** (bool)
- **ignorecase** (bool)
- **multiline** (bool)


## FormatText

Replaces placeholders in a string with dynamic inputs using Jinja2 templating.

Use cases:
- Generating personalized messages with dynamic content
- Creating parameterized queries or commands
- Formatting and filtering text output based on variable inputs

Examples:
- text: "Hello, {{ name }}!"
- text: "Title: {{ title|truncate(20) }}"
- text: "Name: {{ name|upper }}"

Available filters:
- truncate(length): Truncates text to given length
- upper: Converts text to uppercase
- lower: Converts text to lowercase
- title: Converts text to title case
- trim: Removes whitespace from start/end
- replace(old, new): Replaces substring
- default(value): Sets default if value is undefined
- first: Gets first character/item
- last: Gets last character/item
- length: Gets length of string/list
- sort: Sorts list
- join(delimiter): Joins list with delimiter

**Tags:** text, template, formatting

**Fields:**
- **template**: 
    Examples:
    - text: "Hello, {{ name }}!"
    - text: "Title: {{ title|truncate(20) }}"
    - text: "Name: {{ name|upper }}" 

    Available filters:
    - truncate(length): Truncates text to given length
    - upper: Converts text to uppercase
    - lower: Converts text to lowercase
    - title: Converts text to title case
    - trim: Removes whitespace from start/end
    - replace(old, new): Replaces substring
    - default(value): Sets default if value is undefined
    - first: Gets first character/item
    - last: Gets last character/item
    - length: Gets length of string/list
    - sort: Sorts list
    - join(delimiter): Joins list with delimiter
 (str)


## HasLength

Checks if text length meets specified conditions.

Use cases:
- Validating input length requirements
- Filtering text by length
- Checking content size constraints

**Tags:** text, check, length, compare, validate, whitespace, string

**Fields:**
- **text** (str)
- **min_length** (int | None)
- **max_length** (int | None)
- **exact_length** (int | None)


## IsEmpty

Checks if text is empty or contains only whitespace.

Use cases:
- Validating required text fields
- Filtering out empty content
- Checking for meaningful input

**Tags:** text, check, empty, compare, validate, whitespace, string

**Fields:**
- **text** (str)
- **trim_whitespace** (bool)


## Join

Joins a list of strings into a single string using a specified separator.

Use cases:
- Combining multiple text elements with a consistent delimiter
- Creating comma-separated lists from individual items
- Assembling formatted text from array elements

**Tags:** text, join, combine, +, add, concatenate

**Fields:**
- **strings** (list[str])
- **separator** (str)


## ParseJSON

Parses a JSON string into a Python object.

Use cases:
- Converting JSON API responses for further processing
- Preparing structured data for analysis or storage
- Extracting configuration or settings from JSON files

**Tags:** json, parse, convert

**Fields:**
- **text** (str)


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
- **text** (str)
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
- **text** (str)
- **folder**: Name of the output folder. (FolderRef)
- **name**: 
        Name of the output file.
        You can use time and date variables to create unique names:
        %Y - Year
        %m - Month
        %d - Day
        %H - Hour
        %M - Minute
        %S - Second
         (str)

### required_inputs

**Args:**


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
- **text** (str)
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
- **text** (str)
- **delimiter** (str)


## StartsWith

Checks if text starts with a specified prefix.

Use cases:
- Validating string prefixes
- Filtering text based on starting content
- Checking file name patterns

**Tags:** text, check, prefix, compare, validate, substring, string

**Fields:**
- **text** (str)
- **prefix** (str)


## Template

Uses Jinja2 templating to format strings with variables and filters.

Use cases:
- Generating personalized messages with dynamic content
- Creating parameterized queries or commands
- Formatting and filtering text output based on variable inputs

Examples:
- text: "Hello, {{ name }}!"
- text: "Title: {{ title|truncate(20) }}"
- text: "Name: {{ name|upper }}"

Available filters:
- truncate(length): Truncates text to given length
- upper: Converts text to uppercase
- lower: Converts text to lowercase
- title: Converts text to title case
- trim: Removes whitespace from start/end
- replace(old, new): Replaces substring
- default(value): Sets default if value is undefined
- first: Gets first character/item
- last: Gets last character/item
- length: Gets length of string/list
- sort: Sorts list
- join(delimiter): Joins list with delimiter

**Tags:** text, template, formatting, format, combine, concatenate, +, add, variable, replace, filter

**Fields:**
- **string**: 
    Examples:
    - text: "Hello, {{ name }}!"
    - text: "Title: {{ title|truncate(20) }}"
    - text: "Name: {{ name|upper }}"

    Available filters:
    - truncate(length): Truncates text to given length
    - upper: Converts text to uppercase
    - lower: Converts text to lowercase
    - title: Converts text to title case
    - trim: Removes whitespace from start/end
    - replace(old, new): Replaces substring
    - default(value): Sets default if value is undefined
    - first: Gets first character/item
    - last: Gets last character/item
    - length: Gets length of string/list
    - sort: Sorts list
    - join(delimiter): Joins list with delimiter
 (str)
- **values**: 
        The values to replace in the string.
        - If a string, it will be used as the format string.
        - If a list, it will be used as the format arguments.
        - If a dictionary, it will be used as the template variables.
        - If an object, it will be converted to a dictionary using the object's __dict__ method.
         (str | list | dict[str, typing.Any] | object)


## TiktokenEncoding

Available tiktoken encodings

