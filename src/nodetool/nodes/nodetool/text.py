import asyncio
from io import BytesIO
import json

from typing import Any
import pandas as pd
from pydantic import Field
from nodetool.workflows.processing_context import ProcessingContext
from nodetool.metadata.types import DataframeRef, FolderRef, TextChunk
from nodetool.metadata.types import TextRef
from nodetool.workflows.base_node import BaseNode
import json
import re
from jsonpath_ng import parse
from typing import Any
from pydantic import Field
from nodetool.workflows.processing_context import ProcessingContext
from nodetool.metadata.types import TextRef
from nodetool.workflows.base_node import BaseNode
from dataclasses import dataclass
from typing import Optional
from html import unescape
from bs4 import BeautifulSoup


async def to_string(context: ProcessingContext, text: TextRef | str) -> str:
    if isinstance(text, TextRef):
        stream = await context.asset_to_io(text)
        return stream.read().decode("utf-8")
    else:
        return text


async def convert_result(
    context: ProcessingContext, input: list[TextRef | str], result: str
) -> TextRef | str:
    if any(isinstance(text, TextRef) for text in input):
        return await context.text_from_str(result)
    else:
        return result


class TextID(BaseNode):
    """
    Returns the asset id.
    index, asset, identifier
    """

    text: TextRef = Field(title="Text", default="")

    async def process(self, context: ProcessingContext) -> str | None:
        return self.text.asset_id


class Concat(BaseNode):
    """
    Concatenates two text inputs into a single output.
    text, concatenation, combine

    Use cases:
    - Joining outputs from multiple text processing nodes
    - Combining parts of sentences or paragraphs
    - Merging text data from different sources
    """

    a: str | TextRef = ""
    b: str | TextRef = ""

    async def process(self, context: ProcessingContext) -> str | TextRef:
        res = await to_string(context, self.a) + await to_string(context, self.b)
        return await convert_result(context, [self.a, self.b], res)


class Join(BaseNode):
    """
    Joins a list of strings into a single string using a specified separator.
    text, join, combine

    Use cases:
    - Combining multiple text elements with a consistent delimiter
    - Creating comma-separated lists from individual items
    - Assembling formatted text from array elements
    """

    strings: list[str | TextRef] = []
    separator: str = ""

    async def process(self, context: ProcessingContext) -> str | TextRef:
        if len(self.strings) == 0:
            return ""
        strings = await asyncio.gather(
            *[to_string(context, text) for text in self.strings]
        )
        res = self.separator.join(strings)
        return await convert_result(context, self.strings, res)


class Template(BaseNode):
    """
    Replaces placeholders in a string with provided values.
    text, template, formatting

    Use cases:
    - Generating personalized messages with dynamic content
    - Creating parameterized queries or commands
    - Formatting text output based on variable inputs

    Examples:
    - text: "Hello, {name}!" values: {"name": "Alice"} -> "Hello, Alice!"
    - text: "Hello, {0} {1}!" values: ["Alice", "Meyer"] -> "Hello, Alice Meyer!"
    - text: "Hello, {0}!" values: "Alice" -> "Hello, Alice!"
    """

    string: str | TextRef = Field(title="String", default="")
    values: str | list | dict[str, Any] = Field(
        title="Values",
        default={},
        description="""
        The values to replace in the string.
        - If a string, it will be used as the format string.
        - If a list, it will be used as the format arguments.
        - If a dictionary, it will be used as the format keyword arguments.
        """,
    )

    async def process(self, context: ProcessingContext) -> str | TextRef:
        string = await to_string(context, self.string)
        if isinstance(self.values, str):
            res = string.format(self.values)
        elif isinstance(self.values, list):
            res = string.format(*self.values)
        elif isinstance(self.values, dict):
            res = string.format(**self.values)
        else:
            raise ValueError("Invalid values type")
        return await convert_result(context, [self.string], res)


class Replace(BaseNode):
    """
    Replaces a substring in a text with another substring.
    text, replace, substitute

    Use cases:
    - Correcting or updating specific text patterns
    - Sanitizing or normalizing text data
    - Implementing simple text transformations
    """

    text: str | TextRef = Field(title="Text", default="")
    old: str = Field(title="Old", default="")
    new: str = Field(title="New", default="")

    async def process(self, context: ProcessingContext) -> str | TextRef:
        text = await to_string(context, self.text)
        res = text.replace(self.old, self.new)
        return await convert_result(context, [self.text], res)


