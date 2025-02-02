# nodetool.nodes.lib.data.numpy

## Abs

Compute the absolute value of each element in a array.

Use cases:
- Calculate magnitudes of complex numbers
- Preprocess data for certain algorithms
- Implement activation functions in neural networks

**Tags:** array, absolute, magnitude

**Fields:**
- **input_array**: The input array to compute the absolute values from. (NPArray)


## Add

Performs addition on two inputs.

**Tags:** math, plus, add, addition, sum, +

**Fields:**
- **a** (int | float | nodetool.metadata.types.NPArray)
- **b** (int | float | nodetool.metadata.types.NPArray)

### operation

**Args:**
- **a (ndarray)**
- **b (ndarray)**

**Returns:** ndarray


## ArgMax

Find indices of maximum values along a specified axis of a array.

Use cases:
- Determine winning classes in classification tasks
- Find peaks in signal processing
- Locate best-performing items in datasets

**Tags:** array, argmax, index, maximum

**Fields:**
- **a** (NPArray)
- **axis** (int | None)


## ArgMin

Find indices of minimum values along a specified axis of a array.

Use cases:
- Locate lowest-performing items in datasets
- Find troughs in signal processing
- Determine least likely classes in classification tasks

**Tags:** array, argmin, index, minimum

**Fields:**
- **array** (NPArray)
- **axis** (int | None)


## ArrayToList

Convert a array to a nested list structure.

Use cases:
- Prepare array data for JSON serialization
- Convert array outputs to Python data structures
- Interface array data with non-array operations

**Tags:** array, list, conversion, type

**Fields:**
- **array** (NPArray)


## BinaryOperation

**Fields:**
- **a** (int | float | nodetool.metadata.types.NPArray)
- **b** (int | float | nodetool.metadata.types.NPArray)

### operation

**Args:**
- **a (ndarray)**
- **b (ndarray)**

**Returns:** ndarray


## ConvertToArray

Convert PIL Image to normalized tensor representation.

Use cases:
- Prepare images for machine learning models
- Convert between image formats for processing
- Normalize image data for consistent calculations

**Tags:** image, tensor, conversion, normalization

**Fields:**
- **image**: The input image to convert to a tensor. The image should have either 1 (grayscale), 3 (RGB), or 4 (RGBA) channels. (ImageRef)


## ConvertToAudio

Converts a array object back to an audio file.

Use cases:
- Save processed audio data as a playable file
- Convert generated or modified audio arrays to audio format
- Output results of audio processing pipelinesr

**Tags:** audio, conversion, array

**Fields:**
- **array**: The array to convert to an audio file. (NPArray)
- **sample_rate**: The sample rate of the audio file. (int)


## ConvertToImage

Convert array data to PIL Image format.

Use cases:
- Visualize array data as images
- Save processed array results as images
- Convert model outputs back to viewable format

**Tags:** array, image, conversion, denormalization

**Fields:**
- **array**: The input array to convert to an image. Should have either 1, 3, or 4 channels. (NPArray)


## Cosine

Computes the cosine of input angles in radians.

Use cases:
- Calculating horizontal components in physics
- Creating circular motions
- Phase calculations in signal processing

**Tags:** math, trigonometry, cosine, cos

**Fields:**
- **angle_rad** (float | int | nodetool.metadata.types.NPArray)


## Divide

Divides the first input by the second.

**Tags:** math, division, arithmetic, quotient, /

**Fields:**
- **a** (int | float | nodetool.metadata.types.NPArray)
- **b** (int | float | nodetool.metadata.types.NPArray)

### operation

**Args:**
- **a (ndarray)**
- **b (ndarray)**

**Returns:** ndarray


## Exp

Calculate the exponential of each element in a array.

Use cases:
- Implement exponential activation functions
- Calculate growth rates in scientific models
- Transform data for certain statistical analyses

**Tags:** array, exponential, math, activation

**Fields:**
- **x** (int | float | nodetool.metadata.types.NPArray)


## Index

Select specific indices from an array along a specified axis.

Use cases:
- Extract specific samples from a dataset
- Select particular features or dimensions
- Implement batch sampling operations

**Tags:** array, index, select, subset

**Fields:**
- **array**: The input array to index (NPArray)
- **indices**: The comma separated indices to select (str)
- **axis**: Axis along which to index (int)


