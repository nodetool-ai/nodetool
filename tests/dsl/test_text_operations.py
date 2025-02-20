import pytest
from nodetool.dsl.graph import graph_result
from nodetool.dsl.nodetool.text import (
    Concat,
    Template,
    RegexReplace,
    Split,
    Join,
    Contains,
)
from nodetool.dsl.nodetool.output import StringOutput, BooleanOutput

# Example 1: Basic text concatenation
text_concat = StringOutput(name="text_concat", value=Concat(a="Hello, ", b="World!"))

# Example 2: Template with variable substitution
template_text = StringOutput(
    name="template_text",
    value=Template(
        string="Hello, {{ name }}! Today is {{ day }}.",
        values={"name": "Alice", "day": "Monday"},
    ),
)

# Example 3: Regex replacement
regex_replace = StringOutput(
    name="regex_replace",
    value=RegexReplace(
        text="The color is grey and gray",
        pattern="gr[ae]y",
        replacement="blue",
        count=1,
    ),
)

# Example 4: Split and join operation
split_join = StringOutput(
    name="split_join",
    value=Join(
        strings=Split(text="apple,banana,orange", delimiter=","),
        separator=" | ",
    ),
)

# Example 5: Text contains check
contains_check = BooleanOutput(
    name="contains_check",
    value=Contains(
        text="Python programming is fun", substring="programming", case_sensitive=True
    ),
)


@pytest.mark.asyncio
async def test_text_concat():
    result = await graph_result(text_concat)
    assert result == "Hello, World!"


@pytest.mark.asyncio
async def test_template_text():
    result = await graph_result(template_text)
    assert result == "Hello, Alice! Today is Monday."


@pytest.mark.asyncio
async def test_regex_replace():
    result = await graph_result(regex_replace)
    assert result == "The color is blue and gray"


@pytest.mark.asyncio
async def test_split_join():
    result = await graph_result(split_join)
    assert result == "apple | banana | orange"


@pytest.mark.asyncio
async def test_contains_check():
    result = await graph_result(contains_check)
    assert result is True