class JSONToDataframe(BaseNode):
    """
    Transforms a JSON string into a pandas DataFrame.
    json, dataframe, conversion

    Use cases:
    - Converting API responses to tabular format
    - Preparing JSON data for analysis or visualization
    - Structuring unstructured JSON data for further processing
    """

    text: str | TextRef = Field(title="JSON", default_factory=TextRef)

    async def process(self, context: ProcessingContext) -> DataframeRef:
        json_string = await to_string(context, self.text)
        rows = json.loads(json_string)
        df = pd.DataFrame(rows)
        return await context.dataframe_from_pandas(df)


class SaveText(BaseNode):
    """
    Saves input text to a file in the assets folder.
    text, save, file

    Use cases:
    - Persisting processed text results
    - Creating text files for downstream nodes or external use
    - Archiving text data within the workflow
    """

    text: str | TextRef = Field(title="Text", default_factory=TextRef)
    folder: FolderRef = Field(
        default=FolderRef(), description="Name of the output folder."
    )
    name: str = Field(title="Name", default="text.txt")

    def required_inputs(self):
        return ["text"]

    async def process(self, context: ProcessingContext) -> TextRef:
        string = await to_string(context, self.text)
        file = BytesIO(string.encode("utf-8"))
        parent_id = self.folder.asset_id if self.folder.is_set() else None
        asset = await context.create_asset(self.name, "text/plain", file, parent_id)
        return TextRef(uri=asset.get_url or "", asset_id=asset.id)


class Split(BaseNode):
    """
    Separates text into a list of strings based on a specified delimiter.
    text, split, tokenize

    Use cases:
    - Parsing CSV or similar delimited data
    - Breaking down sentences into words or phrases
    - Extracting specific elements from structured text
    """

    text: str | TextRef = Field(title="Text", default="")
    delimiter: str = ","

    async def process(self, context: ProcessingContext) -> list[str]:
        text = await to_string(context, self.text)
        res = text.split(self.delimiter)
        return res


class Extract(BaseNode):
    """
    Extracts a substring from input text.
    text, extract, substring

    Use cases:
    - Extracting specific portions of text for analysis
    - Trimming unwanted parts from text data
    - Focusing on relevant sections of longer documents
    """

    text: str | TextRef = Field(title="Text", default="")
    start: int = Field(title="Start", default=0)
    end: int = Field(title="End", default=0)

    async def process(self, context: ProcessingContext) -> str | TextRef:
        text = await to_string(context, self.text)
        res = text[self.start : self.end]
        return await convert_result(context, [self.text], res)


class Chunk(BaseNode):
    """
    Splits text into chunks of specified word length.
    text, chunk, split

    Use cases:
    - Preparing text for processing by models with input length limits
    - Creating manageable text segments for parallel processing
    - Generating summaries of text sections
    """

    text: str | TextRef = Field(title="Text", default="")
    length: int = Field(title="Length", default=100, le=1000, ge=1)
    overlap: int = Field(title="Overlap", default=0)
    separator: str | None = Field(title="Separator", default=None)

    async def process(self, context: ProcessingContext) -> list[str]:
        text = await to_string(context, self.text)
        text = text.split(sep=self.separator)

        chunks = [
            text[i : i + self.length]
            for i in range(0, len(text), self.length - self.overlap)
        ]
        return [" ".join(chunk) for chunk in chunks]


class ExtractRegex(BaseNode):
    """
    Extracts substrings matching regex groups from text.
    text, regex, extract

    Use cases:
    - Extracting structured data (e.g., dates, emails) from unstructured text
    - Parsing specific patterns in log files or documents
    - Isolating relevant information from complex text formats
    """

    text: str | TextRef = Field(title="Text", default="")
    regex: str = Field(title="Regex", default="")
    dotall: bool = Field(title="Dotall", default=False)
    ignorecase: bool = Field(title="Ignorecase", default=False)
    multiline: bool = Field(title="Multiline", default=False)

    async def process(self, context: ProcessingContext) -> list[str]:
        options = 0
        if self.dotall:
            options |= re.DOTALL
        if self.ignorecase:
            options |= re.IGNORECASE
        if self.multiline:
            options |= re.MULTILINE
        text = await to_string(context, self.text)
        match = re.search(self.regex, text, options)
        if match is None:
            return []
        return list(match.groups())


