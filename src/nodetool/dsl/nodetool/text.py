from pydantic import BaseModel, Field
import typing
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode


class Chunk(GraphNode):
    """
    Splits text into chunks of specified word length.
    text, chunk, split

    Use cases:
    - Preparing text for processing by models with input length limits
    - Creating manageable text segments for parallel processing
    - Generating summaries of text sections
    """

    text: str | GraphNode | tuple[GraphNode, str] = Field(default='', description=None)
    length: int | GraphNode | tuple[GraphNode, str] = Field(default=100, description=None)
    overlap: int | GraphNode | tuple[GraphNode, str] = Field(default=0, description=None)
    separator: str | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description=None)

    @classmethod
    def get_node_type(cls): return "nodetool.text.Chunk"



class Concat(GraphNode):
    """
    Concatenates two text inputs into a single output.
    text, concatenation, combine, +

    Use cases:
    - Joining outputs from multiple text processing nodes
    - Combining parts of sentences or paragraphs
    - Merging text data from different sources
    """

    a: str | GraphNode | tuple[GraphNode, str] = Field(default='', description=None)
    b: str | GraphNode | tuple[GraphNode, str] = Field(default='', description=None)

    @classmethod
    def get_node_type(cls): return "nodetool.text.Concat"



class Contains(GraphNode):
    """
    Checks if text contains a specified substring.
    text, check, contains, compare, validate, substring, string

    Use cases:
    - Searching for keywords in text
    - Filtering content based on presence of terms
    - Validating text content
    """

    text: str | GraphNode | tuple[GraphNode, str] = Field(default='', description=None)
    substring: str | GraphNode | tuple[GraphNode, str] = Field(default='', description=None)
    case_sensitive: bool | GraphNode | tuple[GraphNode, str] = Field(default=True, description=None)

    @classmethod
    def get_node_type(cls): return "nodetool.text.Contains"


import nodetool.nodes.nodetool.text

class CountTokens(GraphNode):
    """
    Counts the number of tokens in text using tiktoken.
    text, tokens, count, encoding

    Use cases:
    - Checking text length for LLM input limits
    - Estimating API costs
    - Managing token budgets in text processing
    """

    TiktokenEncoding: typing.ClassVar[type] = nodetool.nodes.nodetool.text.CountTokens.TiktokenEncoding
    text: str | GraphNode | tuple[GraphNode, str] = Field(default='', description=None)
    encoding: nodetool.nodes.nodetool.text.CountTokens.TiktokenEncoding = Field(default=TiktokenEncoding.CL100K_BASE, description='The tiktoken encoding to use for token counting')

    @classmethod
    def get_node_type(cls): return "nodetool.text.CountTokens"



class EndsWith(GraphNode):
    """
    Checks if text ends with a specified suffix.
    text, check, suffix, compare, validate, substring, string

    Use cases:
    - Validating file extensions
    - Checking string endings
    - Filtering text based on ending content
    """

    text: str | GraphNode | tuple[GraphNode, str] = Field(default='', description=None)
    suffix: str | GraphNode | tuple[GraphNode, str] = Field(default='', description=None)

    @classmethod
    def get_node_type(cls): return "nodetool.text.EndsWith"



class Extract(GraphNode):
    """
    Extracts a substring from input text.
    text, extract, substring

    Use cases:
    - Extracting specific portions of text for analysis
    - Trimming unwanted parts from text data
    - Focusing on relevant sections of longer documents
    """

    text: str | GraphNode | tuple[GraphNode, str] = Field(default='', description=None)
    start: int | GraphNode | tuple[GraphNode, str] = Field(default=0, description=None)
    end: int | GraphNode | tuple[GraphNode, str] = Field(default=0, description=None)

    @classmethod
    def get_node_type(cls): return "nodetool.text.Extract"



