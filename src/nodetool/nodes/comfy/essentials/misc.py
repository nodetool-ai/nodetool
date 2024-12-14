from typing import Any
from nodetool.common.comfy_node import ComfyNode
from nodetool.metadata.types import UNet, Latent
from pydantic import Field


class SimpleMathFloat(ComfyNode):
    """
    Represent a floating-point number.
    float, number, value

    Use cases:
    - Input precise decimal values
    - Represent fractional numbers in calculations
    - Provide flexible numeric inputs
    """

    _comfy_class = "SimpleMathFloat+"
    value: float = Field(default=0.0, description="Floating-point value.")

    @classmethod
    def return_type(cls):
        return {"value": float}


class SimpleMathPercent(ComfyNode):
    """
    Represent a percentage value.
    percent, ratio, proportion

    Use cases:
    - Input percentage values for scaling operations
    - Represent probabilities or ratios
    - Control strength of effects or blending
    """

    _comfy_class = "SimpleMathPercent+"
    value: float = Field(default=0.0, ge=0, le=1, description="Percentage value (0-1).")

    @classmethod
    def return_type(cls):
        return {"value": float}


class SimpleMathInt(ComfyNode):
    """
    Represent an integer number.
    integer, number, value

    Use cases:
    - Input whole number values
    - Specify counts or indices
    - Provide discrete numeric inputs
    """

    _comfy_class = "SimpleMathInt+"
    value: int = Field(default=0, description="Integer value.")

    @classmethod
    def return_type(cls):
        return {"value": int}


class SimpleMathSlider(ComfyNode):
    """
    Provide a slider for float input.
    slider, float, range

    Use cases:
    - Intuitive input for ranged values
    - Fine-tune parameters visually
    - Provide bounded numeric inputs
    """

    _comfy_class = "SimpleMathSlider+"
    value: float = Field(default=0.5, ge=0.0, le=1.0, description="Slider value.")

    @classmethod
    def return_type(cls):
        return {"value": float}


class SimpleMathBoolean(ComfyNode):
    """
    Represent a boolean value.
    boolean, toggle, switch

    Use cases:
    - Provide on/off switches for features
    - Control conditional logic
    - Toggle between two states
    """

    _comfy_class = "SimpleMathBoolean+"
    value: bool = Field(default=False, description="Boolean value.")

    @classmethod
    def return_type(cls):
        return {"value": bool}


class SimpleMath(ComfyNode):
    """
    Perform custom mathematical operations.
    math, calculation, expression

    Use cases:
    - Evaluate complex mathematical expressions
    - Combine multiple numeric inputs
    - Implement custom numeric logic
    """

    _comfy_class = "SimpleMath+"
    a: int | float = Field(default=0.0, description="First optional value.")
    b: int | float = Field(default=0.0, description="Second optional value.")
    c: int | float = Field(default=0.0, description="Third optional value.")
    value: str = Field(default="", description="Mathematical expression to evaluate.")

    @classmethod
    def return_type(cls):
        return {"int_result": int, "float_result": float}


class SimpleMathCondition(ComfyNode):
    """
    Perform conditional mathematical operations.
    condition, math, branching

    Use cases:
    - Implement if-else logic with mathematical outcomes
    - Create dynamic value selection based on conditions
    - Combine conditional and mathematical operations
    """

    _comfy_class = "SimpleMathCondition+"
    a: Any = Field(default=0.0, description="First optional value.")
    b: Any = Field(default=0.0, description="Second optional value.")
    c: Any = Field(default=0.0, description="Third optional value.")
    evaluate: Any = Field(default=0, description="Condition to evaluate.")
    on_true: str = Field(
        default="", description="Expression to evaluate if condition is true."
    )
    on_false: str = Field(
        default="", description="Expression to evaluate if condition is false."
    )

    @classmethod
    def return_type(cls):
        return {"int_result": int, "float_result": float}


class SimpleCondition(ComfyNode):
    """
    Perform a simple conditional operation.
    condition, branching, logic

    Use cases:
    - Implement basic if-else logic
    - Route between two possible values based on a condition
    - Create dynamic workflows with branching
    """

    _comfy_class = "SimpleCondition+"
    evaluate: Any = Field(default=0, description="Condition to evaluate.")
    on_true: Any = Field(default=0, description="Value to return if condition is true.")
    on_false: Any = Field(
        default=0, description="Value to return if condition is false."
    )

    @classmethod
    def return_type(cls):
        return {"value": Any}


