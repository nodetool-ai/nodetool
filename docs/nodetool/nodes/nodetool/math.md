# nodetool.nodes.nodetool.math

## Add

Performs addition on two inputs.

**Tags:** math, plus, add, addition, sum, +

**Inherits from:** BinaryOperation

- **a** (`int | float | nodetool.metadata.types.Tensor`)
- **b** (`int | float | nodetool.metadata.types.Tensor`)

#### `operation(self, a: numpy.ndarray, b: numpy.ndarray) -> numpy.ndarray`

**Parameters:**

- `a` (ndarray)
- `b` (ndarray)

**Returns:** `ndarray`

## BinaryOperation

**Inherits from:** BaseNode

- **a** (`int | float | nodetool.metadata.types.Tensor`)
- **b** (`int | float | nodetool.metadata.types.Tensor`)

#### `operation(self, a: numpy.ndarray, b: numpy.ndarray) -> numpy.ndarray`

**Parameters:**

- `a` (ndarray)
- `b` (ndarray)

**Returns:** `ndarray`

## Cosine

Computes the cosine of an input angle in radians.
Returns a float value between -1 and 1.

**Tags:** math, sine, radians, angle

**Inherits from:** BaseNode

- **angle_rad** (`float | int | nodetool.metadata.types.Tensor`)

## Divide

Divides the first input by the second.

**Tags:** math, division, arithmetic, quotient

**Inherits from:** BinaryOperation

- **a** (`int | float | nodetool.metadata.types.Tensor`)
- **b** (`int | float | nodetool.metadata.types.Tensor`)

#### `operation(self, a: numpy.ndarray, b: numpy.ndarray) -> numpy.ndarray`

**Parameters:**

- `a` (ndarray)
- `b` (ndarray)

**Returns:** `ndarray`

## Modulus

Calculates the remainder of division of the first input by the second.

**Tags:** math, mod, modulus, remainder, %, modulo, division

**Inherits from:** BinaryOperation

- **a** (`int | float | nodetool.metadata.types.Tensor`)
- **b** (`int | float | nodetool.metadata.types.Tensor`)

#### `operation(self, a: numpy.ndarray, b: numpy.ndarray) -> numpy.ndarray`

**Parameters:**

- `a` (ndarray)
- `b` (ndarray)

**Returns:** `ndarray`

## Multiply

Multiplies two inputs.

**Tags:** math, product, times, *

**Inherits from:** BinaryOperation

- **a** (`int | float | nodetool.metadata.types.Tensor`)
- **b** (`int | float | nodetool.metadata.types.Tensor`)

#### `operation(self, a: numpy.ndarray, b: numpy.ndarray) -> numpy.ndarray`

**Parameters:**

- `a` (ndarray)
- `b` (ndarray)

**Returns:** `ndarray`

## Power

Computes the power of the base to the exponent.
Returns a float value between -1 and 1.

**Tags:** math, power, exponent

**Inherits from:** BaseNode

- **base** (`float | int | nodetool.metadata.types.Tensor`)
- **exponent** (`float | int | nodetool.metadata.types.Tensor`)

## Sine

Computes the sine of an input angle in radians.
Returns a float value between -1 and 1.

**Tags:** math, sine, radians, angle

**Inherits from:** BaseNode

- **angle_rad** (`float | int | nodetool.metadata.types.Tensor`)

## SqrtTensor

Calculates the square root of the input.

**Tags:** math, power, sqrt, square, root

**Inherits from:** BaseNode

- **x** (`int | float | nodetool.metadata.types.Tensor`)

## Subtract

Subtracts the second input from the first.

**Tags:** math, minus, difference, -

**Inherits from:** BinaryOperation

- **a** (`int | float | nodetool.metadata.types.Tensor`)
- **b** (`int | float | nodetool.metadata.types.Tensor`)

#### `operation(self, a: numpy.ndarray, b: numpy.ndarray) -> numpy.ndarray`

**Parameters:**

- `a` (ndarray)
- `b` (ndarray)

**Returns:** `ndarray`

## Function: `convert_output(context: nodetool.workflows.processing_context.ProcessingContext, output: numpy.ndarray) -> float | int | nodetool.metadata.types.Tensor`

**Parameters:**

- `context` (ProcessingContext)
- `output` (ndarray)

**Returns:** `float | int | nodetool.metadata.types.Tensor`

## Function: `pad_arrays(a: numpy.ndarray, b: numpy.ndarray) -> Tuple[numpy.ndarray, numpy.ndarray]`

If one of the arguments is a scalar, both arguments are returned as is.
    Pads the smaller array with zeros so that both arrays are the same size.
    This is useful for operations like addition and subtraction.

**Parameters:**

- `a` (ndarray)
- `b` (ndarray)

**Returns:** `typing.Tuple[numpy.ndarray, numpy.ndarray]`

