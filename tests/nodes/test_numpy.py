import pytest
import numpy as np
from nodetool.workflows.processing_context import ProcessingContext
from nodetool.metadata.types import NPArray
from nodetool.nodes.lib.data.numpy import (
    AddArray,
    ListToArray,
    SubtractArray,
    MultiplyArray,
    DivideArray,
    ModulusArray,
    SineArray,
    CosineArray,
    PowerArray,
    SqrtArray,
    ConvertToImage,
    ConvertToAudio,
    Stack,
    MatMul,
    TransposeArray,
    MaxArray,
    MinArray,
    MeanArray,
    SumArray,
    ArgMaxArray,
    ArgMinArray,
    AbsArray,
    ArrayToScalar,
    ExpArray,
    LogArray,
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
        (AddArray(a=dummy_scalar, b=dummy_scalar), (float, int, NPArray)),
        (AddArray(a=dummy_array, b=dummy_array), NPArray),
        (SubtractArray(a=dummy_scalar, b=dummy_scalar), (float, int, NPArray)),
        (SubtractArray(a=dummy_array, b=dummy_array), NPArray),
        (MultiplyArray(a=dummy_scalar, b=dummy_scalar), (float, int, NPArray)),
        (MultiplyArray(a=dummy_array, b=dummy_array), NPArray),
        (DivideArray(a=dummy_scalar, b=dummy_scalar), (float, int, NPArray)),
        (DivideArray(a=dummy_array, b=dummy_array), NPArray),
        (ModulusArray(a=dummy_scalar, b=dummy_scalar), (float, int, NPArray)),
        (ModulusArray(a=dummy_array, b=dummy_array), NPArray),
        (SineArray(angle_rad=dummy_scalar), (float, NPArray)),
        (SineArray(angle_rad=dummy_array), NPArray),
        (CosineArray(angle_rad=dummy_scalar), (float, NPArray)),
        (CosineArray(angle_rad=dummy_array), NPArray),
        (PowerArray(base=dummy_scalar, exponent=dummy_scalar), (float, int, NPArray)),
        (PowerArray(base=dummy_array, exponent=dummy_scalar), NPArray),
        (
            SqrtArray(values=NPArray.from_numpy(np.array([dummy_scalar]))),
            (float, int, NPArray),
        ),
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
        (AddArray, 2, 3, 5),
        (SubtractArray, 5, 3, 2),
        (MultiplyArray, 2, 3, 6),
        (DivideArray, 6, 3, 2),
        (ModulusArray, 7, 3, 1),
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
        (SineArray, 0, 0),
        (SineArray, np.pi / 2, 1),
        (CosineArray, 0, 1),
        (CosineArray, np.pi, -1),
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
    node = PowerArray(base=2, exponent=3)
    result = await node.process(context)
    assert result == 8


@pytest.mark.asyncio
async def test_sqrt_function(context: ProcessingContext):
    node = SqrtArray(values=NPArray.from_numpy(np.array([9])))
    result = await node.process(context)
    assert result == 3


@pytest.mark.asyncio
async def test_array_operations(context: ProcessingContext):
    array1 = NPArray.from_numpy(np.array([1, 2, 3]))
    array2 = NPArray.from_numpy(np.array([4, 5, 6]))
    node = AddArray(a=array1, b=array2)
    result = await node.process(context)
    assert isinstance(result, NPArray)
    np.testing.assert_array_equal(result.to_numpy(), np.array([5, 7, 9]))


@pytest.mark.parametrize(
    "NodeClass",
    [
        AddArray,
        SubtractArray,
        MultiplyArray,
        DivideArray,
        ModulusArray,
        SineArray,
        CosineArray,
        PowerArray,
        SqrtArray,
    ],
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
        (ConvertToImage(values=dummy_array), ImageRef),
        (ConvertToAudio(values=dummy_array, sample_rate=44100), AudioRef),
        (Stack(arrays=[dummy_array, dummy_array], axis=0), NPArray),
        (MatMul(a=dummy_array, b=dummy_array), NPArray),
        (TransposeArray(values=dummy_array), NPArray),
        (MaxArray(values=dummy_array), int),
        (MinArray(values=dummy_array), int),
        (MeanArray(values=dummy_array), float),
        (SumArray(values=dummy_array), int),
        (ArgMaxArray(values=dummy_array), int),
        (ArgMinArray(values=dummy_array), int),
        (AbsArray(values=dummy_array), NPArray),
        (ArrayToScalar(values=NPArray.from_numpy(np.array([5]))), int),
        (ExpArray(values=dummy_array), NPArray),
        (LogArray(values=dummy_array), NPArray),
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

    node = ConvertToImage(values=NPArray.from_numpy(np.random.rand(100, 100, 3)))
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
    node = ArrayToScalar(values=NPArray.from_numpy(np.array([5])))
    result = await node.process(context)
    assert result == 5


@pytest.mark.asyncio
async def test_list_to_array(context: ProcessingContext):
    node = ListToArray(values=[1, 2, 3, 4, 5])
    result = await node.process(context)
    np.testing.assert_array_equal(result.to_numpy(), np.array([1, 2, 3, 4, 5]))
