import pytest
from nodetool.workflows.processing_context import ProcessingContext
from nodetool.nodes.nodetool.boolean import (
    BooleanOperation,
    LogicalOperator,
    Comparison,
    Not,
    Compare,
    ConditionalSwitch,
    IsNone,
    IsIn,
    All,
    Some,
)


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "node, expected_result",
    [
        (
            LogicalOperator(a=True, b=False, operation=BooleanOperation.AND),
            False,
        ),
        (
            LogicalOperator(a=True, b=True, operation=BooleanOperation.OR),
            True,
        ),
        (
            LogicalOperator(a=True, b=False, operation=BooleanOperation.XOR),
            True,
        ),
        (
            LogicalOperator(a=True, b=True, operation=BooleanOperation.NAND),
            False,
        ),
        (
            LogicalOperator(a=False, b=False, operation=BooleanOperation.NOR),
            True,
        ),
        (Not(value=True), False),
        (Compare(a=5, b=5, comparison=Comparison.EQUAL), True),
        (Compare(a=5, b=3, comparison=Comparison.GREATER_THAN), True),
        (Compare(a=5, b=7, comparison=Comparison.LESS_THAN), True),
        (ConditionalSwitch(condition=True, if_true=1, if_false=0), 1),
        (ConditionalSwitch(condition=False, if_true=1, if_false=0), 0),
        (IsNone(value=None), True),
        (IsNone(value=5), False),
        (IsIn(value=3, options=[1, 2, 3, 4]), True),
        (IsIn(value=5, options=[1, 2, 3, 4]), False),
        (All(values=[True, True, True]), True),
        (All(values=[True, False, True]), False),
        (Some(values=[False, True, False]), True),
        (Some(values=[False, False, False]), False),
    ],
)
async def test_boolean_nodes(context: ProcessingContext, node, expected_result):
    try:
        result = await node.process(context)
        assert result == expected_result
    except Exception as e:
        pytest.fail(f"Error processing {node.__class__.__name__}: {str(e)}")
