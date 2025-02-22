from pydantic import BaseModel, Field
import typing
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode


class AbsArray(GraphNode):
    """
    Compute the absolute value of each element in a array.
    array, absolute, magnitude

    Use cases:
    - Calculate magnitudes of complex numbers
    - Preprocess data for certain algorithms
    - Implement activation functions in neural networks
    """

    values: NPArray | GraphNode | tuple[GraphNode, str] = Field(default=NPArray(type='np_array', value=None, dtype='<i8', shape=(1,)), description='The input array to compute the absolute values from.')

    @classmethod
    def get_node_type(cls): return "lib.data.numpy.AbsArray"



class AddArray(GraphNode):
    """
    Performs addition on two arrays.
    math, plus, add, addition, sum, +
    """

    a: int | float | nodetool.metadata.types.NPArray | GraphNode | tuple[GraphNode, str] = Field(default=0.0, description=None)
    b: int | float | nodetool.metadata.types.NPArray | GraphNode | tuple[GraphNode, str] = Field(default=0.0, description=None)

    @classmethod
    def get_node_type(cls): return "lib.data.numpy.AddArray"



class ArgMaxArray(GraphNode):
    """
    Find indices of maximum values along a specified axis of a array.
    array, argmax, index, maximum

    Use cases:
    - Determine winning classes in classification tasks
    - Find peaks in signal processing
    - Locate best-performing items in datasets
    """

    values: NPArray | GraphNode | tuple[GraphNode, str] = Field(default=NPArray(type='np_array', value=None, dtype='<i8', shape=(1,)), description='Input array')
    axis: int | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Axis along which to find maximum indices')

    @classmethod
    def get_node_type(cls): return "lib.data.numpy.ArgMaxArray"



class ArgMinArray(GraphNode):
    """
    Find indices of minimum values along a specified axis of a array.
    array, argmin, index, minimum

    Use cases:
    - Locate lowest-performing items in datasets
    - Find troughs in signal processing
    - Determine least likely classes in classification tasks
    """

    values: NPArray | GraphNode | tuple[GraphNode, str] = Field(default=NPArray(type='np_array', value=None, dtype='<i8', shape=(1,)), description='Input array')
    axis: int | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Axis along which to find minimum indices')

    @classmethod
    def get_node_type(cls): return "lib.data.numpy.ArgMinArray"



class ArrayToList(GraphNode):
    """
    Convert a array to a nested list structure.
    array, list, conversion, type

    Use cases:
    - Prepare array data for JSON serialization
    - Convert array outputs to Python data structures
    - Interface array data with non-array operations
    """

    values: NPArray | GraphNode | tuple[GraphNode, str] = Field(default=NPArray(type='np_array', value=None, dtype='<i8', shape=(1,)), description='Array to convert to list')

    @classmethod
    def get_node_type(cls): return "lib.data.numpy.ArrayToList"



class ArrayToScalar(GraphNode):
    """
    Convert a single-element array to a scalar value.
    array, scalar, conversion, type

    Use cases:
    - Extract final results from array computations
    - Prepare values for non-array operations
    - Simplify output for human-readable results
    """

    values: NPArray | GraphNode | tuple[GraphNode, str] = Field(default=NPArray(type='np_array', value=None, dtype='<i8', shape=(1,)), description='Array to convert to scalar')

    @classmethod
    def get_node_type(cls): return "lib.data.numpy.ArrayToScalar"



class BinaryOperation(GraphNode):
    a: int | float | nodetool.metadata.types.NPArray | GraphNode | tuple[GraphNode, str] = Field(default=0.0, description=None)
    b: int | float | nodetool.metadata.types.NPArray | GraphNode | tuple[GraphNode, str] = Field(default=0.0, description=None)

    @classmethod
    def get_node_type(cls): return "lib.data.numpy.BinaryOperation"



class ConvertToArray(GraphNode):
    """
    Convert PIL Image to normalized tensor representation.
    image, tensor, conversion, normalization

    Use cases:
    - Prepare images for machine learning models
    - Convert between image formats for processing
    - Normalize image data for consistent calculations
    """

    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='The input image to convert to a tensor. The image should have either 1 (grayscale), 3 (RGB), or 4 (RGBA) channels.')

    @classmethod
    def get_node_type(cls): return "lib.data.numpy.ConvertToArray"



