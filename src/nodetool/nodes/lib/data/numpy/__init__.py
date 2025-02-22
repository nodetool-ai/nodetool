from typing import Tuple
import numpy as np
from pydantic import Field
from nodetool.workflows.processing_context import ProcessingContext
from nodetool.workflows.base_node import BaseNode
from nodetool.metadata.types import to_numpy
from nodetool.metadata.types import NPArray

from datetime import datetime
from enum import Enum
from io import BytesIO
import PIL.Image
from matplotlib import pyplot as plt
from sklearn.manifold import TSNE
import seaborn as sns
import numpy as np
from pydantic import Field
from typing import Any, Literal
from nodetool.nodes.lib.audio.audio_helpers import numpy_to_audio_segment
from nodetool.workflows.processing_context import ProcessingContext
from nodetool.metadata.types import AudioRef, FolderRef, ImageRef
from nodetool.workflows.base_node import BaseNode
from nodetool.metadata.types import to_numpy
from nodetool.metadata.types import NPArray


def pad_arrays(a: np.ndarray, b: np.ndarray) -> Tuple[(np.ndarray, np.ndarray)]:
    """
    If one of the arguments is a scalar, both arguments are returned as is.
    Pads the smaller array with zeros so that both arrays are the same size.
    This is useful for operations like addition and subtraction.
    """
    if a.size == 1 or b.size == 1:
        return (a, b)
    if len(a) != len(b):
        if len(a) > len(b):
            b = np.pad(b, (0, (len(a) - len(b))), "constant")
        else:
            a = np.pad(a, (0, (len(b) - len(a))), "constant")
    return (a, b)


async def convert_output(
    context: ProcessingContext, output: np.ndarray
) -> float | int | NPArray:
    if output.size == 1:
        return output.item()
    else:
        return NPArray.from_numpy(output)


class BinaryOperation(BaseNode):
    _layout = "small"
    a: int | float | NPArray = Field(title="A", default=0.0)
    b: int | float | NPArray = Field(title="B", default=0.0)

    async def process(self, context: ProcessingContext) -> int | float | NPArray:
        a = to_numpy(self.a)
        b = to_numpy(self.b)
        if a.size > 1 and b.size > 1:
            (a, b) = pad_arrays(a, b)
        res = self.operation(a, b)
        return await convert_output(context, res)

    def operation(self, a: np.ndarray, b: np.ndarray) -> np.ndarray:
        raise NotImplementedError()


class AddArray(BinaryOperation):
    """
    Performs addition on two arrays.
    math, plus, add, addition, sum, +
    """

    def operation(self, a: np.ndarray, b: np.ndarray) -> np.ndarray:
        return np.add(a, b)


class SubtractArray(BinaryOperation):
    """
    Subtracts the second array from the first.
    math, minus, difference, -
    """

    def operation(self, a: np.ndarray, b: np.ndarray) -> np.ndarray:
        return np.subtract(a, b)


class MultiplyArray(BinaryOperation):
    """
    Multiplies two arrays.
    math, product, times, *
    """

    def operation(self, a: np.ndarray, b: np.ndarray) -> np.ndarray:
        return np.multiply(a, b)


class DivideArray(BinaryOperation):
    """
    Divides the first array by the second.
    math, division, arithmetic, quotient, /
    """

    def operation(self, a: np.ndarray, b: np.ndarray) -> np.ndarray:
        return np.divide(a, b)


class ModulusArray(BinaryOperation):
    """
    Calculates the element-wise remainder of division.
    math, modulo, remainder, mod, %

    Use cases:
    - Implementing cyclic behaviors
    - Checking for even/odd numbers
    - Limiting values to a specific range
    """

    def operation(self, a: np.ndarray, b: np.ndarray) -> np.ndarray:
        return np.mod(a, b)


class SineArray(BaseNode):
    """
    Computes the sine of input angles in radians.
    math, trigonometry, sine, sin

    Use cases:
    - Calculating vertical components in physics
    - Generating smooth periodic functions
    - Audio signal processing
    """

    _layout = "small"

    angle_rad: float | int | NPArray = Field(title="Angle (Radians)", default=0.0)

    async def process(self, context: ProcessingContext) -> float | NPArray:
        res = np.sin(to_numpy(self.angle_rad))
        return await convert_output(context, res)


