import asyncio
from io import BytesIO
import json

from typing import Any
import pandas as pd
from pydantic import Field
from nodetool.workflows.processing_context import ProcessingContext
from nodetool.metadata.types import DataframeRef, FolderRef
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
    values: str | list | dict[str, Any] = Field(title="Values", default={})

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

    value: str | TextRef = Field(title="Text", default_factory=TextRef)
    folder: FolderRef = Field(
        default=FolderRef(), description="Name of the output folder."
    )
    name: str = Field(title="Name", default="text.txt")

    async def process(self, context: ProcessingContext) -> TextRef:
        string = await to_string(context, self.value)
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