class ConvertToAudio(GraphNode):
    """
    Converts a array object back to an audio file.
    audio, conversion, array

    Use cases:
    - Save processed audio data as a playable file
    - Convert generated or modified audio arrays to audio format
    - Output results of audio processing pipelinesr
    """

    values: NPArray | GraphNode | tuple[GraphNode, str] = Field(default=NPArray(type='np_array', value=None, dtype='<i8', shape=(1,)), description='The array to convert to an audio file.')
    sample_rate: int | GraphNode | tuple[GraphNode, str] = Field(default=44100, description='The sample rate of the audio file.')

    @classmethod
    def get_node_type(cls): return "lib.data.numpy.ConvertToAudio"



class ConvertToImage(GraphNode):
    """
    Convert array data to PIL Image format.
    array, image, conversion, denormalization

    Use cases:
    - Visualize array data as images
    - Save processed array results as images
    - Convert model outputs back to viewable format
    """

    values: NPArray | GraphNode | tuple[GraphNode, str] = Field(default=NPArray(type='np_array', value=None, dtype='<i8', shape=(1,)), description='The input array to convert to an image. Should have either 1, 3, or 4 channels.')

    @classmethod
    def get_node_type(cls): return "lib.data.numpy.ConvertToImage"



class CosineArray(GraphNode):
    """
    Computes the cosine of input angles in radians.
    math, trigonometry, cosine, cos

    Use cases:
    - Calculating horizontal components in physics
    - Creating circular motions
    - Phase calculations in signal processing
    """

    angle_rad: float | int | nodetool.metadata.types.NPArray | GraphNode | tuple[GraphNode, str] = Field(default=0.0, description=None)

    @classmethod
    def get_node_type(cls): return "lib.data.numpy.CosineArray"



class DivideArray(GraphNode):
    """
    Divides the first array by the second.
    math, division, arithmetic, quotient, /
    """

    a: int | float | nodetool.metadata.types.NPArray | GraphNode | tuple[GraphNode, str] = Field(default=0.0, description=None)
    b: int | float | nodetool.metadata.types.NPArray | GraphNode | tuple[GraphNode, str] = Field(default=0.0, description=None)

    @classmethod
    def get_node_type(cls): return "lib.data.numpy.DivideArray"



class ExpArray(GraphNode):
    """
    Calculate the exponential of each element in a array.
    array, exponential, math, activation

    Use cases:
    - Implement exponential activation functions
    - Calculate growth rates in scientific models
    - Transform data for certain statistical analyses
    """

    values: NPArray | GraphNode | tuple[GraphNode, str] = Field(default=NPArray(type='np_array', value=None, dtype='<i8', shape=(1,)), description='Input array')

    @classmethod
    def get_node_type(cls): return "lib.data.numpy.ExpArray"



class IndexArray(GraphNode):
    """
    Select specific indices from an array along a specified axis.
    array, index, select, subset

    Use cases:
    - Extract specific samples from a dataset
    - Select particular features or dimensions
    - Implement batch sampling operations
    """

    values: NPArray | GraphNode | tuple[GraphNode, str] = Field(default=NPArray(type='np_array', value=None, dtype='<i8', shape=(1,)), description='The input array to index')
    indices: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The comma separated indices to select')
    axis: int | GraphNode | tuple[GraphNode, str] = Field(default=0, description='Axis along which to index')

    @classmethod
    def get_node_type(cls): return "lib.data.numpy.IndexArray"



class ListToArray(GraphNode):
    """
    Convert a list of values to a array.
    list, array, conversion, type

    Use cases:
    - Prepare list data for array operations
    - Create arrays from Python data structures
    - Convert sequence data to array format
    """

    values: list[Any] | GraphNode | tuple[GraphNode, str] = Field(default=[], description='List of values to convert to array')

    @classmethod
    def get_node_type(cls): return "lib.data.numpy.ListToArray"



class LogArray(GraphNode):
    """
    Calculate the natural logarithm of each element in a array.
    array, logarithm, math, transformation

    Use cases:
    - Implement log transformations on data
    - Calculate entropy in information theory
    - Normalize data with large ranges
    """

    values: NPArray | GraphNode | tuple[GraphNode, str] = Field(default=NPArray(type='np_array', value=None, dtype='<i8', shape=(1,)), description='Input array')

    @classmethod
    def get_node_type(cls): return "lib.data.numpy.LogArray"



class MatMul(GraphNode):
    """
    Perform matrix multiplication on two input arrays.
    array, matrix, multiplication, linear algebra

    Use cases:
    - Implement linear transformations
    - Calculate dot products of vectors
    - Perform matrix operations in neural networks
    """

    a: NPArray | GraphNode | tuple[GraphNode, str] = Field(default=NPArray(type='np_array', value=None, dtype='<i8', shape=(1,)), description='First input array')
    b: NPArray | GraphNode | tuple[GraphNode, str] = Field(default=NPArray(type='np_array', value=None, dtype='<i8', shape=(1,)), description='Second input array')

    @classmethod
    def get_node_type(cls): return "lib.data.numpy.MatMul"



