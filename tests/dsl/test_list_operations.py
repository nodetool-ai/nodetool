import pytest
from nodetool.dsl.graph import graph_result
from nodetool.dsl.nodetool.list import (
    Append,
    Chunk,
    FilterDictsByValue,
    FilterNone,
    FilterNumbers,
    Flatten,
    Sort,
    Transform,
    Union,
)
from nodetool.dsl.nodetool.output import StringOutput, ListOutput
from nodetool.dsl.nodetool.text import Join

# Basic list operations
basic_list_ops = StringOutput(
    name="basic_list_ops",
    value=Join(
        strings=Sort(
            values=Append(values=["banana", "apple", "cherry"], value="date"),
            order=Sort.SortOrder("ascending"),
        ),
        separator=", ",
    ),
)

# List transformations and filtering
list_transform = ListOutput(
    name="list_transform",
    value=FilterNumbers(
        values=Transform(
            values=["1", "2", "3", "4", "5"],
            transform_type=Transform.TransformType("to_float"),
        ),
        filter_type=FilterNumbers.FilterNumberType("greater_than"),
        value=2.5,
    ),
)

# # List aggregation operations
# list_aggregation = DictionaryOutput(
#     name="list_aggregation",
#     value={
#         "sum": Sum(values=[1, 2, 3, 4, 5]),
#         "average": Average(values=[1, 2, 3, 4, 5]),
#         "max": Maximum(values=[1, 2, 3, 4, 5]),
#         "min": Minimum(values=[1, 2, 3, 4, 5]),
#     },
# )

# List set operations
list_sets = ListOutput(
    name="list_sets", value=Union(list1=[1, 2, 3, 4], list2=[3, 4, 5, 6])
)

# Complex list manipulation
complex_list = ListOutput(
    name="complex_list",
    value=Chunk(
        values=FilterNone(
            values=Flatten(values=[[1, None, 2], [3, None], [4, 5]], max_depth=1)
        ),
        chunk_size=2,
    ),
)

# Dictionary list operations
dict_list_ops = ListOutput(
    name="dict_list_ops",
    value=FilterDictsByValue(
        values=[
            {"name": "Alice", "age": 25},
            {"name": "Bob", "age": 30},
            {"name": "Charlie", "age": 35},
        ],
        key="name",
        filter_type=FilterDictsByValue.FilterType("contains"),
        criteria="Bob",
    ),
)


@pytest.mark.asyncio
async def test_basic_list_ops():
    result = await graph_result(basic_list_ops)
    assert result == "apple, banana, cherry, date"


@pytest.mark.asyncio
async def test_list_transform():
    result = await graph_result(list_transform)
    assert all(x > 2.5 for x in result)


# @pytest.mark.asyncio
# async def test_list_aggregation():
#     result = await graph_result(list_aggregation)
#     assert result["sum"] == 15
#     assert result["average"] == 3.0
#     assert result["max"] == 5
#     assert result["min"] == 1


@pytest.mark.asyncio
async def test_list_sets():
    result = await graph_result(list_sets)
    assert set(result) == {1, 2, 3, 4, 5, 6}


@pytest.mark.asyncio
async def test_complex_list():
    result = await graph_result(complex_list)
    assert result == [[1, 2], [3, 4], [5]]
