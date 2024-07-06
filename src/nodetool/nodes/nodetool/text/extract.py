import json
import re
from jsonpath_ng import parse
from typing import Any
from pydantic import Field
from nodetool.workflows.processing_context import ProcessingContext
from nodetool.metadata.types import LlamaModel, Tensor, TextRef
from nodetool.workflows.base_node import BaseNode
from nodetool.nodes.nodetool.text import convert_result, to_string


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
