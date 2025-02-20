from pydantic import BaseModel, Field
import typing
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode


class Add(GraphNode):
    """
    Performs addition on two inputs.
    math, plus, add, addition, sum, +
    """

    a: int | float | GraphNode | tuple[GraphNode, str] = Field(default=0.0, description=None)
    b: int | float | GraphNode | tuple[GraphNode, str] = Field(default=0.0, description=None)

    @classmethod
    def get_node_type(cls): return "nodetool.math.Add"



class BinaryOperation(GraphNode):
    a: int | float | GraphNode | tuple[GraphNode, str] = Field(default=0.0, description=None)
    b: int | float | GraphNode | tuple[GraphNode, str] = Field(default=0.0, description=None)

    @classmethod
    def get_node_type(cls): return "nodetool.math.BinaryOperation"



class Cosine(GraphNode):
    """
    Computes the cosine of input angles in radians.
    math, trigonometry, cosine, cos

    Use cases:
    - Calculating horizontal components in physics
    - Creating circular motions
    - Phase calculations in signal processing
    """

    angle_rad: float | int | GraphNode | tuple[GraphNode, str] = Field(default=0.0, description=None)

    @classmethod
    def get_node_type(cls): return "nodetool.math.Cosine"



class Divide(GraphNode):
    """
    Divides the first input by the second.
    math, division, arithmetic, quotient, /
    """

    a: int | float | GraphNode | tuple[GraphNode, str] = Field(default=0.0, description=None)
    b: int | float | GraphNode | tuple[GraphNode, str] = Field(default=0.0, description=None)

    @classmethod
    def get_node_type(cls): return "nodetool.math.Divide"



class Modulus(GraphNode):
    """
    Calculates the element-wise remainder of division.
    math, modulo, remainder, mod, %

    Use cases:
    - Implementing cyclic behaviors
    - Checking for even/odd numbers
    - Limiting values to a specific range
    """

    a: int | float | GraphNode | tuple[GraphNode, str] = Field(default=0.0, description=None)
    b: int | float | GraphNode | tuple[GraphNode, str] = Field(default=0.0, description=None)

    @classmethod
    def get_node_type(cls): return "nodetool.math.Modulus"



class Multiply(GraphNode):
    """
    Multiplies two inputs.
    math, product, times, *
    """

    a: int | float | GraphNode | tuple[GraphNode, str] = Field(default=0.0, description=None)
    b: int | float | GraphNode | tuple[GraphNode, str] = Field(default=0.0, description=None)

    @classmethod
    def get_node_type(cls): return "nodetool.math.Multiply"



class Power(GraphNode):
    """
    Raises the base to the power of the exponent element-wise.
    math, exponentiation, power, pow, **

    Use cases:
    - Calculating compound interest
    - Implementing polynomial functions
    - Applying non-linear transformations to data
    """

    base: float | int | GraphNode | tuple[GraphNode, str] = Field(default=1.0, description=None)
    exponent: float | int | GraphNode | tuple[GraphNode, str] = Field(default=2.0, description=None)

    @classmethod
    def get_node_type(cls): return "nodetool.math.Power"



class Sine(GraphNode):
    """
    Computes the sine of input angles in radians.
    math, trigonometry, sine, sin

    Use cases:
    - Calculating vertical components in physics
    - Generating smooth periodic functions
    - Audio signal processing
    """

    angle_rad: float | int | GraphNode | tuple[GraphNode, str] = Field(default=0.0, description=None)

    @classmethod
    def get_node_type(cls): return "nodetool.math.Sine"



class Sqrt(GraphNode):
    """
    Calculates the square root of the input element-wise.
    math, square root, sqrt, √

    Use cases:
    - Normalizing data
    - Calculating distances in Euclidean space
    - Finding intermediate values in binary search
    """

    x: int | float | GraphNode | tuple[GraphNode, str] = Field(default=1.0, description=None)

    @classmethod
    def get_node_type(cls): return "nodetool.math.Sqrt"



class Subtract(GraphNode):
    """
    Subtracts the second input from the first.
    math, minus, difference, -
    """

    a: int | float | GraphNode | tuple[GraphNode, str] = Field(default=0.0, description=None)
    b: int | float | GraphNode | tuple[GraphNode, str] = Field(default=0.0, description=None)

    @classmethod
    def get_node_type(cls): return "nodetool.math.Subtract"


