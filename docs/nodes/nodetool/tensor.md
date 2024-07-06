# nodetool.nodes.nodetool.tensor

## Abs

Compute the absolute value of each element in a tensor.

Use cases:
- Calculate magnitudes of complex numbers
- Preprocess data for certain algorithms
- Implement activation functions in neural networks

**Tags:** tensor, absolute, magnitude

- **input_tensor**: The input tensor to compute the absolute values from. (`Tensor`)

## ArgMax

Find indices of maximum values along a specified axis of a tensor.

Use cases:
- Determine winning classes in classification tasks
- Find peaks in signal processing
- Locate best-performing items in datasets

**Tags:** tensor, argmax, index, maximum

- **a** (`Tensor`)
- **axis** (`int | None`)

## ArgMin

Find indices of minimum values along a specified axis of a tensor.

Use cases:
- Locate lowest-performing items in datasets
- Find troughs in signal processing
- Determine least likely classes in classification tasks

**Tags:** tensor, argmin, index, minimum

- **tensor** (`Tensor`)
- **axis** (`int | None`)

## Exp

Calculate the exponential of each element in a tensor.

Use cases:
- Implement exponential activation functions
- Calculate growth rates in scientific models
- Transform data for certain statistical analyses

**Tags:** tensor, exponential, math, activation

- **x** (`int | float | nodetool.metadata.types.Tensor`)

## ListToTensor

Convert a list of values to a tensor.

Use cases:
- Prepare list data for tensor operations
- Create tensors from Python data structures
- Convert sequence data to tensor format

**Tags:** list, tensor, conversion, type

- **values** (`list[typing.Any]`)

## Log

Calculate the natural logarithm of each element in a tensor.

Use cases:
- Implement log transformations on data
- Calculate entropy in information theory
- Normalize data with large ranges

**Tags:** tensor, logarithm, math, transformation

- **x** (`int | float | nodetool.metadata.types.Tensor`)

## MatMul

Perform matrix multiplication on two input tensors.

Use cases:
- Implement linear transformations
- Calculate dot products of vectors
- Perform matrix operations in neural networks

**Tags:** tensor, matrix, multiplication, linear algebra

- **a** (`Tensor`)
- **b** (`Tensor`)

## Max

Compute the maximum value along a specified axis of a tensor.

Use cases:
- Find peak values in time series data
- Implement max pooling in neural networks
- Determine highest scores across multiple categories

**Tags:** tensor, maximum, reduction, statistics

- **tensor** (`Tensor`)
- **axis** (`int | None`)

## Mean

Compute the mean value along a specified axis of a tensor.

Use cases:
- Calculate average values in datasets
- Implement mean pooling in neural networks
- Compute centroids in clustering algorithms

**Tags:** tensor, average, reduction, statistics

- **tensor** (`Tensor`)
- **axis** (`int | None`)

## Min

Calculate the minimum value along a specified axis of a tensor.

Use cases:
- Find lowest values in datasets
- Implement min pooling in neural networks
- Determine minimum thresholds across categories

**Tags:** tensor, minimum, reduction, statistics

- **tensor** (`Tensor`)
- **axis** (`int | None`)

## PlotTSNE

Create a t-SNE plot for high-dimensional tensor data.

Use cases:
- Visualize clusters in high-dimensional data
- Explore relationships in complex datasets
- Reduce dimensionality for data analysis

**Tags:** tensor, tsne, visualization, dimensionality reduction

- **tensor** (`Tensor`)
- **color_indices** (`list[int]`)
- **perplexity** (`int`)

## PlotTensor

Create a plot visualization of tensor data.

Use cases:
- Visualize trends in tensor data
- Create charts for reports or dashboards
- Debug tensor outputs in workflows

**Tags:** tensor, plot, visualization, graph

- **tensor** (`Tensor`)
- **plot_type** (`PlotType`)

## SaveTensor

Save a tensor to a file in the specified folder.

Use cases:
- Persist tensor data for later use
- Export tensor results from a workflow
- Save intermediate tensor outputs for debugging

**Tags:** tensor, save, file, storage

- **value**: The tensor to save. (`Tensor`)
- **folder**: The folder to save the tensor in. (`FolderRef`)
- **name**: The name of the asset to save. (`str`)

## ScalarToTensor

Convert a scalar value to a single-element tensor.

Use cases:
- Prepare scalar inputs for tensor operations
- Create constant tensors for computations
- Initialize tensor values in workflows

**Tags:** scalar, tensor, conversion, type

- **value** (`float | int`)

## Stack

Stack multiple tensors along a specified axis.

Use cases:
- Combine multiple 2D tensors into a 3D tensor
- Stack time series data from multiple sources
- Merge feature vectors for machine learning models

**Tags:** tensor, stack, concatenate, join, merge, axis

- **tensors** (`list[nodetool.metadata.types.Tensor]`)
- **axis**: The axis to stack along. (`int`)

## Sum

Calculate the sum of values along a specified axis of a tensor.

Use cases:
- Compute total values across categories
- Implement sum pooling in neural networks
- Calculate cumulative metrics in time series data

**Tags:** tensor, summation, reduction, statistics

- **tensor** (`Tensor`)
- **axis** (`int | None`)

## TensorToList

Convert a tensor to a nested list structure.

Use cases:
- Prepare tensor data for JSON serialization
- Convert tensor outputs to Python data structures
- Interface tensor data with non-tensor operations

**Tags:** tensor, list, conversion, type

- **tensor** (`Tensor`)

## TensorToScalar

Convert a single-element tensor to a scalar value.

Use cases:
- Extract final results from tensor computations
- Prepare values for non-tensor operations
- Simplify output for human-readable results

**Tags:** tensor, scalar, conversion, type

- **tensor** (`Tensor`)

## Transpose

Transpose the dimensions of the input tensor.

Use cases:
- Convert row vectors to column vectors
- Rearrange data for compatibility with other operations
- Implement certain linear algebra operations

**Tags:** tensor, transpose, reshape, dimensions

- **tensor** (`Tensor`)