class CosineArray(BaseNode):
    """
    Computes the cosine of input angles in radians.
    math, trigonometry, cosine, cos

    Use cases:
    - Calculating horizontal components in physics
    - Creating circular motions
    - Phase calculations in signal processing
    """

    _layout = "small"

    angle_rad: float | int | NPArray = Field(title="Angle (Radians)", default=0.0)

    async def process(self, context: ProcessingContext) -> float | NPArray:
        res = np.cos(to_numpy(self.angle_rad))
        return await convert_output(context, res)


class PowerArray(BaseNode):
    """
    Raises the base array to the power of the exponent element-wise.
    math, exponentiation, power, pow, **

    Use cases:
    - Calculating compound interest
    - Implementing polynomial functions
    - Applying non-linear transformations to data
    """

    _layout = "small"

    base: float | int | NPArray = Field(title="Base", default=1.0)
    exponent: float | int | NPArray = Field(title="Exponent", default=2.0)

    async def process(self, context: ProcessingContext) -> float | int | NPArray:
        a = to_numpy(self.base)
        b = to_numpy(self.exponent)
        if isinstance(a, np.ndarray) and isinstance(b, np.ndarray):
            (a, b) = pad_arrays(a, b)
        return await convert_output(context, np.power(a, b))


class SqrtArray(BaseNode):
    """
    Calculates the square root of the input array element-wise.
    math, square root, sqrt, √

    Use cases:
    - Normalizing data
    - Calculating distances in Euclidean space
    - Finding intermediate values in binary search
    """

    _layout = "small"

    values: NPArray = Field(default=NPArray(), description="Input array")

    async def process(self, context: ProcessingContext) -> float | int | NPArray:
        return await convert_output(
            context, np.sqrt(to_numpy(self.values).astype(np.float32))
        )


class SaveArray(BaseNode):
    """
    Save a numpy array to a file in the specified folder.
    array, save, file, storage
    """

    values: NPArray = Field(
        NPArray(),
        description="The array to save.",
    )
    folder: FolderRef = Field(
        FolderRef(),
        description="The folder to save the array in.",
    )
    name: str = Field(
        default="%Y-%m-%d_%H-%M-%S.npy",
        description="""
        The name of the asset to save.
        You can use time and date variables to create unique names:
        %Y - Year
        %m - Month
        %d - Day
        %H - Hour
        %M - Minute
        %S - Second
        """,
    )

    def required_inputs(self):
        return ["array"]

    async def process(self, context: ProcessingContext) -> NPArray:
        filename = datetime.now().strftime(self.name)
        array = to_numpy(self.values)
        buffer = BytesIO()
        np.save(buffer, array)
        buffer.seek(0)
        asset = await context.create_asset(
            name=filename,
            content_type="application/array",
            content=buffer,
            parent_id=self.folder.asset_id if self.folder.is_set() else None,
        )
        return NPArray.from_numpy(
            array,
            uri=asset.get_url,
            asset_id=asset.id,
        )


class ConvertToArray(BaseNode):
    """
    Convert PIL Image to normalized tensor representation.
    image, tensor, conversion, normalization

    Use cases:
    - Prepare images for machine learning models
    - Convert between image formats for processing
    - Normalize image data for consistent calculations
    """

    image: ImageRef = Field(
        default=ImageRef(),
        description="The input image to convert to a tensor. The image should have either 1 (grayscale), 3 (RGB), or 4 (RGBA) channels.",
    )

    async def process(self, context: ProcessingContext) -> NPArray:
        if self.image.is_empty():
            raise ValueError("The input image is not connected.")

        image = await context.image_to_pil(self.image)
        image_data = np.array(image)
        tensor_data = image_data / 255.0
        if len(tensor_data.shape) == 2:
            tensor_data = tensor_data[:, :, np.newaxis]
        return NPArray.from_numpy(tensor_data)


class ConvertToImage(BaseNode):
    """
    Convert array data to PIL Image format.
    array, image, conversion, denormalization

    Use cases:
    - Visualize array data as images
    - Save processed array results as images
    - Convert model outputs back to viewable format
    """

    values: NPArray = Field(
        default=NPArray(),
        description="The input array to convert to an image. Should have either 1, 3, or 4 channels.",
    )

    async def process(self, context: ProcessingContext) -> ImageRef:
        if self.values.is_empty():
            raise ValueError("The input array is not connected.")

        array_data = to_numpy(self.values)
        if array_data.ndim not in [2, 3]:
            raise ValueError("The array should have 2 or 3 dimensions (HxW or HxWxC).")
        if (array_data.ndim == 3) and (array_data.shape[2] not in [1, 3, 4]):
            raise ValueError("The array channels should be either 1, 3, or 4.")
        if (array_data.ndim == 3) and (array_data.shape[2] == 1):
            array_data = array_data.reshape(array_data.shape[0], array_data.shape[1])
        array_data = (array_data * 255).astype(np.uint8)
        output_image = PIL.Image.fromarray(array_data)
        return await context.image_from_pil(output_image)