## ListToArray

Convert a list of values to a array.

Use cases:
- Prepare list data for array operations
- Create arrays from Python data structures
- Convert sequence data to array format

**Tags:** list, array, conversion, type

**Fields:**
- **values** (list[typing.Any])


## Log

Calculate the natural logarithm of each element in a array.

Use cases:
- Implement log transformations on data
- Calculate entropy in information theory
- Normalize data with large ranges

**Tags:** array, logarithm, math, transformation

**Fields:**
- **x** (int | float | nodetool.metadata.types.NPArray)


## MatMul

Perform matrix multiplication on two input arrays.

Use cases:
- Implement linear transformations
- Calculate dot products of vectors
- Perform matrix operations in neural networks

**Tags:** array, matrix, multiplication, linear algebra

**Fields:**
- **a** (NPArray)
- **b** (NPArray)


## Max

Compute the maximum value along a specified axis of a array.

Use cases:
- Find peak values in time series data
- Implement max pooling in neural networks
- Determine highest scores across multiple categories

**Tags:** array, maximum, reduction, statistics

**Fields:**
- **array** (NPArray)
- **axis** (int | None)


## Mean

Compute the mean value along a specified axis of a array.

Use cases:
- Calculate average values in datasets
- Implement mean pooling in neural networks
- Compute centroids in clustering algorithms

**Tags:** array, average, reduction, statistics

**Fields:**
- **array** (NPArray)
- **axis** (int | None)


## Min

Calculate the minimum value along a specified axis of a array.

Use cases:
- Find lowest values in datasets
- Implement min pooling in neural networks
- Determine minimum thresholds across categories

**Tags:** array, minimum, reduction, statistics

**Fields:**
- **array** (NPArray)
- **axis** (int | None)


## Modulus

Calculates the element-wise remainder of division.

Use cases:
- Implementing cyclic behaviors
- Checking for even/odd numbers
- Limiting values to a specific range

**Tags:** math, modulo, remainder, mod, %

**Fields:**
- **a** (int | float | nodetool.metadata.types.NPArray)
- **b** (int | float | nodetool.metadata.types.NPArray)

### operation

**Args:**
- **a (ndarray)**
- **b (ndarray)**

**Returns:** ndarray


## Multiply

Multiplies two inputs.

**Tags:** math, product, times, *

**Fields:**
- **a** (int | float | nodetool.metadata.types.NPArray)
- **b** (int | float | nodetool.metadata.types.NPArray)

### operation

**Args:**
- **a (ndarray)**
- **b (ndarray)**

**Returns:** ndarray


## PlotArray

Create a plot visualization of array data.

Use cases:
- Visualize trends in array data
- Create charts for reports or dashboards
- Debug array outputs in workflows

**Tags:** array, plot, visualization, graph

**Fields:**
- **array** (NPArray)
- **plot_type** (PlotType)


## Power

Raises the base to the power of the exponent element-wise.

Use cases:
- Calculating compound interest
- Implementing polynomial functions
- Applying non-linear transformations to data

**Tags:** math, exponentiation, power, pow, **

**Fields:**
- **base** (float | int | nodetool.metadata.types.NPArray)
- **exponent** (float | int | nodetool.metadata.types.NPArray)


## Reshape1D

Reshape an array to a 1D shape without changing its data.

**Fields:**
- **array**: The input array to reshape (NPArray)
- **num_elements**: The number of elements (int)


## Reshape2D

Reshape an array to a new shape without changing its data.

Use cases:
- Convert between different dimensional representations
- Prepare data for specific model architectures
- Flatten or unflatten arrays

**Tags:** array, reshape, dimensions, structure

**Fields:**
- **array**: The input array to reshape (NPArray)
- **num_rows**: The number of rows (int)
- **num_cols**: The number of columns (int)


## Reshape3D

Reshape an array to a 3D shape without changing its data.

**Fields:**
- **array**: The input array to reshape (NPArray)
- **num_rows**: The number of rows (int)
- **num_cols**: The number of columns (int)
- **num_depths**: The number of depths (int)


## Reshape4D

Reshape an array to a 4D shape without changing its data.

**Fields:**
- **array**: The input array to reshape (NPArray)
- **num_rows**: The number of rows (int)
- **num_cols**: The number of columns (int)
- **num_depths**: The number of depths (int)
- **num_channels**: The number of channels (int)


