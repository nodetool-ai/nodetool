import pytest
import numpy as np
from nodetool.workflows.processing_context import ProcessingContext
from nodetool.nodes.nodetool.math import (
    Add,
    Subtract,
    Multiply,
    Divide,
    Modulus,
    Sine,
    Cosine,
    Power,
    Sqrt,
)


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "NodeClass, a, b, expected",
    [
        (Add, 2, 3, 5),
        (Subtract, 5, 3, 2),
        (Multiply, 2, 3, 6),
        (Divide, 6, 3, 2),
        (Modulus, 7, 3, 1),
    ],
)
async def test_basic_math_operations(
    context: ProcessingContext, NodeClass, a, b, expected
):
    node = NodeClass(a=a, b=b)
    result = await node.process(context)
    assert result == expected


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "NodeClass, input_value, expected",
    [
        (Sine, 0, 0),
        (Sine, np.pi / 2, 1),
        (Cosine, 0, 1),
        (Cosine, np.pi, -1),
    ],
)
async def test_trigonometric_functions(
    context: ProcessingContext, NodeClass, input_value, expected
):
    node = NodeClass(angle_rad=input_value)
    result = await node.process(context)
    assert np.isclose(result, expected)


@pytest.mark.asyncio
async def test_power_function(context: ProcessingContext):
    node = Power(base=2, exponent=3)
    result = await node.process(context)
    assert result == 8


@pytest.mark.asyncio
async def test_sqrt_function(context: ProcessingContext):
    node = Sqrt(x=9)
    result = await node.process(context)
    assert result == 3
