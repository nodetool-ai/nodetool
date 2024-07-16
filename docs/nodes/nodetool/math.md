# nodetool.nodes.nodetool.math

## Add

Performs addition on two inputs.

**Tags:** math, plus, add, addition, sum, +

- **a** (int | float | nodetool.metadata.types.Tensor)
- **b** (int | float | nodetool.metadata.types.Tensor)

### operation

**Args:**
- **a (ndarray)**
- **b (ndarray)**

**Returns:** ndarray

## BinaryOperation

- **a** (int | float | nodetool.metadata.types.Tensor)
- **b** (int | float | nodetool.metadata.types.Tensor)

### operation

**Args:**
- **a (ndarray)**
- **b (ndarray)**

**Returns:** ndarray

## Cosine

Computes the cosine of input angles in radians.

Use cases:
- Calculating horizontal components in physics
- Creating circular motions
- Phase calculations in signal processing

**Tags:** math, trigonometry, cosine, cos

- **angle_rad** (float | int | nodetool.metadata.types.Tensor)

## Divide

Divides the first input by the second.

**Tags:** math, division, arithmetic, quotient

- **a** (int | float | nodetool.metadata.types.Tensor)
- **b** (int | float | nodetool.metadata.types.Tensor)

### operation

**Args:**
- **a (ndarray)**
- **b (ndarray)**

**Returns:** ndarray

## Modulus

Calculates the element-wise remainder of division.

Use cases:
- Implementing cyclic behaviors
- Checking for even/odd numbers
- Limiting values to a specific range

**Tags:** math, modulo, remainder, mod, %

- **a** (int | float | nodetool.metadata.types.Tensor)
- **b** (int | float | nodetool.metadata.types.Tensor)

### operation

**Args:**
- **a (ndarray)**
- **b (ndarray)**

**Returns:** ndarray

## Multiply

Multiplies two inputs.

**Tags:** math, product, times, *

- **a** (int | float | nodetool.metadata.types.Tensor)
- **b** (int | float | nodetool.metadata.types.Tensor)

### operation

**Args:**
- **a (ndarray)**
- **b (ndarray)**

**Returns:** ndarray

## Power

Raises the base to the power of the exponent element-wise.

Use cases:
- Calculating compound interest
- Implementing polynomial functions
- Applying non-linear transformations to data

**Tags:** math, exponentiation, power, pow, **

- **base** (float | int | nodetool.metadata.types.Tensor)
- **exponent** (float | int | nodetool.metadata.types.Tensor)

## Sine

Computes the sine of input angles in radians.

Use cases:
- Calculating vertical components in physics
- Generating smooth periodic functions
- Audio signal processing

**Tags:** math, trigonometry, sine, sin

- **angle_rad** (float | int | nodetool.metadata.types.Tensor)

## Sqrt

Calculates the square root of the input element-wise.

Use cases:
- Normalizing data
- Calculating distances in Euclidean space
- Finding intermediate values in binary search

**Tags:** math, square root, sqrt, √

- **x** (int | float | nodetool.metadata.types.Tensor)

## Subtract

Subtracts the second input from the first.

**Tags:** math, minus, difference, -

- **a** (int | float | nodetool.metadata.types.Tensor)
- **b** (int | float | nodetool.metadata.types.Tensor)

### operation

**Args:**
- **a (ndarray)**
- **b (ndarray)**

**Returns:** ndarray

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

