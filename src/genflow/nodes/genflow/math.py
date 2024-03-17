import os
from typing import Literal, Tuple
import numpy as np
from pydantic import Field, validator
from genflow.workflows.processing_context import ProcessingContext
from genflow.workflows.genflow_node import GenflowNode
from genflow.metadata.types import to_numpy
from genflow.metadata.types import Tensor
from genflow.workflows.workflow_node import WorkflowNode


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


class BinaryOperationNode(GenflowNode):
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


class AddNode(BinaryOperationNode):
    """
    The Add Node performs a basic arithmetic operation, which is the addition of two inputs.
    """

    def operation(self, a: np.ndarray, b: np.ndarray) -> np.ndarray:
        return np.add(a, b)


class SubtractNode(BinaryOperationNode):
    """
    Subtract Node is a basic arithmetic node that performs subtraction operation.
    """

    def operation(self, a: np.ndarray, b: np.ndarray) -> np.ndarray:
        return np.subtract(a, b)


class MultiplyNode(BinaryOperationNode):
    """
    The Multiply Node is a node that performs a multiplication operation.
    """

    def operation(self, a: np.ndarray, b: np.ndarray) -> np.ndarray:
        return np.multiply(a, b)


class DivideNode(BinaryOperationNode):
    """
    The Divide Node is a mathematical node that performs division on two inputs.
    """

    def operation(self, a: np.ndarray, b: np.ndarray) -> np.ndarray:
        return np.divide(a, b)


class ModulusNode(BinaryOperationNode):
    """
    The Modulus Node is used to perform the modulus operation which returns the remainder of a division calculation.
    """

    def operation(self, a: np.ndarray, b: np.ndarray) -> np.ndarray:
        return np.mod(a, b)


class SineNode(GenflowNode):
    """
    The Sine Node is a mathematical function node that computes the sine of an input angle in radians.
    """

    angle_rad: float | int | Tensor = Field(title="Angle (Radians)", default=0.0)

    async def process(self, context: ProcessingContext) -> float | Tensor:
        res = np.sin(to_numpy(self.angle_rad))
        return await convert_output(context, res)


class CosineNode(GenflowNode):
    """
    The Cosine Node calculates the cosine of a given input angle, which is expected to be in radians.
    """

    base: float | int | Tensor = Field(title="Base", default=1.0)
    exponent: float | int | Tensor = Field(title="Exponent", default=2.0)

    async def process(self, context: ProcessingContext) -> float | int | Tensor:
        a = to_numpy(self.base)
        b = to_numpy(self.exponent)
        if isinstance(a, np.ndarray) and isinstance(b, np.ndarray):
            (a, b) = pad_arrays(a, b)
        return await convert_output(context, np.power(a, b))


class SqrtTensor(GenflowNode):
    """
    This node calculates the square root of the inputtensor.
    """

    x: int | float | Tensor = Field(title="Input", default=1.0)

    async def process(self, context: ProcessingContext) -> float | int | Tensor:
        return await convert_output(
            context, np.sqrt(to_numpy(self.x).astype(np.float32))
        )
