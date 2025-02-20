import pytest
from nodetool.dsl.graph import graph_result
from nodetool.dsl.lib.data.numpy import (
    AbsArray,
    ListToArray,
    MatMul,
    MeanArray,
    PowerArray,
    Reshape2D,
    SubtractArray,
    SumArray,
)
from nodetool.dsl.nodetool.output import ArrayOutput, FloatOutput
from nodetool.metadata.types import NPArray

# Matrix operations
matrix_ops = ArrayOutput(
    name="matrix_ops",
    value=MatMul(
        a=Reshape2D(values=ListToArray(values=[1, 2, 3, 4]), num_rows=2, num_cols=2),
        b=Reshape2D(values=ListToArray(values=[2, 0, 1, 3]), num_rows=2, num_cols=2),
    ),
)

# Array transformations
array_transform = FloatOutput(
    name="array_transform",
    value=MeanArray(
        values=AbsArray(values=SubtractArray(a=ListToArray(values=[1, -2, 3, -4]), b=2))
    ),
)

# Complex array manipulation
complex_array = FloatOutput(
    name="complex_array",
    value=SumArray(
        values=PowerArray(
            base=Reshape2D(
                values=ListToArray(values=[1, 2, 3, 4]), num_rows=2, num_cols=2
            ),
            exponent=2,
        )
    ),
)


@pytest.mark.asyncio
async def test_matrix_ops():
    result = await graph_result(matrix_ops)
    result = NPArray(**result).to_list()
    assert result is not None
    # Result should be a 2x2 matrix multiplication
    # [1 2] * [2 0] = [4  6]
    # [3 4]   [1 3]   [10 12]

    assert len(result) == 2
    assert len(result[0]) == 2


@pytest.mark.asyncio
async def test_array_transform():
    result = await graph_result(array_transform)
    # Mean of absolute values after subtracting 2 from [1, -2, 3, -4]
    # [1-2, -2-2, 3-2, -4-2] = [-1, -4, 1, -6]
    # abs = [1, 4, 1, 6]
    # mean = 3.0
    assert pytest.approx(result, 0.0001) == 3.0


@pytest.mark.asyncio
async def test_complex_array():
    result = await graph_result(complex_array)
    # Sum of squared values in 2x2 matrix [1,2,3,4]
    # Square: [1,4,9,16]
    # Sum: 30
    assert pytest.approx(result, 0.0001) == 30.0