class ConvertToAudio(BaseNode):
    """
    Converts a array object back to an audio file.
    audio, conversion, array

    Use cases:
    - Save processed audio data as a playable file
    - Convert generated or modified audio arrays to audio format
    - Output results of audio processing pipelinesr
    """

    values: NPArray = Field(
        default=NPArray(), description="The array to convert to an audio file."
    )
    sample_rate: int = Field(
        default=44100, ge=0, le=44100, description="The sample rate of the audio file."
    )

    async def process(self, context: ProcessingContext) -> AudioRef:
        audio = numpy_to_audio_segment(to_numpy(self.values), self.sample_rate)
        return await context.audio_from_segment(audio)


class Stack(BaseNode):
    """
    Stack multiple arrays along a specified axis.
    array, stack, concatenate, join, merge, axis

    Use cases:
    - Combine multiple 2D arrays into a 3D array
    - Stack time series data from multiple sources
    - Merge feature vectors for machine learning models
    """

    arrays: list[NPArray] = Field(default=[], description="Arrays to stack")
    axis: int = Field(0, description="The axis to stack along.", ge=0)

    async def process(self, context: ProcessingContext) -> NPArray:
        arrays = [to_numpy(array) for array in self.arrays]
        stacked_array = np.stack(arrays, axis=self.axis)
        return NPArray.from_numpy(stacked_array)


# class Concatarray(Node):
#     '## Concat array Node\n### array Manipulation\n\n#### Description\nThe Concat array Node combines or joins arrays along a specified axis.\n\narrays, in the context of this tool, are multi-dimensional arrays, similar to matrices or data tables. "Concatenating" means that the node can take several arrays and join them together along a given "axis", or dimension. For example, you can concatenate two spreadsheets by adding the rows of one to the other (concatenating along the row axis).\n\n#### Applications\n- Combining multiple datasets: If you have several arrays containing related data (like sales data from different regions), the Concat array Node could combine them into a single array for unified analysis.\n- Modifying data structures: In certain data analysis scenarios, you may need to modify the structure of your data (for example, combine the columns of two data sets). The Concat array Node allows you to perform this operation easily.\n\n#### Example\nSuppose you have three arrays representing sales data from North, East, and West regions. You want to analyze the data collectively. First, connect the three nodes representing these regional data arrays to the Concat array Node. Specify the axis along which you want to concatenate. The Concat array Node will then output a single array that combines the data from all regions, which you can feed into further analysis tools.\n\n##### Inputs\n- `arrays`: List of array. The arrays you want to concatenate.\n- `axis`: Integer. The axis along which the arrays will be concatenated.\n\n##### Outputs\n- `result`: array. The single array that results from the concatenation of the input arrays.'
#     category: NodeCategory = NodeCategory.array
#     arrays: list[array] = []
#     axis: int = Field(0, description="The axis to concatenate along.", ge=0)

#     async def process(self, context: ProcessingContext) -> array:
#         arrays = [to_numpy(array) for array in self.arrays]
#         concatenated_array = np.concatenate(arrays, axis=self.axis)
#         return array.from_numpy(concatenated_array)


class MatMul(BaseNode):
    """
    Perform matrix multiplication on two input arrays.
    array, matrix, multiplication, linear algebra

    Use cases:
    - Implement linear transformations
    - Calculate dot products of vectors
    - Perform matrix operations in neural networks
    """

    _layout = "small"
    a: NPArray = Field(default=NPArray(), description="First input array")
    b: NPArray = Field(default=NPArray(), description="Second input array")

    async def process(self, context: ProcessingContext) -> NPArray:
        a = to_numpy(self.a)
        b = to_numpy(self.b)
        return NPArray.from_numpy(np.matmul(a, b))


class TransposeArray(BaseNode):
    """
    Transpose the dimensions of the input array.
    array, transpose, reshape, dimensions

    Use cases:
    - Convert row vectors to column vectors
    - Rearrange data for compatibility with other operations
    - Implement certain linear algebra operations
    """

    _layout = "small"
    values: NPArray = Field(default=NPArray(), description="Array to transpose")

    async def process(self, context: ProcessingContext) -> NPArray:
        return NPArray.from_numpy(np.transpose(to_numpy(self.values)))