class ExtractJSON(GraphNode):
    """
    Extracts data from JSON using JSONPath expressions.
    json, extract, jsonpath

    Use cases:
    - Retrieving specific fields from complex JSON structures
    - Filtering and transforming JSON data for analysis
    - Extracting nested data from API responses or configurations
    """

    text: str | GraphNode | tuple[GraphNode, str] = Field(default='', description=None)
    json_path: str | GraphNode | tuple[GraphNode, str] = Field(default='$.*', description=None)
    find_all: bool | GraphNode | tuple[GraphNode, str] = Field(default=False, description=None)

    @classmethod
    def get_node_type(cls): return "nodetool.text.ExtractJSON"



class ExtractRegex(GraphNode):
    """
    Extracts substrings matching regex groups from text.
    text, regex, extract

    Use cases:
    - Extracting structured data (e.g., dates, emails) from unstructured text
    - Parsing specific patterns in log files or documents
    - Isolating relevant information from complex text formats
    """

    text: str | GraphNode | tuple[GraphNode, str] = Field(default='', description=None)
    regex: str | GraphNode | tuple[GraphNode, str] = Field(default='', description=None)
    dotall: bool | GraphNode | tuple[GraphNode, str] = Field(default=False, description=None)
    ignorecase: bool | GraphNode | tuple[GraphNode, str] = Field(default=False, description=None)
    multiline: bool | GraphNode | tuple[GraphNode, str] = Field(default=False, description=None)

    @classmethod
    def get_node_type(cls): return "nodetool.text.ExtractRegex"



class FindAllRegex(GraphNode):
    """
    Finds all regex matches in text as separate substrings.
    text, regex, find

    Use cases:
    - Identifying all occurrences of a pattern in text
    - Extracting multiple instances of structured data
    - Analyzing frequency and distribution of specific text patterns
    """

    text: str | GraphNode | tuple[GraphNode, str] = Field(default='', description=None)
    regex: str | GraphNode | tuple[GraphNode, str] = Field(default='', description=None)
    dotall: bool | GraphNode | tuple[GraphNode, str] = Field(default=False, description=None)
    ignorecase: bool | GraphNode | tuple[GraphNode, str] = Field(default=False, description=None)
    multiline: bool | GraphNode | tuple[GraphNode, str] = Field(default=False, description=None)

    @classmethod
    def get_node_type(cls): return "nodetool.text.FindAllRegex"



class FormatText(GraphNode):
    """
    Replaces placeholders in a string with dynamic inputs using Jinja2 templating.
    text, template, formatting

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
    """

    template: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='\n    Examples:\n    - text: "Hello, {{ name }}!"\n    - text: "Title: {{ title|truncate(20) }}"\n    - text: "Name: {{ name|upper }}" \n\n    Available filters:\n    - truncate(length): Truncates text to given length\n    - upper: Converts text to uppercase\n    - lower: Converts text to lowercase\n    - title: Converts text to title case\n    - trim: Removes whitespace from start/end\n    - replace(old, new): Replaces substring\n    - default(value): Sets default if value is undefined\n    - first: Gets first character/item\n    - last: Gets last character/item\n    - length: Gets length of string/list\n    - sort: Sorts list\n    - join(delimiter): Joins list with delimiter\n')

    @classmethod
    def get_node_type(cls): return "nodetool.text.FormatText"



class HasLength(GraphNode):
    """
    Checks if text length meets specified conditions.
    text, check, length, compare, validate, whitespace, string

    Use cases:
    - Validating input length requirements
    - Filtering text by length
    - Checking content size constraints
    """

    text: str | GraphNode | tuple[GraphNode, str] = Field(default='', description=None)
    min_length: int | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description=None)
    max_length: int | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description=None)
    exact_length: int | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description=None)

    @classmethod
    def get_node_type(cls): return "nodetool.text.HasLength"