class SimpleComparison(ComfyNode):
    """
    Perform a comparison between two values.
    comparison, logic, equality

    Use cases:
    - Compare numeric or other values
    - Create boolean flags based on comparisons
    - Implement decision logic in workflows
    """

    _comfy_class = "SimpleComparison+"
    a: Any = Field(default=0, description="First value to compare.")
    b: Any = Field(default=0, description="Second value to compare.")
    comparison: str = Field(default="==", description="Comparison operator.")

    @classmethod
    def return_type(cls):
        return {"result": bool}


class ConsoleDebug(ComfyNode):
    """
    Output debug information to the console.
    debug, logging, console

    Use cases:
    - Print variable values for debugging
    - Log intermediate results in complex workflows
    - Verify data flow through nodes
    """

    _comfy_class = "ConsoleDebug+"
    value: Any = Field(description="Value to debug.")
    prefix: str = Field(default="Value:", description="Prefix for the debug output.")

    @classmethod
    def return_type(cls):
        return {}


class DebugTensorShape(ComfyNode):
    """
    Output the shape of a tensor for debugging.
    debug, tensor, shape

    Use cases:
    - Verify tensor dimensions in workflows
    - Debug shape mismatches in tensor operations
    - Inspect complex nested tensor structures
    """

    _comfy_class = "DebugTensorShape+"
    tensor: Any = Field(
        description="Tensor or structure containing tensors to inspect."
    )

    @classmethod
    def return_type(cls):
        return {}


class BatchCount(ComfyNode):
    """
    Count the number of items in a batch.
    batch, count, size

    Use cases:
    - Determine the size of batched data
    - Verify batch dimensions in workflows
    - Adapt processing based on batch size
    """

    _comfy_class = "BatchCount+"
    batch: Any = Field(description="Batch to count items from.")

    @classmethod
    def return_type(cls):
        return {"count": int}


class UNetCompile(ComfyNode):
    """
    Compile a PyTorch UNet for optimized execution.
    UNet, compilation, optimization

    Use cases:
    - Optimize UNet performance
    - Prepare UNets for specific execution environments
    - Fine-tune UNet compilation settings
    """

    _comfy_class = "UNetCompile+"
    unet: UNet = Field(description="UNet to compile.")
    fullgraph: bool = Field(default=False, description="Use full graph compilation.")
    dynamic: bool = Field(default=False, description="Use dynamic shape compilation.")
    mode: str = Field(default="default", description="Compilation mode.")

    @classmethod
    def return_type(cls):
        return {"UNet": UNet}


class RemoveLatentMask(ComfyNode):
    """
    Remove the noise mask from a latent sample.
    latent, mask, cleanup

    Use cases:
    - Clean up latent representations
    - Prepare latents for specific processing steps
    - Remove unwanted mask information
    """

    _comfy_class = "RemoveLatentMask+"
    samples: Latent = Field(description="Latent samples to process.")

    @classmethod
    def return_type(cls):
        return {"latent": Latent}


class SDXLEmptyLatentSizePicker(ComfyNode):
    """
    Create empty latents with specific sizes for SDXL.
    latent, size, SDXL

    Use cases:
    - Initialize latent spaces for SDXL UNets
    - Prepare custom-sized latents for generation
    - Set up batch processing with specific dimensions
    """

    _comfy_class = "SDXLEmptyLatentSizePicker+"
    resolution: str = Field(
        default="1024x1024 (1.0)", description="Predefined resolution option."
    )
    batch_size: int = Field(
        default=1, ge=1, le=4096, description="Number of latents in the batch."
    )
    width_override: int = Field(
        default=0, ge=0, le=8192, description="Custom width (if non-zero)."
    )
    height_override: int = Field(
        default=0, ge=0, le=8192, description="Custom height (if non-zero)."
    )

    @classmethod
    def return_type(cls):
        return {"latent": Latent, "width": int, "height": int}