class MaxArray(GraphNode):
    """
    Compute the maximum value along a specified axis of a array.
    array, maximum, reduction, statistics

    Use cases:
    - Find peak values in time series data
    - Implement max pooling in neural networks
    - Determine highest scores across multiple categories
    """

    values: NPArray | GraphNode | tuple[GraphNode, str] = Field(default=NPArray(type='np_array', value=None, dtype='<i8', shape=(1,)), description='Input array')
    axis: int | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Axis along which to compute maximum')

    @classmethod
    def get_node_type(cls): return "lib.data.numpy.MaxArray"



class MeanArray(GraphNode):
    """
    Compute the mean value along a specified axis of a array.
    array, average, reduction, statistics

    Use cases:
    - Calculate average values in datasets
    - Implement mean pooling in neural networks
    - Compute centroids in clustering algorithms
    """

    values: NPArray | GraphNode | tuple[GraphNode, str] = Field(default=NPArray(type='np_array', value=None, dtype='<i8', shape=(1,)), description='Input array')
    axis: int | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Axis along which to compute mean')

    @classmethod
    def get_node_type(cls): return "lib.data.numpy.MeanArray"



class MinArray(GraphNode):
    """
    Calculate the minimum value along a specified axis of a array.
    array, minimum, reduction, statistics

    Use cases:
    - Find lowest values in datasets
    - Implement min pooling in neural networks
    - Determine minimum thresholds across categories
    """

    values: NPArray | GraphNode | tuple[GraphNode, str] = Field(default=NPArray(type='np_array', value=None, dtype='<i8', shape=(1,)), description='Input array')
    axis: int | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Axis along which to compute minimum')

    @classmethod
    def get_node_type(cls): return "lib.data.numpy.MinArray"



class ModulusArray(GraphNode):
    """
    Calculates the element-wise remainder of division.
    math, modulo, remainder, mod, %

    Use cases:
    - Implementing cyclic behaviors
    - Checking for even/odd numbers
    - Limiting values to a specific range
    """

    a: int | float | nodetool.metadata.types.NPArray | GraphNode | tuple[GraphNode, str] = Field(default=0.0, description=None)
    b: int | float | nodetool.metadata.types.NPArray | GraphNode | tuple[GraphNode, str] = Field(default=0.0, description=None)

    @classmethod
    def get_node_type(cls): return "lib.data.numpy.ModulusArray"



class MultiplyArray(GraphNode):
    """
    Multiplies two arrays.
    math, product, times, *
    """

    a: int | float | nodetool.metadata.types.NPArray | GraphNode | tuple[GraphNode, str] = Field(default=0.0, description=None)
    b: int | float | nodetool.metadata.types.NPArray | GraphNode | tuple[GraphNode, str] = Field(default=0.0, description=None)

    @classmethod
    def get_node_type(cls): return "lib.data.numpy.MultiplyArray"


import nodetool.nodes.lib.data.numpy

class PlotArray(GraphNode):
    """
    Create a plot visualization of array data.
    array, plot, visualization, graph

    Use cases:
    - Visualize trends in array data
    - Create charts for reports or dashboards
    - Debug array outputs in workflows
    """

    PlotType: typing.ClassVar[type] = nodetool.nodes.lib.data.numpy.PlotArray.PlotType
    values: NPArray | GraphNode | tuple[GraphNode, str] = Field(default=NPArray(type='np_array', value=None, dtype='<i8', shape=(1,)), description='Array to plot')
    plot_type: nodetool.nodes.lib.data.numpy.PlotArray.PlotType = Field(default=PlotType.LINE, description='Type of plot to create')

    @classmethod
    def get_node_type(cls): return "lib.data.numpy.PlotArray"



class PowerArray(GraphNode):
    """
    Raises the base array to the power of the exponent element-wise.
    math, exponentiation, power, pow, **

    Use cases:
    - Calculating compound interest
    - Implementing polynomial functions
    - Applying non-linear transformations to data
    """

    base: float | int | nodetool.metadata.types.NPArray | GraphNode | tuple[GraphNode, str] = Field(default=1.0, description=None)
    exponent: float | int | nodetool.metadata.types.NPArray | GraphNode | tuple[GraphNode, str] = Field(default=2.0, description=None)

    @classmethod
    def get_node_type(cls): return "lib.data.numpy.PowerArray"