class IsEmpty(GraphNode):
    """
    Checks if text is empty or contains only whitespace.
    text, check, empty, compare, validate, whitespace, string

    Use cases:
    - Validating required text fields
    - Filtering out empty content
    - Checking for meaningful input
    """

    text: str | GraphNode | tuple[GraphNode, str] = Field(default='', description=None)
    trim_whitespace: bool | GraphNode | tuple[GraphNode, str] = Field(default=True, description=None)

    @classmethod
    def get_node_type(cls): return "nodetool.text.IsEmpty"



class Join(GraphNode):
    """
    Joins a list of strings into a single string using a specified separator.
    text, join, combine, +, add, concatenate

    Use cases:
    - Combining multiple text elements with a consistent delimiter
    - Creating comma-separated lists from individual items
    - Assembling formatted text from array elements
    """

    strings: list[str] | GraphNode | tuple[GraphNode, str] = Field(default=[], description=None)
    separator: str | GraphNode | tuple[GraphNode, str] = Field(default='', description=None)

    @classmethod
    def get_node_type(cls): return "nodetool.text.Join"



class ParseJSON(GraphNode):
    """
    Parses a JSON string into a Python object.
    json, parse, convert

    Use cases:
    - Converting JSON API responses for further processing
    - Preparing structured data for analysis or storage
    - Extracting configuration or settings from JSON files
    """

    text: str | GraphNode | tuple[GraphNode, str] = Field(default='', description=None)

    @classmethod
    def get_node_type(cls): return "nodetool.text.ParseJSON"



class RegexMatch(GraphNode):
    """
    Find all matches of a regex pattern in text.
    regex, search, pattern, match

    Use cases:
    - Extract specific patterns from text
    - Validate text against patterns
    - Find all occurrences of a pattern
    """

    text: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='Text to search in')
    pattern: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='Regular expression pattern')
    group: int | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Capture group to extract (0 for full match)')

    @classmethod
    def get_node_type(cls): return "nodetool.text.RegexMatch"



class RegexReplace(GraphNode):
    """
    Replace text matching a regex pattern.
    regex, replace, substitute

    Use cases:
    - Clean or standardize text
    - Remove unwanted patterns
    - Transform text formats
    """

    text: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='Text to perform replacements on')
    pattern: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='Regular expression pattern')
    replacement: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='Replacement text')
    count: int | GraphNode | tuple[GraphNode, str] = Field(default=0, description='Maximum replacements (0 for unlimited)')

    @classmethod
    def get_node_type(cls): return "nodetool.text.RegexReplace"



class RegexSplit(GraphNode):
    """
    Split text using a regex pattern as delimiter.
    regex, split, tokenize

    Use cases:
    - Parse structured text
    - Extract fields from formatted strings
    - Tokenize text
    """

    text: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='Text to split')
    pattern: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='Regular expression pattern to split on')
    maxsplit: int | GraphNode | tuple[GraphNode, str] = Field(default=0, description='Maximum number of splits (0 for unlimited)')

    @classmethod
    def get_node_type(cls): return "nodetool.text.RegexSplit"



class RegexValidate(GraphNode):
    """
    Check if text matches a regex pattern.
    regex, validate, check

    Use cases:
    - Validate input formats (email, phone, etc)
    - Check text structure
    - Filter text based on patterns
    """

    text: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='Text to validate')
    pattern: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='Regular expression pattern')

    @classmethod
    def get_node_type(cls): return "nodetool.text.RegexValidate"



class Replace(GraphNode):
    """
    Replaces a substring in a text with another substring.
    text, replace, substitute

    Use cases:
    - Correcting or updating specific text patterns
    - Sanitizing or normalizing text data
    - Implementing simple text transformations
    """

    text: str | GraphNode | tuple[GraphNode, str] = Field(default='', description=None)
    old: str | GraphNode | tuple[GraphNode, str] = Field(default='', description=None)
    new: str | GraphNode | tuple[GraphNode, str] = Field(default='', description=None)

    @classmethod
    def get_node_type(cls): return "nodetool.text.Replace"



