from typing import Tuple
import numpy as np
from pydantic import Field
from nodetool.workflows.processing_context import ProcessingContext
from nodetool.workflows.base_node import BaseNode
from nodetool.metadata.types import to_numpy
from nodetool.metadata.types import Tensor


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
) -> float | int | Tensor:
    if output.size == 1:
        return output.item()
    else:
        return Tensor.from_numpy(output)


class BinaryOperation(BaseNode):
    _layout = "small"
    a: int | float | Tensor = Field(title="A", default=0.0)
    b: int | float | Tensor = Field(title="B", default=0.0)

    async def process(self, context: ProcessingContext) -> int | float | Tensor:
        a = to_numpy(self.a)
        b = to_numpy(self.b)
        if a.size > 1 and b.size > 1:
            (a, b) = pad_arrays(a, b)
        res = self.operation(a, b)
        return await convert_output(context, res)

    def operation(self, a: np.ndarray, b: np.ndarray) -> np.ndarray:
        raise NotImplementedError()


class Add(BinaryOperation):
    """
    Performs addition on two inputs.
    math, plus, add, addition, sum, +
    """

    def operation(self, a: np.ndarray, b: np.ndarray) -> np.ndarray:
        return np.add(a, b)


class Subtract(BinaryOperation):
    """
    Subtracts the second input from the first.
    math, minus, difference, -
    """

    def operation(self, a: np.ndarray, b: np.ndarray) -> np.ndarray:
        return np.subtract(a, b)


class Multiply(BinaryOperation):
    """
    Multiplies two inputs.
    math, product, times, *
    """

    def operation(self, a: np.ndarray, b: np.ndarray) -> np.ndarray:
        return np.multiply(a, b)


class Divide(BinaryOperation):
    """
    Divides the first input by the second.
    math, division, arithmetic, quotient
    """

    def operation(self, a: np.ndarray, b: np.ndarray) -> np.ndarray:
        return np.divide(a, b)


class Modulus(BinaryOperation):
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


class Sine(BaseNode):
    """
    Computes the sine of input angles in radians.
    math, trigonometry, sine, sin

    Use cases:
    - Calculating vertical components in physics
    - Generating smooth periodic functions
    - Audio signal processing
    """

    _layout = "small"

    angle_rad: float | int | Tensor = Field(title="Angle (Radians)", default=0.0)

    async def process(self, context: ProcessingContext) -> float | Tensor:
        res = np.sin(to_numpy(self.angle_rad))
        return await convert_output(context, res)


class Cosine(BaseNode):
    """
    Computes the cosine of input angles in radians.
    math, trigonometry, cosine, cos

    Use cases:
    - Calculating horizontal components in physics
    - Creating circular motions
    - Phase calculations in signal processing
    """

    _layout = "small"

    angle_rad: float | int | Tensor = Field(title="Angle (Radians)", default=0.0)

    async def process(self, context: ProcessingContext) -> float | Tensor:
        res = np.cos(to_numpy(self.angle_rad))
        return await convert_output(context, res)


class Power(BaseNode):
    """
    Raises the base to the power of the exponent element-wise.
    math, exponentiation, power, pow, **

    Use cases:
    - Calculating compound interest
    - Implementing polynomial functions
    - Applying non-linear transformations to data
    """

    _layout = "small"

    base: float | int | Tensor = Field(title="Base", default=1.0)
    exponent: float | int | Tensor = Field(title="Exponent", default=2.0)

    async def process(self, context: ProcessingContext) -> float | int | Tensor:
        a = to_numpy(self.base)
        b = to_numpy(self.exponent)
        if isinstance(a, np.ndarray) and isinstance(b, np.ndarray):
            (a, b) = pad_arrays(a, b)
        return await convert_output(context, np.power(a, b))


class Sqrt(BaseNode):
    """
    Calculates the square root of the input element-wise.
    math, square root, sqrt, √

    Use cases:
    - Normalizing data
    - Calculating distances in Euclidean space
    - Finding intermediate values in binary search
    """

    _layout = "small"

    x: int | float | Tensor = Field(title="Input", default=1.0)

    async def process(self, context: ProcessingContext) -> float | int | Tensor:
        return await convert_output(
            context, np.sqrt(to_numpy(self.x).astype(np.float32))
        )