class MaxArray(BaseNode):
    """
    Compute the maximum value along a specified axis of a array.
    array, maximum, reduction, statistics

    Use cases:
    - Find peak values in time series data
    - Implement max pooling in neural networks
    - Determine highest scores across multiple categories
    """

    values: NPArray = Field(default=NPArray(), description="Input array")
    axis: int | None = Field(
        default=None, description="Axis along which to compute maximum"
    )

    async def process(self, context: ProcessingContext) -> NPArray | float | int:
        res = np.max(to_numpy(self.values), axis=self.axis)
        if res.size == 1:
            return res.item()
        else:
            return NPArray.from_numpy(res)


class MinArray(BaseNode):
    """
    Calculate the minimum value along a specified axis of a array.
    array, minimum, reduction, statistics

    Use cases:
    - Find lowest values in datasets
    - Implement min pooling in neural networks
    - Determine minimum thresholds across categories
    """

    values: NPArray = Field(default=NPArray(), description="Input array")
    axis: int | None = Field(
        default=None, description="Axis along which to compute minimum"
    )

    async def process(self, context: ProcessingContext) -> NPArray | float | int:
        res = np.min(to_numpy(self.values), axis=self.axis)
        if res.size == 1:
            return res.item()
        else:
            return NPArray.from_numpy(res)


class MeanArray(BaseNode):
    """
    Compute the mean value along a specified axis of a array.
    array, average, reduction, statistics

    Use cases:
    - Calculate average values in datasets
    - Implement mean pooling in neural networks
    - Compute centroids in clustering algorithms
    """

    values: NPArray = Field(default=NPArray(), description="Input array")
    axis: int | None = Field(
        default=None, description="Axis along which to compute mean"
    )

    async def process(self, context: ProcessingContext) -> NPArray | float | int:
        res = np.mean(to_numpy(self.values), axis=self.axis)
        if res.size == 1:
            return res.item()
        else:
            return NPArray.from_numpy(res)


class SumArray(BaseNode):
    """
    Calculate the sum of values along a specified axis of a array.
    array, summation, reduction, statistics

    Use cases:
    - Compute total values across categories
    - Implement sum pooling in neural networks
    - Calculate cumulative metrics in time series data
    """

    values: NPArray = Field(default=NPArray(), description="Input array")
    axis: int | None = Field(
        default=None, description="Axis along which to compute sum"
    )

    async def process(self, context: ProcessingContext) -> NPArray | float | int:
        res = np.sum(to_numpy(self.values), axis=self.axis)
        if res.size == 1:
            return res.item()
        else:
            return NPArray.from_numpy(res)


class ArgMaxArray(BaseNode):
    """
    Find indices of maximum values along a specified axis of a array.
    array, argmax, index, maximum

    Use cases:
    - Determine winning classes in classification tasks
    - Find peaks in signal processing
    - Locate best-performing items in datasets
    """

    values: NPArray = Field(default=NPArray(), description="Input array")
    axis: int | None = Field(
        default=None, description="Axis along which to find maximum indices"
    )

    async def process(self, context: ProcessingContext) -> NPArray | int:
        res = np.argmax(to_numpy(self.values), axis=self.axis)
        if res.size == 1:
            return res.item()
        else:
            return NPArray.from_numpy(res)


class ArgMinArray(BaseNode):
    """
    Find indices of minimum values along a specified axis of a array.
    array, argmin, index, minimum

    Use cases:
    - Locate lowest-performing items in datasets
    - Find troughs in signal processing
    - Determine least likely classes in classification tasks
    """

    values: NPArray = Field(default=NPArray(), description="Input array")
    axis: int | None = Field(
        default=None, description="Axis along which to find minimum indices"
    )

    async def process(self, context: ProcessingContext) -> NPArray | int:
        res = np.argmin(to_numpy(self.values), axis=self.axis)
        if res.size == 1:
            return res.item()
        else:
            return NPArray.from_numpy(res)


class AbsArray(BaseNode):
    """
    Compute the absolute value of each element in a array.
    array, absolute, magnitude

    Use cases:
    - Calculate magnitudes of complex numbers
    - Preprocess data for certain algorithms
    - Implement activation functions in neural networks
    """

    values: NPArray = Field(
        default=NPArray(),
        description="The input array to compute the absolute values from.",
    )

    async def process(self, context: ProcessingContext) -> NPArray:
        abs_array = np.abs(to_numpy(self.values))
        if abs_array.size == 1:
            return abs_array.item()
        else:
            return NPArray.from_numpy(abs_array)


