# nodetool.nodes.nodetool.math

## Add

Performs addition on two inputs.

**Fields:**
a: int | float | nodetool.metadata.types.Tensor
b: int | float | nodetool.metadata.types.Tensor

## BinaryOperation

**Fields:**
a: int | float | nodetool.metadata.types.Tensor
b: int | float | nodetool.metadata.types.Tensor

## Cosine

Computes the cosine of input angles in radians.

Use cases:
- Calculating horizontal components in physics
- Creating circular motions
- Phase calculations in signal processing

**Fields:**
angle_rad: float | int | nodetool.metadata.types.Tensor

## Divide

Divides the first input by the second.

**Fields:**
a: int | float | nodetool.metadata.types.Tensor
b: int | float | nodetool.metadata.types.Tensor

## Modulus

Calculates the element-wise remainder of division.

Use cases:
- Implementing cyclic behaviors
- Checking for even/odd numbers
- Limiting values to a specific range

**Fields:**
a: int | float | nodetool.metadata.types.Tensor
b: int | float | nodetool.metadata.types.Tensor

## Multiply

Multiplies two inputs.

**Fields:**
a: int | float | nodetool.metadata.types.Tensor
b: int | float | nodetool.metadata.types.Tensor

## Power

Raises the base to the power of the exponent element-wise.

Use cases:
- Calculating compound interest
- Implementing polynomial functions
- Applying non-linear transformations to data

**Fields:**
base: float | int | nodetool.metadata.types.Tensor
exponent: float | int | nodetool.metadata.types.Tensor

## Sine

Computes the sine of input angles in radians.

Use cases:
- Calculating vertical components in physics
- Generating smooth periodic functions
- Audio signal processing

**Fields:**
angle_rad: float | int | nodetool.metadata.types.Tensor

## Sqrt

Calculates the square root of the input element-wise.

Use cases:
- Normalizing data
- Calculating distances in Euclidean space
- Finding intermediate values in binary search

**Fields:**
x: int | float | nodetool.metadata.types.Tensor

## Subtract

Subtracts the second input from the first.

**Fields:**
a: int | float | nodetool.metadata.types.Tensor
b: int | float | nodetool.metadata.types.Tensor

### convert_output

**Args:**
- **context (ProcessingContext)**
- **output (ndarray)**

**Returns:** float | int | nodetool.metadata.types.Tensor

### pad_arrays

If one of the arguments is a scalar, both arguments are returned as is.
Pads the smaller array with zeros so that both arrays are the same size.
This is useful for operations like addition and subtraction.
**Args:**
- **a (ndarray)**
- **b (ndarray)**

**Returns:** typing.Tuple[numpy.ndarray, numpy.ndarray]