class Reshape1D(GraphNode):
    """
    Reshape an array to a 1D shape without changing its data.
    """

    values: NPArray | GraphNode | tuple[GraphNode, str] = Field(default=NPArray(type='np_array', value=None, dtype='<i8', shape=(1,)), description='The input array to reshape')
    num_elements: int | GraphNode | tuple[GraphNode, str] = Field(default=0, description='The number of elements')

    @classmethod
    def get_node_type(cls): return "lib.data.numpy.Reshape1D"



class Reshape2D(GraphNode):
    """
    Reshape an array to a new shape without changing its data.
    array, reshape, dimensions, structure

    Use cases:
    - Convert between different dimensional representations
    - Prepare data for specific model architectures
    - Flatten or unflatten arrays
    """

    values: NPArray | GraphNode | tuple[GraphNode, str] = Field(default=NPArray(type='np_array', value=None, dtype='<i8', shape=(1,)), description='The input array to reshape')
    num_rows: int | GraphNode | tuple[GraphNode, str] = Field(default=0, description='The number of rows')
    num_cols: int | GraphNode | tuple[GraphNode, str] = Field(default=0, description='The number of columns')

    @classmethod
    def get_node_type(cls): return "lib.data.numpy.Reshape2D"



class Reshape3D(GraphNode):
    """
    Reshape an array to a 3D shape without changing its data.
    """

    values: NPArray | GraphNode | tuple[GraphNode, str] = Field(default=NPArray(type='np_array', value=None, dtype='<i8', shape=(1,)), description='The input array to reshape')
    num_rows: int | GraphNode | tuple[GraphNode, str] = Field(default=0, description='The number of rows')
    num_cols: int | GraphNode | tuple[GraphNode, str] = Field(default=0, description='The number of columns')
    num_depths: int | GraphNode | tuple[GraphNode, str] = Field(default=0, description='The number of depths')

    @classmethod
    def get_node_type(cls): return "lib.data.numpy.Reshape3D"



class Reshape4D(GraphNode):
    """
    Reshape an array to a 4D shape without changing its data.
    """

    values: NPArray | GraphNode | tuple[GraphNode, str] = Field(default=NPArray(type='np_array', value=None, dtype='<i8', shape=(1,)), description='The input array to reshape')
    num_rows: int | GraphNode | tuple[GraphNode, str] = Field(default=0, description='The number of rows')
    num_cols: int | GraphNode | tuple[GraphNode, str] = Field(default=0, description='The number of columns')
    num_depths: int | GraphNode | tuple[GraphNode, str] = Field(default=0, description='The number of depths')
    num_channels: int | GraphNode | tuple[GraphNode, str] = Field(default=0, description='The number of channels')

    @classmethod
    def get_node_type(cls): return "lib.data.numpy.Reshape4D"



class SaveArray(GraphNode):
    """
    Save a numpy array to a file in the specified folder.
    array, save, file, storage
    """

    values: NPArray | GraphNode | tuple[GraphNode, str] = Field(default=NPArray(type='np_array', value=None, dtype='<i8', shape=(1,)), description='The array to save.')
    folder: FolderRef | GraphNode | tuple[GraphNode, str] = Field(default=FolderRef(type='folder', uri='', asset_id=None, data=None), description='The folder to save the array in.')
    name: str | GraphNode | tuple[GraphNode, str] = Field(default='%Y-%m-%d_%H-%M-%S.npy', description='\n        The name of the asset to save.\n        You can use time and date variables to create unique names:\n        %Y - Year\n        %m - Month\n        %d - Day\n        %H - Hour\n        %M - Minute\n        %S - Second\n        ')

    @classmethod
    def get_node_type(cls): return "lib.data.numpy.SaveArray"



class ScalarToArray(GraphNode):
    """
    Convert a scalar value to a single-element array.
    scalar, array, conversion, type

    Use cases:
    - Prepare scalar inputs for array operations
    - Create constant arrays for computations
    - Initialize array values in workflows
    """

    value: float | int | GraphNode | tuple[GraphNode, str] = Field(default=0, description='Scalar value to convert to array')

    @classmethod
    def get_node_type(cls): return "lib.data.numpy.ScalarToArray"



class SineArray(GraphNode):
    """
    Computes the sine of input angles in radians.
    math, trigonometry, sine, sin

    Use cases:
    - Calculating vertical components in physics
    - Generating smooth periodic functions
    - Audio signal processing
    """

    angle_rad: float | int | nodetool.metadata.types.NPArray | GraphNode | tuple[GraphNode, str] = Field(default=0.0, description=None)

    @classmethod
    def get_node_type(cls): return "lib.data.numpy.SineArray"



