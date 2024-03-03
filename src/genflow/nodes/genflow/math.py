from typing import Literal, Tuple
import numpy as np
from pydantic import Field, validator
from genflow.workflows.processing_context import ProcessingContext
from genflow.workflows.genflow_node import GenflowNode
from genflow.metadata.types import to_numpy
from genflow.metadata.types import Tensor


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
    ## Add Node
    ### Namespace: Core.Math

    #### Description
    The Add Node performs a basic arithmetic operation, which is the addition of two inputs.

    This node is a fundamental unit in creating more complex mathematical operations or calculations in the workflow. It takes in two numbers and returns their sum. Note that the order of inputs does not affect the result of the operation; i.e., the process is communitive.

    #### Applications
    - Adding numbers: It can be used to perform arithmetic addition operation in simple cases like counting or adding specific measurements.
    - Aggregating data: Useful in workflows where data needs to be aggregated or totals for certain parameters need to be calculated.

    #### Example
    For a workflow calculating total expenses, you could use Add Nodes to accumulate the costs of different items. If you have ten different costs, you could use nine Add Nodes to sum them all together in a hierarchical fashion.

    ##### Inputs
    - a: left value to be added.
    - b: right value to be added.

    ##### Outputs
    - Output: The sum of a and b
    """

    def operation(self, a: np.ndarray, b: np.ndarray) -> np.ndarray:
        return np.add(a, b)


class SubtractNode(BinaryOperationNode):
    """
    ## Subtract Node
    ### Namespace: Core.Math

    #### Description
    Subtract Node is a basic arithmetic node that performs subtraction operation.

    The purpose of this node is to subtract two numbers provided as inputs and produce the result. This node accepts two inputs and performs the subtraction operation (Input1 - Input2) and gives the resultant value as the output. A noteworthy feature is that the subtract node maintains the order of subtraction and makes sure always Input1 is subtracted by Input2.

    #### Applications
    - Subtracting values in a mathematical computation workflow.
    - Correcting a value by subtracting the error quantity.
    - Difference calculation in data analysis tasks.

    #### Example
    Suppose we have a workflow where we want to find the difference between two sensor readings. For this, we would connect the 'Sensor 1' node to the 'Input1' input of the 'Subtract Node'. We would do the same for 'Sensor 2' and 'Input2'. 'Output' would then have the difference of readings from Sensor 1 and Sensor 2.

    ##### Inputs
    - Input1 (Number): The number from which another number is to be subtracted.
    - Input2 (Number): The number to be subtracted from the first number.

    ##### Outputs
    - Output (Number): The result of the subtraction operation performed on Input1 and Input2.
    """

    def operation(self, a: np.ndarray, b: np.ndarray) -> np.ndarray:
        return np.subtract(a, b)


class MultiplyNode(BinaryOperationNode):
    """
    ## Multiply Node
    ### Namespace: Core.Math

    #### Description
    The Multiply Node is a node that performs a multiplication operation.

    This node takes two inputs and multiplies them, returning the product. It can be used to perform simple arithmetic operations in a workflow, multiplication in particular. The inputs can be any two numeric values that the user wishes to multiply.

    #### Applications
    - Performing arithmetic computations: The node can multiply two numbers within a workflow.
    - Data scaling: Used for multiplying a dataset by a certain factor.

    #### Example
    For instance, if you have a workflow where you're calculating the area of a rectangle, you can use the Multiply Node to multiply the length and width inputs. You simply connect the Length and Width nodes to the inputs of the Multiply Node, and it will output the calculated area.

    ##### Inputs
    - Input1: (Number) The first number to be multiplied.
    - Input2: (Number) The second number to be multiplied.

    ##### Outputs
    - Output: (Number) The product of the multiplication of Input1 and Input2.
    """

    def operation(self, a: np.ndarray, b: np.ndarray) -> np.ndarray:
        return np.multiply(a, b)


class DivideNode(BinaryOperationNode):
    """
    ## Divide Node
    ### Namespace: Core.Math

    #### Description
    The Divide Node is a mathematical node that performs division on two inputs.

    It serves the purpose of performing basic division operations within an AI workflow.
    This kind of node accepts two inputs: a dividend and a divisor, and performs the operation dividend divided by divisor, then outputs the result.

    #### Applications
    - Complex mathematical operation: The Divide Node can be used as a part of more complex mathematical operations where division is required.
    - Data normalization: The Divide Node can be used to normalize data by dividing each data point by the maximum value in the set.

    #### Example
    In a number factoring AI workflow, if the role of a node is to determine if a number 'N' is divisible by another number 'D', you can integrate a Divide node into the workflow to perform the division operation. The result could then be checked with an additional logic node to assert if there is any remainder.

    ##### Inputs
    - Dividend (Number): The number that will be divided.
    - Divisor (Number): The number by which the dividend will be divided by.

    ##### Outputs
    - Result (Number): Output of the division operation.
    """

    def operation(self, a: np.ndarray, b: np.ndarray) -> np.ndarray:
        return np.divide(a, b)


class ModulusNode(BinaryOperationNode):
    """
    ## Modulus Node
    ### Namespace: Core.Math

    #### Description
    The Modulus Node is used to perform the modulus operation which returns the remainder of a division calculation.

    This node is essential when you need to find the remainder from the division of two numbers in your workflow. Given two numbers "A" (dividend) and "B" (divisor), it calculates the remainder when "A" is divided by "B".

    #### Applications
    - Calculating the remainder can be useful in various scenarios like checking if a number is even or odd. An even number gives a remainder of 0 when divided by 2, while an odd number gives a remainder of 1.
    - It's also handy in cycle-based operations where you need to reset after reaching a certain number. For example, in time calculations: when seconds reach 60, we need to start again from zero.

    #### Example
    Suppose you have a workflow where you need to check if a certain count has crossed a limit, and if it does, it should reset. Here, the Modulus Node can be used to get the remainder when the count is divided by the limit. The remainder would be the value after resetting.

    ##### Inputs
    - A (Number): The dividend, which is the number that will be divided.
    - B (Number): The divisor, which is the number that 'A' will be divided by.

    ##### Outputs
    - Result (Number): The remainder returned from the division of 'A' by 'B'.
    """

    def operation(self, a: np.ndarray, b: np.ndarray) -> np.ndarray:
        return np.mod(a, b)


class SineNode(GenflowNode):
    """
    ## Sine Node
    ### Namespace: Core.Math

    #### Description
    The Sine Node is a mathematical function node that computes the sine of an input angle in radians.

    Primarily, the Sine Node takes an angle in radians as input and produces its sine. This is particularly useful in various scientific and engineering computations that entail trigonometric calculations.

    #### Applications
    - Workflow involving trigonometric calculations: This node is used when the workflow involved any sort of trigonometric calculations including physics simulation, engineering design, etc.

    #### Example
    Consider a workflow to calculate the trajectory of a projectile. The sine of the launch angle is a crucial parameter of such calculations. In such a case, we can integrate this Sine Node into the workflow, providing the launch angle in radians as input to the node, and effectively calculating the sine of this angle.

    ##### Inputs
    - angle: the input angle to compute its sine. The angle must be in radians.

    ##### Outputs
    - the sine of the input angle.
    """

    angle_rad: float | int | Tensor = Field(title="Angle (Radians)", default=0.0)

    async def process(self, context: ProcessingContext) -> float | Tensor:
        res = np.sin(to_numpy(self.angle_rad))
        return await convert_output(context, res)


class CosineNode(GenflowNode):
    """
    ## Cosine Node
    ### Namespace: Core.Math

    #### Description
    The Cosine Node calculates the cosine of a given input angle, which is expected to be in radians.

    This node could be useful in mathematical computations which involve the use of trigonometric functions, like solving geometry problems, analyzing periodic data or patterns and more.

    #### Applications
    - Solving trigonometric problems: This node can be used to solve problems involving cosines in trigonometry.
    - Analyzing waveforms: This could be used in interpreting and analyzing waveforms, or other periodic patterns.

    #### Example
    A workflow that requires the calculation of the cosine of an angle in radians could include this node. For instance, in a workflow calculating the coordinates of a point on a circle. The 'Cosine Node' would be connected to the input angles, and the result would be used with other nodes to compute the desired coordinates.

    ##### Inputs
    - Angle (Integer or Float): An input angle in radians.

    ##### Outputs
    - Cosine Value (Float): The computed cosine of the given input angle.
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
    ## Square Root Node
    ### Namespace: Core.Math

    #### Description
    This node calculates the square root of the inputtensor.

    #### Applications
    - Normalizing data in machine learning preprocessing: variables are transformed to ensure that they don't disproportionately impact a model due to differences in scale.
    - Statistical analysis: mathematical operations like taking the square root are often required for computations involving probability and statistical significance.

    ##### Inputs
    - `x`: The input that you'd like to find the square root of.

    ##### Outputs
    - `output`: the square root of the input value.
    """

    x: int | float | Tensor = Field(title="Input", default=1.0)

    async def process(self, context: ProcessingContext) -> float | int | Tensor:
        return await convert_output(
            context, np.sqrt(to_numpy(self.x).astype(np.float32))
        )
