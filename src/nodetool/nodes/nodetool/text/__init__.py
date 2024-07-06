import asyncio
from io import BytesIO
import json

import numpy as np
from nodetool.common.environment import Environment
from typing import Any, Literal
import pandas as pd
from pydantic import Field
from nodetool.workflows.processing_context import ProcessingContext
from nodetool.metadata.types import DataframeRef
from nodetool.metadata.types import TextRef
from nodetool.workflows.base_node import BaseNode
from nodetool.metadata.types import Tensor


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
    """

    string: str | TextRef = Field(title="String", default="")
    values: dict[str, Any] = Field(title="Values", default={})

    async def process(self, context: ProcessingContext) -> str | TextRef:
        string = await to_string(context, self.string)
        res = string.format(**self.values)
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
    name: str = Field(title="Name", default="text.txt")

    async def process(self, context: ProcessingContext) -> TextRef:
        string = await to_string(context, self.value)
        file = BytesIO(string.encode("utf-8"))
        asset = await context.create_asset(self.name, "text/plain", file)
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