class ArrayToScalar(BaseNode):
    """
    Convert a single-element array to a scalar value.
    array, scalar, conversion, type

    Use cases:
    - Extract final results from array computations
    - Prepare values for non-array operations
    - Simplify output for human-readable results
    """

    values: NPArray = Field(default=NPArray(), description="Array to convert to scalar")

    async def process(self, context: ProcessingContext) -> float | int:
        return to_numpy(self.values).item()


class ScalarToArray(BaseNode):
    """
    Convert a scalar value to a single-element array.
    scalar, array, conversion, type

    Use cases:
    - Prepare scalar inputs for array operations
    - Create constant arrays for computations
    - Initialize array values in workflows
    """

    value: float | int = Field(
        default=0, description="Scalar value to convert to array"
    )

    async def process(self, context: ProcessingContext) -> NPArray:
        return NPArray.from_numpy(np.array([self.value]))


class ListToArray(BaseNode):
    """
    Convert a list of values to a array.
    list, array, conversion, type

    Use cases:
    - Prepare list data for array operations
    - Create arrays from Python data structures
    - Convert sequence data to array format
    """

    values: list[Any] = Field(
        default=[], description="List of values to convert to array"
    )

    async def process(self, context: ProcessingContext) -> NPArray:
        return NPArray.from_numpy(np.array(self.values))


class PlotArray(BaseNode):
    """
    Create a plot visualization of array data.
    array, plot, visualization, graph

    Use cases:
    - Visualize trends in array data
    - Create charts for reports or dashboards
    - Debug array outputs in workflows
    """

    class PlotType(str, Enum):
        LINE = "line"
        BAR = "bar"
        SCATTER = "scatter"

    values: NPArray = Field(default=NPArray(), description="Array to plot")
    plot_type: PlotType = Field(
        default=PlotType.LINE, description="Type of plot to create"
    )

    async def process(self, context: ProcessingContext) -> ImageRef:
        arr = to_numpy(self.values)
        sns.set_theme(style="darkgrid")
        if self.plot_type == self.PlotType.LINE:
            plot = sns.lineplot(data=arr)
        elif self.plot_type == self.PlotType.BAR:
            plot = sns.barplot(data=arr)
        elif self.plot_type == self.PlotType.SCATTER:
            plot = sns.scatterplot(data=arr)
        else:
            raise ValueError(f"Invalid plot type: {self.plot_type}")
        fig = plot.get_figure()
        if fig is None:
            raise ValueError("Could not get figure from plot.")
        img_bytes = BytesIO()
        fig.savefig(img_bytes, format="png")
        plt.close(fig)
        return await context.image_from_bytes(img_bytes.getvalue())


class ArrayToList(BaseNode):
    """
    Convert a array to a nested list structure.
    array, list, conversion, type

    Use cases:
    - Prepare array data for JSON serialization
    - Convert array outputs to Python data structures
    - Interface array data with non-array operations
    """

    values: NPArray = Field(default=NPArray(), description="Array to convert to list")

    async def process(self, context: ProcessingContext) -> list[Any]:
        return to_numpy(self.values).tolist()


class ExpArray(BaseNode):
    """
    Calculate the exponential of each element in a array.
    array, exponential, math, activation

    Use cases:
    - Implement exponential activation functions
    - Calculate growth rates in scientific models
    - Transform data for certain statistical analyses
    """

    values: NPArray = Field(default=NPArray(), description="Input array")

    async def process(self, context: ProcessingContext) -> float | int | NPArray:
        return await convert_output(
            context, np.exp(to_numpy(self.values).astype(np.float32))
        )


class LogArray(BaseNode):
    """
    Calculate the natural logarithm of each element in a array.
    array, logarithm, math, transformation

    Use cases:
    - Implement log transformations on data
    - Calculate entropy in information theory
    - Normalize data with large ranges
    """

    values: NPArray = Field(default=NPArray(), description="Input array")

    async def process(self, context: ProcessingContext) -> float | int | NPArray:
        return await convert_output(
            context, np.log(to_numpy(self.values).astype(np.float32))
        )


