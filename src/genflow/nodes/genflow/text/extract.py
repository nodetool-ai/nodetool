import json
import re
from jsonpath_ng import parse
from typing import Any, Literal
from pydantic import Field
from genflow.workflows.processing_context import ProcessingContext
from genflow.metadata.types import TextRef
from genflow.workflows.genflow_node import GenflowNode
from genflow.nodes.genflow.text import convert_result, to_string


class ExtractNode(GenflowNode):
    """
    This node extracts a substring from a string.

    #### Inputs
    - `text`: The string from which the substring will be extracted.
    - `start`: The starting index of the substring.
    - `end`: The ending index of the substring.
    """

    text: str | TextRef = Field(title="Text", default="")
    start: int = Field(title="Start", default=0)
    end: int = Field(title="End", default=0)

    async def process(self, context: ProcessingContext) -> str | TextRef:
        text = await to_string(context, self.text)
        res = text[self.start : self.end]
        return await convert_result(context, [self.text], res)


class ChunkNode(GenflowNode):
    """
    This node chunks a string into substrings of a specified number of words.
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


class ExtractRegexNode(GenflowNode):
    """
    This node extracts a list of substrings from a string using a regular expression.
    Each group in the regular expression is extracted as a separate substring.

    #### Applications
    - Extracting substrings from a string using a regular expression.

    #### Example
    Suppose you have a string that contains a question and answer.
    Using a regex you can extract the question and answer as separate substrings.
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


class FindAllRegexNode(GenflowNode):
    """
    This node extracts a list of substrings from a string using a regular expression.
    Each match in the regular expression is extracted as a separate substring.
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


class ParseJSONNode(GenflowNode):
    """
    This node parses a JSON string into a Python object.

    #### Applications
    - Parsing JSON strings into Python objects for further processing.
    """

    text: str | TextRef = Field(title="JSON string", default="")

    async def process(self, context: ProcessingContext) -> Any:
        json_string = await to_string(context, self.text)
        return json.loads(json_string)


class ExtractJSONNode(GenflowNode):
    """
    This node uses a JSONPath to extract a specific object from a JSON object.

    The Extract JSON Node operates by accepting an input of a JSON object and a JSONPath expression then
    returns the object matching that JSONPath from the JSON object.

    #### Applications
    - Extracting specific data from a larger JSON object as part of a data processing or analysis workflow.
    - Retrieving and analyzing specific values from complex JSON structures.
    - Preprocessing data for subsequent nodes in an AI workflow.

    #### Example
    Suppose you have a large JSON object containing various pieces of information and you want to extract the price information.
    You can use the Extract JSON Node by feeding in the JSON object and specifying the JSONPath expression to the price field.
    The node will return the price information which can then be input to another node for further processing, such as a decision-making node or a data visualization node.
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