class SliceArray(GraphNode):
    """
    Extract a slice of an array along a specified axis.
    array, slice, subset, index

    Use cases:
    - Extract specific time periods from time series data
    - Select subset of features from datasets
    - Create sliding windows over sequential data
    """

    values: NPArray | GraphNode | tuple[GraphNode, str] = Field(default=NPArray(type='np_array', value=None, dtype='<i8', shape=(1,)), description='The input array to slice')
    start: int | GraphNode | tuple[GraphNode, str] = Field(default=0, description='Starting index (inclusive)')
    stop: int | GraphNode | tuple[GraphNode, str] = Field(default=0, description='Ending index (exclusive)')
    step: int | GraphNode | tuple[GraphNode, str] = Field(default=1, description='Step size between elements')
    axis: int | GraphNode | tuple[GraphNode, str] = Field(default=0, description='Axis along which to slice')

    @classmethod
    def get_node_type(cls): return "lib.data.numpy.SliceArray"



class SplitArray(GraphNode):
    """
    Split an array into multiple sub-arrays along a specified axis.
    array, split, divide, partition

    Use cases:
    - Divide datasets into training/validation splits
    - Create batches from large arrays
    - Separate multi-channel data
    """

    values: NPArray | GraphNode | tuple[GraphNode, str] = Field(default=NPArray(type='np_array', value=None, dtype='<i8', shape=(1,)), description='The input array to split')
    num_splits: int | GraphNode | tuple[GraphNode, str] = Field(default=0, description='Number of equal splits to create')
    axis: int | GraphNode | tuple[GraphNode, str] = Field(default=0, description='Axis along which to split')

    @classmethod
    def get_node_type(cls): return "lib.data.numpy.SplitArray"



class SqrtArray(GraphNode):
    """
    Calculates the square root of the input array element-wise.
    math, square root, sqrt, √

    Use cases:
    - Normalizing data
    - Calculating distances in Euclidean space
    - Finding intermediate values in binary search
    """

    values: NPArray | GraphNode | tuple[GraphNode, str] = Field(default=NPArray(type='np_array', value=None, dtype='<i8', shape=(1,)), description='Input array')

    @classmethod
    def get_node_type(cls): return "lib.data.numpy.SqrtArray"



class Stack(GraphNode):
    """
    Stack multiple arrays along a specified axis.
    array, stack, concatenate, join, merge, axis

    Use cases:
    - Combine multiple 2D arrays into a 3D array
    - Stack time series data from multiple sources
    - Merge feature vectors for machine learning models
    """

    arrays: list[NPArray] | GraphNode | tuple[GraphNode, str] = Field(default=[], description='Arrays to stack')
    axis: int | GraphNode | tuple[GraphNode, str] = Field(default=0, description='The axis to stack along.')

    @classmethod
    def get_node_type(cls): return "lib.data.numpy.Stack"



class SubtractArray(GraphNode):
    """
    Subtracts the second array from the first.
    math, minus, difference, -
    """

    a: int | float | nodetool.metadata.types.NPArray | GraphNode | tuple[GraphNode, str] = Field(default=0.0, description=None)
    b: int | float | nodetool.metadata.types.NPArray | GraphNode | tuple[GraphNode, str] = Field(default=0.0, description=None)

    @classmethod
    def get_node_type(cls): return "lib.data.numpy.SubtractArray"



class SumArray(GraphNode):
    """
    Calculate the sum of values along a specified axis of a array.
    array, summation, reduction, statistics

    Use cases:
    - Compute total values across categories
    - Implement sum pooling in neural networks
    - Calculate cumulative metrics in time series data
    """

    values: NPArray | GraphNode | tuple[GraphNode, str] = Field(default=NPArray(type='np_array', value=None, dtype='<i8', shape=(1,)), description='Input array')
    axis: int | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Axis along which to compute sum')

    @classmethod
    def get_node_type(cls): return "lib.data.numpy.SumArray"



class TransposeArray(GraphNode):
    """
    Transpose the dimensions of the input array.
    array, transpose, reshape, dimensions

    Use cases:
    - Convert row vectors to column vectors
    - Rearrange data for compatibility with other operations
    - Implement certain linear algebra operations
    """

    values: NPArray | GraphNode | tuple[GraphNode, str] = Field(default=NPArray(type='np_array', value=None, dtype='<i8', shape=(1,)), description='Array to transpose')

    @classmethod
    def get_node_type(cls): return "lib.data.numpy.TransposeArray"


