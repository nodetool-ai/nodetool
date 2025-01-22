import math
from pydantic import Field
from nodetool.workflows.processing_context import ProcessingContext
from nodetool.workflows.base_node import BaseNode


class BinaryOperation(BaseNode):
    _layout = "small"
    a: int | float = Field(title="A", default=0.0)
    b: int | float = Field(title="B", default=0.0)


class Add(BinaryOperation):
    """
    Performs addition on two inputs.
    math, plus, add, addition, sum, +
    """

    async def process(self, context: ProcessingContext) -> int | float:
        return self.a + self.b


class Subtract(BinaryOperation):
    """
    Subtracts the second input from the first.
    math, minus, difference, -
    """

    async def process(self, context: ProcessingContext) -> int | float:
        return self.a - self.b


class Multiply(BinaryOperation):
    """
    Multiplies two inputs.
    math, product, times, *
    """

    async def process(self, context: ProcessingContext) -> int | float:
        return self.a * self.b


class Divide(BinaryOperation):
    """
    Divides the first input by the second.
    math, division, arithmetic, quotient, /
    """

    async def process(self, context: ProcessingContext) -> int | float:
        return self.a / self.b


class Modulus(BinaryOperation):
    """
    Calculates the element-wise remainder of division.
    math, modulo, remainder, mod, %

    Use cases:
    - Implementing cyclic behaviors
    - Checking for even/odd numbers
    - Limiting values to a specific range
    """

    async def process(self, context: ProcessingContext) -> int | float:
        return self.a % self.b


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

    angle_rad: float | int = Field(title="Angle (Radians)", default=0.0)

    async def process(self, context: ProcessingContext) -> float:
        return math.sin(self.angle_rad)


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

    angle_rad: float | int = Field(title="Angle (Radians)", default=0.0)

    async def process(self, context: ProcessingContext) -> float:
        return math.cos(self.angle_rad)


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

    base: float | int = Field(title="Base", default=1.0)
    exponent: float | int = Field(title="Exponent", default=2.0)

    async def process(self, context: ProcessingContext) -> float | int:
        return math.pow(self.base, self.exponent)


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

    x: int | float = Field(title="Input", default=1.0)

    async def process(self, context: ProcessingContext) -> float | int:
        return math.sqrt(self.x)
