import pytest
from nodetool.dsl.graph import graph_result
from nodetool.dsl.nodetool.dictionary import (
    ArgMax,
    Combine,
    Filter,
    GetValue,
    Update,
    Zip,
)
from nodetool.dsl.nodetool.output import StringOutput, IntegerOutput, DictionaryOutput

# Create and manipulate dictionaries
make_dict = StringOutput(
    name="make_dict",
    value=GetValue(
        dictionary=Update(
            dictionary={"name": "Alice", "age": 30},
            new_pairs={"city": "New York", "role": "Developer"},
        ),
        key="role",
        default="Unknown",
    ),
)

# Combine dictionaries
combined_dict = IntegerOutput(
    name="combined_dict",
    value=GetValue(
        dictionary=Combine(
            dict_a={"a": 1, "b": 2},
            dict_b={"b": 3, "c": 4},
        ),
        key="b",
        default=0,
    ),
)

# Filter dictionary keys
filtered_dict = DictionaryOutput(
    name="filtered_dict",
    value=Filter(
        dictionary={"name": "Bob", "age": 25, "city": "London", "country": "UK"},
        keys=["name", "city"],
    ),
)

# Create dictionary from parallel lists
zipped_dict = DictionaryOutput(
    name="zipped_dict", value=Zip(keys=["a", "b", "c"], values=[1, 2, 3])
)

# Find maximum value in dictionary
argmax_example = StringOutput(
    name="argmax_example",
    value=ArgMax(scores={"cat": 0.7, "dog": 0.9, "bird": 0.3}),
)


@pytest.mark.asyncio
async def test_make_dict():
    result = await graph_result(make_dict)
    assert result == "Developer"


@pytest.mark.asyncio
async def test_combined_dict():
    result = await graph_result(combined_dict)
    assert result == 3


@pytest.mark.asyncio
async def test_filtered_dict():
    result = await graph_result(filtered_dict)
    assert result == {"name": "Bob", "city": "London"}


@pytest.mark.asyncio
async def test_zipped_dict():
    result = await graph_result(zipped_dict)
    assert result == {"a": 1, "b": 2, "c": 3}


@pytest.mark.asyncio
async def test_argmax_example():
    result = await graph_result(argmax_example)
    assert result == "dog"
