import pytest
import numpy as np
from nodetool.workflows.processing_context import ProcessingContext
from nodetool.metadata.types import NPArray
from nodetool.nodes.lib.data.numpy import (
    Add,
    ListToArray,
    Subtract,
    Multiply,
    Divide,
    Modulus,
    Sine,
    Cosine,
    Power,
    Sqrt,
    ConvertToImage,
    ConvertToAudio,
    Stack,
    MatMul,
    Transpose,
    Max,
    Min,
    Mean,
    Sum,
    ArgMax,
    ArgMin,
    Abs,
    arrayToScalar,
    Exp,
    Log,
)

import pytest
import numpy as np
from nodetool.workflows.processing_context import ProcessingContext
from nodetool.metadata.types import NPArray, ImageRef, AudioRef, FolderRef


# Create dummy inputs for testing
dummy_scalar = 5
dummy_array = NPArray.from_numpy(np.array([1, 2, 3, 4, 5]))


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "node, expected_type",
    [
        (Add(a=dummy_scalar, b=dummy_scalar), (float, int, NPArray)),
        (Add(a=dummy_array, b=dummy_array), NPArray),
        (Subtract(a=dummy_scalar, b=dummy_scalar), (float, int, NPArray)),
        (Subtract(a=dummy_array, b=dummy_array), NPArray),
        (Multiply(a=dummy_scalar, b=dummy_scalar), (float, int, NPArray)),
        (Multiply(a=dummy_array, b=dummy_array), NPArray),
        (Divide(a=dummy_scalar, b=dummy_scalar), (float, int, NPArray)),
        (Divide(a=dummy_array, b=dummy_array), NPArray),
        (Modulus(a=dummy_scalar, b=dummy_scalar), (float, int, NPArray)),
        (Modulus(a=dummy_array, b=dummy_array), NPArray),
        (Sine(angle_rad=dummy_scalar), (float, NPArray)),
        (Sine(angle_rad=dummy_array), NPArray),
        (Cosine(angle_rad=dummy_scalar), (float, NPArray)),
        (Cosine(angle_rad=dummy_array), NPArray),
        (Power(base=dummy_scalar, exponent=dummy_scalar), (float, int, NPArray)),
        (Power(base=dummy_array, exponent=dummy_scalar), NPArray),
        (Sqrt(x=dummy_scalar), (float, int, NPArray)),
        (Sqrt(x=dummy_array), NPArray),
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
async def test_array_operations(context: ProcessingContext):
    array1 = NPArray.from_numpy(np.array([1, 2, 3]))
    array2 = NPArray.from_numpy(np.array([4, 5, 6]))
    node = Add(a=array1, b=array2)
    result = await node.process(context)
    assert isinstance(result, NPArray)
    np.testing.assert_array_equal(result.to_numpy(), np.array([5, 7, 9]))


@pytest.mark.parametrize(
    "NodeClass", [Add, Subtract, Multiply, Divide, Modulus, Sine, Cosine, Power, Sqrt]
)
def test_node_attributes(NodeClass):
    node = NodeClass()
    assert hasattr(node, "process")
    assert callable(node.process)


# Create dummy inputs for testing
dummy_array = NPArray.from_numpy(np.array([[1, 2], [3, 4]]))
dummy_folder = FolderRef(asset_id="dummy_folder_id")


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "node, expected_type",
    [
        (ConvertToImage(array=dummy_array), ImageRef),
        (ConvertToAudio(array=dummy_array, sample_rate=44100), AudioRef),
        (Stack(arrays=[dummy_array, dummy_array], axis=0), NPArray),
        (MatMul(a=dummy_array, b=dummy_array), NPArray),
        (Transpose(array=dummy_array), NPArray),
        (Max(array=dummy_array), int),
        (Min(array=dummy_array), int),
        (Mean(array=dummy_array), float),
        (Sum(array=dummy_array), int),
        (ArgMax(a=dummy_array), int),
        (ArgMin(array=dummy_array), int),
        (Abs(input_array=dummy_array), NPArray),
        (arrayToScalar(array=NPArray.from_numpy(np.array([5]))), int),
        (Exp(x=dummy_array), NPArray),
        (Log(x=dummy_array), NPArray),
    ],
)
async def test_array_nodes(context: ProcessingContext, node, expected_type, mocker):
    try:
        result = await node.process(context)
        assert isinstance(result, expected_type)
    except Exception as e:
        pytest.fail(f"Error processing {node.__class__.__name__}: {str(e)}")


@pytest.mark.asyncio
async def test_convert_to_image(context: ProcessingContext, mocker):
    mocker.patch.object(
        context, "image_from_pil", return_value=ImageRef(asset_id="test_image_id")
    )

    node = ConvertToImage(array=NPArray.from_numpy(np.random.rand(100, 100, 3)))
    result = await node.process(context)

    assert isinstance(result, ImageRef)
    assert result.asset_id == "test_image_id"


@pytest.mark.asyncio
async def test_mat_mul(context: ProcessingContext):
    a = NPArray.from_numpy(np.array([[1, 2], [3, 4]]))
    b = NPArray.from_numpy(np.array([[5, 6], [7, 8]]))
    node = MatMul(a=a, b=b)
    result = await node.process(context)

    expected = np.array([[19, 22], [43, 50]])
    np.testing.assert_array_equal(result.to_numpy(), expected)


@pytest.mark.asyncio
async def test_array_to_scalar(context: ProcessingContext):
    node = arrayToScalar(array=NPArray.from_numpy(np.array([5])))
    result = await node.process(context)
    assert result == 5


@pytest.mark.asyncio
async def test_list_to_array(context: ProcessingContext):
    node = ListToArray(values=[1, 2, 3, 4, 5])
    result = await node.process(context)
    np.testing.assert_array_equal(result.to_numpy(), np.array([1, 2, 3, 4, 5]))


@pytest.mark.asyncio
async def test_exp_and_log(context: ProcessingContext):
    x = NPArray.from_numpy(np.array([0, 1, 2]))
    exp_node = Exp(x=x)
    log_node = Log(x=await exp_node.process(context))
    result = await log_node.process(context)
    assert isinstance(result, NPArray)
    np.testing.assert_array_almost_equal(result.to_numpy(), x.to_numpy())