class FindAllRegex(BaseNode):
    """
    Finds all regex matches in text as separate substrings.
    text, regex, find

    Use cases:
    - Identifying all occurrences of a pattern in text
    - Extracting multiple instances of structured data
    - Analyzing frequency and distribution of specific text patterns
    """

    text: str | TextRef = Field(title="Text", default="")
    regex: str = Field(title="Regex", default="")
    dotall: bool = Field(title="Dotall", default=False)
    ignorecase: bool = Field(title="Ignorecase", default=False)
    multiline: bool = Field(title="Multiline", default=False)

    async def process(self, context: ProcessingContext) -> list[str]:
        options = 0
        if self.dotall:
            options |= re.DOTALL
        if self.ignorecase:
            options |= re.IGNORECASE
        if self.multiline:
            options |= re.MULTILINE
        text = await to_string(context, self.text)
        matches = re.findall(self.regex, text, options)
        return list(matches)


class ParseJSON(BaseNode):
    """
    Parses a JSON string into a Python object.
    json, parse, convert

    Use cases:
    - Converting JSON API responses for further processing
    - Preparing structured data for analysis or storage
    - Extracting configuration or settings from JSON files
    """

    text: str | TextRef = Field(title="JSON string", default="")

    async def process(self, context: ProcessingContext) -> Any:
        json_string = await to_string(context, self.text)
        return json.loads(json_string)


class ExtractJSON(BaseNode):
    """
    Extracts data from JSON using JSONPath expressions.
    json, extract, jsonpath

    Use cases:
    - Retrieving specific fields from complex JSON structures
    - Filtering and transforming JSON data for analysis
    - Extracting nested data from API responses or configurations
    """

    text: str | TextRef = Field(title="JSON Text", default_factory=TextRef)
    json_path: str = Field(title="JSONPath Expression", default="$.*")
    find_all: bool = Field(title="Find All", default=False)

    async def process(self, context: ProcessingContext) -> Any:
        json_string = await to_string(context, self.text)
        parsed_json = json.loads(json_string)
        jsonpath_expr = parse(self.json_path)
        if self.find_all:
            return [match.value for match in jsonpath_expr.find(parsed_json)]
        else:
            return jsonpath_expr.find(parsed_json)[0].value


class SentenceSplitter(BaseNode):
    """
    Splits text into chunks of a minimum length.
    text, split, sentences

    Use cases:
    - Splitting text into manageable chunks for processing
    - Creating traceable units for analysis or storage
    - Preparing text for language model processing
    """

    text: str | TextRef = Field(title="Text", default="")
    min_length: int = Field(title="Minimum Length", default=10)
    source_id: str = Field(title="Source ID", default="")

    async def process(self, context: ProcessingContext) -> list[TextChunk]:
        text = await to_string(context, self.text)
        chunks = []

        # Simple sentence splitting using common punctuation
        for match in re.finditer(r"[^.!?]+[.!?]+", text):
            sentence = match.group().strip()
            if len(sentence) >= self.min_length:
                start_idx = match.start()
                chunks.append(
                    TextChunk(
                        text=sentence,
                        source_id=self.source_id,
                        start_index=start_idx,
                    )
                )

        return chunks


class RegexMatch(BaseNode):
    """
    Find all matches of a regex pattern in text.
    regex, search, pattern, match

    Use cases:
    - Extract specific patterns from text
    - Validate text against patterns
    - Find all occurrences of a pattern
    """

    text: str = Field(default="", description="Text to search in")
    pattern: str = Field(default="", description="Regular expression pattern")
    group: Optional[int] = Field(
        default=None, description="Capture group to extract (0 for full match)"
    )

    async def process(self, context: ProcessingContext) -> list[str]:
        if self.group is None:
            return re.findall(self.pattern, self.text)
        matches = re.finditer(self.pattern, self.text)
        return [match.group(self.group) for match in matches]


