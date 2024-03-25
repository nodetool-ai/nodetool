import asyncio
from io import BytesIO
import json

import numpy as np
from nodetool.common.environment import Environment
from typing import Any, Literal
import pandas as pd
from pydantic import Field
from nodetool.workflows.processing_context import ProcessingContext
from nodetool.metadata.types import DataFrame
from nodetool.metadata.types import TextRef
from nodetool.workflows.base_node import BaseNode
from nodetool.metadata.types import Tensor


async def to_string(context: ProcessingContext, text: TextRef | str) -> str:
    if isinstance(text, TextRef):
        stream = await context.to_io(text)
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


class ConcatNode(BaseNode):
    """
    Concat Node is a function that combines the output from several nodes into a single output.

    This node is beneficial for users who need a simple way to concatenate, or combine, the outputs of two or more nodes. Particularly useful in instances where several outputs need to be streamlined into a single output.

    #### Applications
    - Concatenating the result of two different text processing nodes, such as word frequency and sentiment analysis, into a single output for further processing.
    - Combining various elements of a sentence or paragraph to streamline the information.
    """

    a: str | TextRef = ""
    b: str | TextRef = ""

    async def process(self, context: ProcessingContext) -> str | TextRef:
        res = await to_string(context, self.a) + await to_string(context, self.b)
        return await convert_result(context, [self.a, self.b], res)


class JoinNode(BaseNode):
    """
    This node joins a list of strings into a single string.
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


class TemplateNode(BaseNode):
    """
    This node replaces placeholders in a string with values.
    """

    string: str | TextRef = Field(title="String", default="")
    values: dict[str, Any] = Field(title="Values", default={})

    async def process(self, context: ProcessingContext) -> str | TextRef:
        string = await to_string(context, self.string)
        res = string.format(**self.values)
        return await convert_result(context, [self.string], res)


class ReplaceNode(BaseNode):
    """
    This node replaces a substring in a string with another substring.
    """

    text: str | TextRef = Field(title="Text", default="")
    old: str = Field(title="Old", default="")
    new: str = Field(title="New", default="")

    async def process(self, context: ProcessingContext) -> str | TextRef:
        text = await to_string(context, self.text)
        res = text.replace(self.old, self.new)
        return await convert_result(context, [self.text], res)


class JSONToDataframeNode(BaseNode):
    """
    This node transforms a list of JSON strings into a dataframe.

    The JSON To Dataframe Node allows you to easily convert JSON formatted data into a tabular structure. A JSON string, representing multiple entries, is transformed into a Pandas dataframe which can be used for further data manipulations and analysis.
    """

    text: str | TextRef = Field(title="JSON", default_factory=TextRef)

    async def process(self, context: ProcessingContext) -> DataFrame:
        json_string = await to_string(context, self.text)
        rows = json.loads(json_string)
        df = pd.DataFrame(rows)
        return await context.from_pandas(df)


class SaveTextNode(BaseNode):
    """
    This node saves a text file to the assets folder.

    The Save Text Node is used to save a text file to the assets folder. The node accepts a string as input and saves it to a text file. The text file is then uploaded to the assets folder and can be used as input to other nodes in the workflow.
    """

    value: str | TextRef = Field(title="Text", default_factory=TextRef)
    name: str = Field(title="Name", default="text.txt")

    async def process(self, context: ProcessingContext) -> TextRef:
        string = await to_string(context, self.value)
        file = BytesIO(string.encode("utf-8"))
        asset, s3_uri = await context.create_asset(self.name, "text/plain", file)
        return TextRef(uri=s3_uri, asset_id=asset.id)


class SplitNode(BaseNode):
    """
    The Split Node separates a given text into a list of strings based on a specified delimiter.

    This node is designed to break down provided text based on a specified separator or delimiter. The delimiter can be any character or combination of characters. The output is a list of strings divided based on the given delimiter.

    #### Applications
    - Breaking down user input into manageable segments.
    - Splitting text data received from other nodes for further data manipulation.
    """

    text: str | TextRef = Field(title="Text", default="")
    delimiter: str = ","

    async def process(self, context: ProcessingContext) -> list[str]:
        text = await to_string(context, self.text)
        res = text.split(self.delimiter)
        return res


class EmbeddingNode(BaseNode):
    """
    This node creates a vector representation of input text.

    The purpose of this node is to convert raw text into a more structured and useful format, namely embeddings. These embeddings are vector representations of the text that capture its semantic content. They are created using pre-trained transformers which have learned to understand the meaning of text from large amounts of data. This node is essential for natural language processing and can support several tasks including text classification, information retrieval, and similarity measurement.

    #### Applications
    - Text Classification: The embeddings can be fed into a classifier to categorize the text.
    - Information Retrieval: The embeddings can be used to find relevant information in a dataset.
    - Similarity Measurement: The embeddings can be used to find similar texts based on their content.
    """

    text: str = Field(title="Text", default="")

    async def process(self, context: ProcessingContext) -> Tensor:
        client = Environment.get_openai_client()
        res = await client.embeddings.create(
            model="text-embedding-ada-002",
            input=self.text,
        )
        assert len(res.data) > 0
        embeddings = [np.array(i.embedding) for i in res.data]
        assert len(embeddings) > 0
        return Tensor.from_numpy(np.array(embeddings[0]))
