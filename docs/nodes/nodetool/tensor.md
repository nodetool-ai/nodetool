# nodetool.nodes.nodetool.tensor

## Abs

Absolute value of a tensor.

**Inherits from:** BaseNode

- **input_tensor**: The input tensor to compute the absolute values from. (`Tensor`)

## ArgMax

Finds the indices of the maximum values along a specified axis of a tensor.

**Inherits from:** BaseNode

- **a** (`Tensor`)
- **axis** (`int | None`)

## ArgMin

Finds the indices of the minimum values along a specified axis of a tensor.

**Inherits from:** BaseNode

- **tensor** (`Tensor`)
- **axis** (`int | None`)

## Exp

Calculate the exponential of a tensor.

**Inherits from:** BaseNode

- **x** (`int | float | nodetool.metadata.types.Tensor`)

## ListToTensor

Converts a list to a tensor.

**Inherits from:** BaseNode

- **values** (`list[typing.Any]`)

## Log

Calculate the natural logarithm of a tensor.

**Inherits from:** BaseNode

- **x** (`int | float | nodetool.metadata.types.Tensor`)

## MatMul

Represents a node that performs matrix multiplication on two tensors.

**Inherits from:** BaseNode

- **a** (`Tensor`)
- **b** (`Tensor`)

## Max

Computes the maximum value along a specified axis of a tensor.

**Inherits from:** BaseNode

- **tensor** (`Tensor`)
- **axis** (`int | None`)

## Mean

Computes the mean of the input tensor.

**Inherits from:** BaseNode

- **tensor** (`Tensor`)
- **axis** (`int | None`)

## Min

Calculates the minimum value along a specified axis of a tensor.

**Inherits from:** BaseNode

- **tensor** (`Tensor`)
- **axis** (`int | None`)

## PlotTSNE

Plot tensor using t-SNE.

**Inherits from:** BaseNode

- **tensor** (`Tensor`)
- **color_indices** (`list[int]`)
- **perplexity** (`int`)

## PlotTensor

Plot tensor.

**Inherits from:** BaseNode

- **tensor** (`Tensor`)
- **plot_type** (`PlotType`)

## SaveTensor

**Inherits from:** BaseNode

- **value**: The tensor to save. (`Tensor`)
- **folder**: The folder to save the tensor in. (`FolderRef`)
- **name**: The name of the asset to save. (`str`)

## ScalarToTensor

Converts a scalar to a tensor.

**Inherits from:** BaseNode

- **value** (`float | int`)

## Stack

Stack tensors along a specified axis.

**Tags:** tensor, stack, concatenate, join, merge, axis

**Inherits from:** BaseNode

- **tensors** (`list[nodetool.metadata.types.Tensor]`)
- **axis**: The axis to stack along. (`int`)

## Sum

Calculates the sum of the input tensor.

**Inherits from:** BaseNode

- **tensor** (`Tensor`)
- **axis** (`int | None`)

## TensorToList

Converts tensor as a list.

**Inherits from:** BaseNode

- **tensor** (`Tensor`)

## TensorToScalar

Converts a tensor to a scalar.

**Inherits from:** BaseNode

- **tensor** (`Tensor`)

## Transpose

A class representing a node that performs transpose operation on a tensor.

**Inherits from:** BaseNode

- **tensor** (`Tensor`)