class SliceArray(BaseNode):
    """
    Extract a slice of an array along a specified axis.
    array, slice, subset, index

    Use cases:
    - Extract specific time periods from time series data
    - Select subset of features from datasets
    - Create sliding windows over sequential data
    """

    values: NPArray = Field(default=NPArray(), description="The input array to slice")
    start: int = Field(default=0, description="Starting index (inclusive)")
    stop: int = Field(default=0, description="Ending index (exclusive)")
    step: int = Field(default=1, description="Step size between elements")
    axis: int = Field(default=0, description="Axis along which to slice")

    async def process(self, context: ProcessingContext) -> NPArray:
        arr = to_numpy(self.values)
        slicing = [slice(None)] * arr.ndim
        slicing[self.axis] = slice(self.start, self.stop, self.step)
        return NPArray.from_numpy(arr[tuple(slicing)])


class IndexArray(BaseNode):
    """
    Select specific indices from an array along a specified axis.
    array, index, select, subset

    Use cases:
    - Extract specific samples from a dataset
    - Select particular features or dimensions
    - Implement batch sampling operations
    """

    values: NPArray = Field(default=NPArray(), description="The input array to index")
    indices: str = Field(
        default="", description="The comma separated indices to select"
    )
    axis: int = Field(default=0, description="Axis along which to index")

    async def process(self, context: ProcessingContext) -> NPArray:
        arr = to_numpy(self.values)
        idx = [slice(None)] * arr.ndim
        idx[self.axis] = np.array(map(int, self.indices.split(",")))  # type: ignore
        return NPArray.from_numpy(arr[tuple(idx)])


class Reshape1D(BaseNode):
    """
    Reshape an array to a 1D shape without changing its data.
    """

    values: NPArray = Field(default=NPArray(), description="The input array to reshape")
    num_elements: int = Field(default=0, description="The number of elements")

    async def process(self, context: ProcessingContext) -> NPArray:
        arr = to_numpy(self.values)
        return NPArray.from_numpy(arr.reshape(self.num_elements))


class Reshape2D(BaseNode):
    """
    Reshape an array to a new shape without changing its data.
    array, reshape, dimensions, structure

    Use cases:
    - Convert between different dimensional representations
    - Prepare data for specific model architectures
    - Flatten or unflatten arrays
    """

    values: NPArray = Field(default=NPArray(), description="The input array to reshape")
    num_rows: int = Field(default=0, description="The number of rows")
    num_cols: int = Field(default=0, description="The number of columns")

    async def process(self, context: ProcessingContext) -> NPArray:
        arr = to_numpy(self.values)
        return NPArray.from_numpy(arr.reshape(self.num_rows, self.num_cols))


class Reshape3D(BaseNode):
    """
    Reshape an array to a 3D shape without changing its data.
    """

    values: NPArray = Field(default=NPArray(), description="The input array to reshape")
    num_rows: int = Field(default=0, description="The number of rows")
    num_cols: int = Field(default=0, description="The number of columns")
    num_depths: int = Field(default=0, description="The number of depths")

    async def process(self, context: ProcessingContext) -> NPArray:
        arr = to_numpy(self.values)
        return NPArray.from_numpy(
            arr.reshape(self.num_rows, self.num_cols, self.num_depths)
        )


class Reshape4D(BaseNode):
    """
    Reshape an array to a 4D shape without changing its data.
    """

    values: NPArray = Field(default=NPArray(), description="The input array to reshape")
    num_rows: int = Field(default=0, description="The number of rows")
    num_cols: int = Field(default=0, description="The number of columns")
    num_depths: int = Field(default=0, description="The number of depths")
    num_channels: int = Field(default=0, description="The number of channels")

    async def process(self, context: ProcessingContext) -> NPArray:
        arr = to_numpy(self.values)
        return NPArray.from_numpy(
            arr.reshape(
                self.num_rows, self.num_cols, self.num_depths, self.num_channels
            )
        )


class SplitArray(BaseNode):
    """
    Split an array into multiple sub-arrays along a specified axis.
    array, split, divide, partition

    Use cases:
    - Divide datasets into training/validation splits
    - Create batches from large arrays
    - Separate multi-channel data
    """

    values: NPArray = Field(default=NPArray(), description="The input array to split")
    num_splits: int = Field(
        default=0, description="Number of equal splits to create", gt=0
    )
    axis: int = Field(default=0, description="Axis along which to split")

    async def process(self, context: ProcessingContext) -> list[NPArray]:
        arr = to_numpy(self.values)
        split_arrays = np.array_split(arr, self.num_splits, axis=self.axis)
        return [NPArray.from_numpy(split_arr) for split_arr in split_arrays]
