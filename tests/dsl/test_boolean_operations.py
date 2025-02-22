import pytest
from nodetool.dsl.graph import graph_result
from nodetool.dsl.nodetool.boolean import (
    Compare,
    LogicalOperator,
    ConditionalSwitch,
    IsIn,
)
from nodetool.dsl.nodetool.output import BooleanOutput, StringOutput

# Basic comparison
basic_comparison = BooleanOutput(
    name="basic_comparison",
    value=Compare(a=5, b=3, comparison=Compare.Comparison(">")),
)

# Logical operators
logical_ops = BooleanOutput(
    name="logical_ops",
    value=LogicalOperator(
        a=Compare(a=10, b=5, comparison=Compare.Comparison(">")),
        b=Compare(a=20, b=15, comparison=Compare.Comparison(">")),
        operation=LogicalOperator.BooleanOperation("and"),
    ),
)

# Conditional switch
conditional = StringOutput(
    name="conditional",
    value=ConditionalSwitch(
        condition=Compare(a=42, b=42, comparison=Compare.Comparison("==")),
        if_true="Values are equal",
        if_false="Values are different",
    ),
)

# List membership check
membership = BooleanOutput(
    name="membership",
    value=IsIn(value=5, options=[1, 3, 5, 7, 9]),
)


@pytest.mark.asyncio
async def test_basic_comparison():
    result = await graph_result(basic_comparison)
    assert result is True  # 5 > 3


@pytest.mark.asyncio
async def test_logical_ops():
    result = await graph_result(logical_ops)
    assert result is True  # (10 > 5) and (20 > 15)


@pytest.mark.asyncio
async def test_conditional():
    result = await graph_result(conditional)
    assert result == "Values are equal"


@pytest.mark.asyncio
async def test_membership():
    result = await graph_result(membership)
    assert result is True  # 5 in [1, 3, 5, 7, 9]