## SaveArray

Save a numpy array to a file in the specified folder.

**Tags:** array, save, file, storage

**Fields:**
- **array**: The array to save. (NPArray)
- **folder**: The folder to save the array in. (FolderRef)
- **name**: 
        The name of the asset to save.
        You can use time and date variables to create unique names:
        %Y - Year
        %m - Month
        %d - Day
        %H - Hour
        %M - Minute
        %S - Second
         (str)

### required_inputs

**Args:**


## ScalarToArray

Convert a scalar value to a single-element array.

Use cases:
- Prepare scalar inputs for array operations
- Create constant arrays for computations
- Initialize array values in workflows

**Tags:** scalar, array, conversion, type

**Fields:**
- **value** (float | int)


## Sine

Computes the sine of input angles in radians.

Use cases:
- Calculating vertical components in physics
- Generating smooth periodic functions
- Audio signal processing

**Tags:** math, trigonometry, sine, sin

**Fields:**
- **angle_rad** (float | int | nodetool.metadata.types.NPArray)


## Slice

Extract a slice of an array along a specified axis.

Use cases:
- Extract specific time periods from time series data
- Select subset of features from datasets
- Create sliding windows over sequential data

**Tags:** array, slice, subset, index

**Fields:**
- **array**: The input array to slice (NPArray)
- **start**: Starting index (inclusive) (int)
- **stop**: Ending index (exclusive) (int)
- **step**: Step size between elements (int)
- **axis**: Axis along which to slice (int)


## Split

Split an array into multiple sub-arrays along a specified axis.

Use cases:
- Divide datasets into training/validation splits
- Create batches from large arrays
- Separate multi-channel data

**Tags:** array, split, divide, partition

**Fields:**
- **array**: The input array to split (NPArray)
- **num_splits**: Number of equal splits to create (int)
- **axis**: Axis along which to split (int)


## Sqrt

Calculates the square root of the input element-wise.

Use cases:
- Normalizing data
- Calculating distances in Euclidean space
- Finding intermediate values in binary search

**Tags:** math, square root, sqrt, √

**Fields:**
- **x** (int | float | nodetool.metadata.types.NPArray)


## Stack

Stack multiple arrays along a specified axis.

Use cases:
- Combine multiple 2D arrays into a 3D array
- Stack time series data from multiple sources
- Merge feature vectors for machine learning models

**Tags:** array, stack, concatenate, join, merge, axis

**Fields:**
- **arrays** (list[nodetool.metadata.types.NPArray])
- **axis**: The axis to stack along. (int)


## Subtract

Subtracts the second input from the first.

**Tags:** math, minus, difference, -

**Fields:**
- **a** (int | float | nodetool.metadata.types.NPArray)
- **b** (int | float | nodetool.metadata.types.NPArray)

### operation

**Args:**
- **a (ndarray)**
- **b (ndarray)**

**Returns:** ndarray


## Sum

Calculate the sum of values along a specified axis of a array.

Use cases:
- Compute total values across categories
- Implement sum pooling in neural networks
- Calculate cumulative metrics in time series data

**Tags:** array, summation, reduction, statistics

**Fields:**
- **array** (NPArray)
- **axis** (int | None)


## Transpose

Transpose the dimensions of the input array.

Use cases:
- Convert row vectors to column vectors
- Rearrange data for compatibility with other operations
- Implement certain linear algebra operations

**Tags:** array, transpose, reshape, dimensions

**Fields:**
- **array** (NPArray)


## arrayToScalar

Convert a single-element array to a scalar value.

Use cases:
- Extract final results from array computations
- Prepare values for non-array operations
- Simplify output for human-readable results

**Tags:** array, scalar, conversion, type

**Fields:**
- **array** (NPArray)


### convert_output

**Args:**
- **context (ProcessingContext)**
- **output (ndarray)**

**Returns:** float | int | nodetool.metadata.types.NPArray

### pad_arrays

If one of the arguments is a scalar, both arguments are returned as is.
Pads the smaller array with zeros so that both arrays are the same size.
This is useful for operations like addition and subtraction.
**Args:**
- **a (ndarray)**
- **b (ndarray)**

**Returns:** typing.Tuple[numpy.ndarray, numpy.ndarray]

