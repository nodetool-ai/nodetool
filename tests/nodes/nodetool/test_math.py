import pytest
import numpy as np
from nodetool.workflows.processing_context import ProcessingContext
from nodetool.metadata.types import Tensor
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

# Create dummy inputs for testing
dummy_scalar = 5
dummy_tensor = Tensor.from_numpy(np.array([1, 2, 3, 4, 5]))


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "node, expected_type",
    [
        (Add(a=dummy_scalar, b=dummy_scalar), (float, int, Tensor)),
        (Add(a=dummy_tensor, b=dummy_tensor), Tensor),
        (Subtract(a=dummy_scalar, b=dummy_scalar), (float, int, Tensor)),
        (Subtract(a=dummy_tensor, b=dummy_tensor), Tensor),
        (Multiply(a=dummy_scalar, b=dummy_scalar), (float, int, Tensor)),
        (Multiply(a=dummy_tensor, b=dummy_tensor), Tensor),
        (Divide(a=dummy_scalar, b=dummy_scalar), (float, int, Tensor)),
        (Divide(a=dummy_tensor, b=dummy_tensor), Tensor),
        (Modulus(a=dummy_scalar, b=dummy_scalar), (float, int, Tensor)),
        (Modulus(a=dummy_tensor, b=dummy_tensor), Tensor),
        (Sine(angle_rad=dummy_scalar), (float, Tensor)),
        (Sine(angle_rad=dummy_tensor), Tensor),
        (Cosine(angle_rad=dummy_scalar), (float, Tensor)),
        (Cosine(angle_rad=dummy_tensor), Tensor),
        (Power(base=dummy_scalar, exponent=dummy_scalar), (float, int, Tensor)),
        (Power(base=dummy_tensor, exponent=dummy_scalar), Tensor),
        (Sqrt(x=dummy_scalar), (float, int, Tensor)),
        (Sqrt(x=dummy_tensor), Tensor),
    ],
)
async def test_math_nodes(context: ProcessingContext, node, expected_type):
    try:
        result = await node.process(context)
        assert isinstance(result, expected_type)
    except Exception as e:
        pytest.fail(f"Error processing {node.__class__.__name__}: {str(e)}")


# Additional tests for specific node behaviors


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


@pytest.mark.asyncio
async def test_tensor_operations(context: ProcessingContext):
    tensor1 = Tensor.from_numpy(np.array([1, 2, 3]))
    tensor2 = Tensor.from_numpy(np.array([4, 5, 6]))
    node = Add(a=tensor1, b=tensor2)
    result = await node.process(context)
    assert isinstance(result, Tensor)
    np.testing.assert_array_equal(result.to_numpy(), np.array([5, 7, 9]))


@pytest.mark.parametrize(
    "NodeClass", [Add, Subtract, Multiply, Divide, Modulus, Sine, Cosine, Power, Sqrt]
)
def test_node_attributes(NodeClass):
    node = NodeClass()
    assert hasattr(node, "process")
    assert callable(node.process)
