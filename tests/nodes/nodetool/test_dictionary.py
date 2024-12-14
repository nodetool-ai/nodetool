import pytest
from nodetool.workflows.base_node import BaseNode
from nodetool.workflows.processing_context import ProcessingContext
from nodetool.nodes.nodetool.dictionary import (
    GetValue,
    Update,
    Remove,
    ParseJSON,
    Zip,
    Combine,
    Filter,
    ReduceDictionaries,
)

sample_dict = {"a": 1, "b": 2, "c": 3}
sample_json = '{"a": 1, "b": 2, "c": 3}'


@pytest.mark.asyncio
async def test_get_value(context: ProcessingContext):
    node = GetValue(dictionary=sample_dict, key="a")
    result = await node.process(context)
    assert result == 1


@pytest.mark.asyncio
async def test_update(context: ProcessingContext):
    node = Update(dictionary=sample_dict.copy(), new_pairs={"d": 4})
    result = await node.process(context)
    assert result == {"a": 1, "b": 2, "c": 3, "d": 4}


@pytest.mark.asyncio
async def test_remove(context: ProcessingContext):
    node = Remove(dictionary=sample_dict.copy(), key="a")
    result = await node.process(context)
    assert result == {"b": 2, "c": 3}


@pytest.mark.asyncio
async def test_parse_json(context: ProcessingContext):
    node = ParseJSON(json_string=sample_json)
    result = await node.process(context)
    assert result == sample_dict


@pytest.mark.asyncio
async def test_zip(context: ProcessingContext):
    node = Zip(keys=["a", "b", "c"], values=[1, 2, 3])
    result = await node.process(context)
    assert result == sample_dict


@pytest.mark.asyncio
async def test_combine(context: ProcessingContext):
    node = Combine(dict_a={"a": 1}, dict_b={"b": 2})
    result = await node.process(context)
    assert result == {"a": 1, "b": 2}


@pytest.mark.asyncio
async def test_filter(context: ProcessingContext):
    node = Filter(dictionary=sample_dict, keys=["a", "b"])
    result = await node.process(context)
    assert result == {"a": 1, "b": 2}


@pytest.mark.asyncio
async def test_reduce_dictionaries(context: ProcessingContext):
    node = ReduceDictionaries(
        dictionaries=[
            {"id": 1, "value": "a"},
            {"id": 2, "value": "b"},
            {"id": 3, "value": "c"},
        ],
        key_field="id",
        value_field="value",
    )
    result = await node.process(context)
    assert result == {1: "a", 2: "b", 3: "c"}


@pytest.mark.asyncio
async def test_empty_dictionary(context: ProcessingContext):
    node = GetValue(dictionary={}, key="a")
    result = await node.process(context)
    assert result is None


@pytest.mark.asyncio
async def test_update_existing_key(context: ProcessingContext):
    node = Update(dictionary=sample_dict.copy(), new_pairs={"a": 10})
    result = await node.process(context)
    assert result == {"a": 10, "b": 2, "c": 3}


@pytest.mark.asyncio
async def test_remove_nonexistent_key(context: ProcessingContext):
    node = Remove(dictionary=sample_dict.copy(), key="z")
    result = await node.process(context)
    assert result == sample_dict


@pytest.mark.asyncio
async def test_parse_invalid_json(context: ProcessingContext):
    node = ParseJSON(json_string='{"a": 1, "b": 2, "c": 3')
    with pytest.raises(Exception):
        await node.process(context)


@pytest.mark.asyncio
async def test_zip_mismatched_lengths(context: ProcessingContext):
    node = Zip(keys=["a", "b"], values=[1, 2, 3])
    await node.process(context)


@pytest.mark.asyncio
async def test_combine_with_overlap(context: ProcessingContext):
    node = Combine(dict_a={"a": 1}, dict_b={"a": 2, "b": 2})
    result = await node.process(context)
    assert result == {"a": 2, "b": 2}


@pytest.mark.asyncio
async def test_filter_nonexistent_keys(context: ProcessingContext):
    node = Filter(dictionary=sample_dict, keys=["x", "y"])
    result = await node.process(context)
    assert result == {}