class RegexReplace(BaseNode):
    """
    Replace text matching a regex pattern.
    regex, replace, substitute

    Use cases:
    - Clean or standardize text
    - Remove unwanted patterns
    - Transform text formats
    """

    text: str = Field(default="", description="Text to perform replacements on")
    pattern: str = Field(default="", description="Regular expression pattern")
    replacement: str = Field(default="", description="Replacement text")
    count: int = Field(default=0, description="Maximum replacements (0 for unlimited)")

    async def process(self, context: ProcessingContext) -> str:
        return re.sub(self.pattern, self.replacement, self.text, count=self.count)


class RegexSplit(BaseNode):
    """
    Split text using a regex pattern as delimiter.
    regex, split, tokenize

    Use cases:
    - Parse structured text
    - Extract fields from formatted strings
    - Tokenize text
    """

    text: str = Field(default="", description="Text to split")
    pattern: str = Field(
        default="", description="Regular expression pattern to split on"
    )
    maxsplit: int = Field(
        default=0, description="Maximum number of splits (0 for unlimited)"
    )

    async def process(self, context: ProcessingContext) -> list[str]:
        return re.split(self.pattern, self.text, maxsplit=self.maxsplit)


class RegexValidate(BaseNode):
    """
    Check if text matches a regex pattern.
    regex, validate, check

    Use cases:
    - Validate input formats (email, phone, etc)
    - Check text structure
    - Filter text based on patterns
    """

    text: str = Field(default="", description="Text to validate")
    pattern: str = Field(default="", description="Regular expression pattern")

    async def process(self, context: ProcessingContext) -> bool:
        return bool(re.match(self.pattern, self.text))


class RegexExtract(BaseNode):
    """
    Extract named groups from text using regex.
    regex, extract, groups

    Use cases:
    - Parse structured data
    - Extract semantic components
    - Named field extraction
    """

    text: str = Field(default="", description="Text to extract from")
    pattern: str = Field(
        default="", description="Regular expression pattern with named groups"
    )

    async def process(self, context: ProcessingContext) -> dict:
        match = re.search(self.pattern, self.text)
        if match:
            return match.groupdict()
        return {}


def convert_html_to_text(html: str, preserve_linebreaks: bool = True) -> str:
    """
    Converts HTML to plain text while preserving structure and handling whitespace.

    Args:
        html: HTML string to convert
        preserve_linebreaks: Whether to preserve line breaks from block elements

    Returns:
        Cleaned plain text string
    """
    # Parse HTML with BeautifulSoup
    soup = BeautifulSoup(html, "html.parser")

    # Handle line breaks if preserve_linebreaks is True
    if preserve_linebreaks:
        # Replace <br> tags with newlines
        for br in soup.find_all("br"):
            br.replace_with("\n")

        # Add newlines after block-level elements
        for tag in soup.find_all(
            ["p", "div", "h1", "h2", "h3", "h4", "h5", "h6", "li"]
        ):
            tag.append("\n")

    # Get text content
    text = soup.get_text()

    # Clean up whitespace
    text = re.sub(
        r"\n\s*\n", "\n\n", text
    )  # Convert multiple blank lines to double line breaks
    text = re.sub(r" +", " ", text)  # Remove multiple spaces
    return text.strip()


class HTMLToText(BaseNode):
    """
    Converts HTML to plain text by removing tags and decoding entities using BeautifulSoup.
    html, text, convert

    Use cases:
    - Cleaning HTML content for text analysis
    - Extracting readable content from web pages
    - Preparing HTML data for natural language processing
    """

    text: str | TextRef = Field(title="HTML", default="")
    preserve_linebreaks: bool = Field(
        title="Preserve Line Breaks",
        default=True,
        description="Convert block-level elements to newlines",
    )

    async def process(self, context: ProcessingContext) -> str | TextRef:
        html = await to_string(context, self.text)
        text = convert_html_to_text(html, self.preserve_linebreaks)
        return await convert_result(context, [self.text], text)