class SaveText(GraphNode):
    """
    Saves input text to a file in the assets folder.
    text, save, file

    Use cases:
    - Persisting processed text results
    - Creating text files for downstream nodes or external use
    - Archiving text data within the workflow
    """

    text: str | GraphNode | tuple[GraphNode, str] = Field(default='', description=None)
    folder: FolderRef | GraphNode | tuple[GraphNode, str] = Field(default=FolderRef(type='folder', uri='', asset_id=None, data=None), description='Name of the output folder.')
    name: str | GraphNode | tuple[GraphNode, str] = Field(default='%Y-%m-%d-%H-%M-%S.txt', description='\n        Name of the output file.\n        You can use time and date variables to create unique names:\n        %Y - Year\n        %m - Month\n        %d - Day\n        %H - Hour\n        %M - Minute\n        %S - Second\n        ')

    @classmethod
    def get_node_type(cls): return "nodetool.text.SaveText"



class Slice(GraphNode):
    """
    Slices text using Python's slice notation (start:stop:step).
    text, slice, substring

    Use cases:
    - Extracting specific portions of text with flexible indexing
    - Reversing text using negative step
    - Taking every nth character with step parameter

    Examples:
    - start=0, stop=5: first 5 characters
    - start=-5: last 5 characters
    - step=2: every second character
    - step=-1: reverse the text
    """

    text: str | GraphNode | tuple[GraphNode, str] = Field(default='', description=None)
    start: int | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description=None)
    stop: int | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description=None)
    step: int | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description=None)

    @classmethod
    def get_node_type(cls): return "nodetool.text.Slice"



class Split(GraphNode):
    """
    Separates text into a list of strings based on a specified delimiter.
    text, split, tokenize

    Use cases:
    - Parsing CSV or similar delimited data
    - Breaking down sentences into words or phrases
    - Extracting specific elements from structured text
    """

    text: str | GraphNode | tuple[GraphNode, str] = Field(default='', description=None)
    delimiter: str | GraphNode | tuple[GraphNode, str] = Field(default=',', description=None)

    @classmethod
    def get_node_type(cls): return "nodetool.text.Split"



class StartsWith(GraphNode):
    """
    Checks if text starts with a specified prefix.
    text, check, prefix, compare, validate, substring, string

    Use cases:
    - Validating string prefixes
    - Filtering text based on starting content
    - Checking file name patterns
    """

    text: str | GraphNode | tuple[GraphNode, str] = Field(default='', description=None)
    prefix: str | GraphNode | tuple[GraphNode, str] = Field(default='', description=None)

    @classmethod
    def get_node_type(cls): return "nodetool.text.StartsWith"



class Template(GraphNode):
    """
    Uses Jinja2 templating to format strings with variables and filters.
    text, template, formatting, format, combine, concatenate, +, add, variable, replace, filter

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
    """

    string: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='\n    Examples:\n    - text: "Hello, {{ name }}!"\n    - text: "Title: {{ title|truncate(20) }}"\n    - text: "Name: {{ name|upper }}"\n\n    Available filters:\n    - truncate(length): Truncates text to given length\n    - upper: Converts text to uppercase\n    - lower: Converts text to lowercase\n    - title: Converts text to title case\n    - trim: Removes whitespace from start/end\n    - replace(old, new): Replaces substring\n    - default(value): Sets default if value is undefined\n    - first: Gets first character/item\n    - last: Gets last character/item\n    - length: Gets length of string/list\n    - sort: Sorts list\n    - join(delimiter): Joins list with delimiter\n')
    values: str | list | dict[str, typing.Any] | object | GraphNode | tuple[GraphNode, str] = Field(default={}, description="\n        The values to replace in the string.\n        - If a string, it will be used as the format string.\n        - If a list, it will be used as the format arguments.\n        - If a dictionary, it will be used as the template variables.\n        - If an object, it will be converted to a dictionary using the object's __dict__ method.\n        ")

    @classmethod
    def get_node_type(cls): return "nodetool.text.Template"


