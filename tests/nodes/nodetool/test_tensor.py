import pytest
import numpy as np
from nodetool.workflows.processing_context import ProcessingContext
from nodetool.metadata.types import Tensor, ImageRef, AudioRef, FolderRef
from nodetool.nodes.nodetool.tensor import (
    SaveTensor,
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
    TensorToScalar,
    ScalarToTensor,
    ListToTensor,
    PlotTensor,
    PlotTSNE,
    TensorToList,
    Exp,
    Log,
)

# Create dummy inputs for testing
dummy_tensor = Tensor.from_numpy(np.array([[1, 2], [3, 4]]))
dummy_folder = FolderRef(asset_id="dummy_folder_id")


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "node, expected_type",
    [
        (ConvertToImage(tensor=dummy_tensor), ImageRef),
        (ConvertToAudio(tensor=dummy_tensor, sample_rate=44100), AudioRef),
        (Stack(tensors=[dummy_tensor, dummy_tensor], axis=0), Tensor),
        (MatMul(a=dummy_tensor, b=dummy_tensor), Tensor),
        (Transpose(tensor=dummy_tensor), Tensor),
        (Max(tensor=dummy_tensor), int),
        (Min(tensor=dummy_tensor), int),
        (Mean(tensor=dummy_tensor), float),
        (Sum(tensor=dummy_tensor), int),
        (ArgMax(a=dummy_tensor), int),
        (ArgMin(tensor=dummy_tensor), int),
        (Abs(input_tensor=dummy_tensor), Tensor),
        (TensorToScalar(tensor=Tensor.from_numpy(np.array([5]))), int),
        (ScalarToTensor(value=5), Tensor),
        (ListToTensor(values=[1, 2, 3]), Tensor),
        (PlotTensor(tensor=dummy_tensor, plot_type=PlotTensor.PlotType.LINE), ImageRef),
        (PlotTSNE(tensor=dummy_tensor, color_indices=[0, 1], perplexity=1), ImageRef),
        (TensorToList(tensor=dummy_tensor), list),
        (Exp(x=dummy_tensor), Tensor),
        (Log(x=dummy_tensor), Tensor),
    ],
)
async def test_tensor_nodes(context: ProcessingContext, node, expected_type, mocker):
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

    node = ConvertToImage(tensor=Tensor.from_numpy(np.random.rand(100, 100, 3)))
    result = await node.process(context)

    assert isinstance(result, ImageRef)
    assert result.asset_id == "test_image_id"


@pytest.mark.asyncio
async def test_mat_mul(context: ProcessingContext):
    a = Tensor.from_numpy(np.array([[1, 2], [3, 4]]))
    b = Tensor.from_numpy(np.array([[5, 6], [7, 8]]))
    node = MatMul(a=a, b=b)
    result = await node.process(context)

    expected = np.array([[19, 22], [43, 50]])
    np.testing.assert_array_equal(result.to_numpy(), expected)


@pytest.mark.asyncio
async def test_tensor_to_scalar(context: ProcessingContext):
    node = TensorToScalar(tensor=Tensor.from_numpy(np.array([5])))
    result = await node.process(context)
    assert result == 5


@pytest.mark.asyncio
async def test_list_to_tensor(context: ProcessingContext):
    node = ListToTensor(values=[1, 2, 3, 4, 5])
    result = await node.process(context)
    np.testing.assert_array_equal(result.to_numpy(), np.array([1, 2, 3, 4, 5]))


@pytest.mark.asyncio
async def test_exp_and_log(context: ProcessingContext):
    x = Tensor.from_numpy(np.array([0, 1, 2]))
    exp_node = Exp(x=x)
    log_node = Log(x=await exp_node.process(context))
    result = await log_node.process(context)
    assert isinstance(result, Tensor)
    np.testing.assert_array_almost_equal(result.to_numpy(), x.to_numpy())