class Slice(BaseNode):
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

    text: str | TextRef = Field(title="Text", default="")
    start: int | None = Field(title="Start Index", default=None)
    stop: int | None = Field(title="Stop Index", default=None)
    step: int | None = Field(title="Step", default=None)

    async def process(self, context: ProcessingContext) -> str | TextRef:
        text = await to_string(context, self.text)
        res = text[slice(self.start, self.stop, self.step)]
        return await convert_result(context, [self.text], res)


class RecursiveTextSplitter(BaseNode):
    """
    Splits text recursively using LangChain's RecursiveCharacterTextSplitter.
    text, split, chunks

    Use cases:
    - Splitting documents while preserving semantic relationships
    - Creating chunks for language model processing
    - Handling text in languages with/without word boundaries
    """

    text: str | TextRef = Field(title="Text", default="")
    source_id: str = Field(title="Document ID", default="")
    chunk_size: int = Field(
        title="Chunk Size",
        default=1000,
        description="Maximum size of each chunk in characters",
    )
    chunk_overlap: int = Field(
        title="Chunk Overlap",
        default=200,
        description="Number of characters to overlap between chunks",
    )
    separators: list[str] = Field(
        default=[
            "\n\n",
            "\n",
            ".",
        ],
        description="List of separators to use for splitting, in order of preference",
    )

    async def process(self, context: ProcessingContext) -> list[TextChunk]:
        from langchain_text_splitters import RecursiveCharacterTextSplitter
        from langchain_core.documents import Document

        assert self.source_id, "document_id is required"

        content = await to_string(context, self.text)

        splitter = RecursiveCharacterTextSplitter(
            chunk_size=self.chunk_size,
            chunk_overlap=self.chunk_overlap,
            separators=self.separators,
            length_function=len,
            is_separator_regex=False,
            add_start_index=True,
        )

        docs = splitter.split_documents([Document(page_content=content)])

        return [
            TextChunk(
                text=doc.page_content,
                source_id=self.source_id,
                start_index=doc.metadata["start_index"],
            )
            for doc in docs
        ]


class MarkdownSplitter(BaseNode):
    """
    Splits markdown text by headers while preserving header hierarchy in metadata.
    markdown, split, headers

    Use cases:
    - Splitting markdown documentation while preserving structure
    - Processing markdown files for semantic search
    - Creating context-aware chunks from markdown content
    """

    text: str | TextRef = Field(title="Markdown Text", default="")
    source_id: str = Field(title="Document ID", default="")
    headers_to_split_on: list[tuple[str, str]] = Field(
        default=[
            ("#", "Header 1"),
            ("##", "Header 2"),
            ("###", "Header 3"),
        ],
        description="List of tuples containing (header_symbol, header_name)",
    )
    strip_headers: bool = Field(
        default=True,
        description="Whether to remove headers from the output content",
    )
    return_each_line: bool = Field(
        default=False,
        description="Whether to split into individual lines instead of header sections",
    )
    chunk_size: int | None = Field(
        default=None,
        description="Optional maximum chunk size for further splitting",
    )
    chunk_overlap: int = Field(
        default=30,
        description="Overlap size when using chunk_size",
    )

    async def process(self, context: ProcessingContext) -> list[TextChunk]:
        from langchain_text_splitters import (
            MarkdownHeaderTextSplitter,
            RecursiveCharacterTextSplitter,
        )

        content = await to_string(context, self.text)

        # Initialize markdown splitter
        markdown_splitter = MarkdownHeaderTextSplitter(
            headers_to_split_on=self.headers_to_split_on,
            strip_headers=self.strip_headers,
            return_each_line=self.return_each_line,
        )

        # Split by headers
        splits = markdown_splitter.split_text(content)

        # Further split by chunk size if specified
        if self.chunk_size:
            text_splitter = RecursiveCharacterTextSplitter(
                chunk_size=self.chunk_size, chunk_overlap=self.chunk_overlap
            )
            splits = text_splitter.split_documents(splits)

        # Convert Document objects to dictionaries
        return [
            TextChunk(
                text=doc.page_content,
                source_id=self.source_id,
                start_index=doc.metadata["start_index"],
            )
            for doc in splits
        ]
