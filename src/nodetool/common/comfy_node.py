from enum import Enum
from nodetool.metadata import is_assignable
from nodetool.metadata.types import ModelFile
from nodetool.workflows.base_node import BaseNode
from nodetool.workflows.processing_context import ProcessingContext
from pydantic import Field
import enum
from typing import Any

MAX_RESOLUTION = 8192


class ComfyNode(BaseNode):
    """
    A comfy node wraps around a comfy class and delegates processing to the actual
    implementation. The comfy class is looed up in the NODE_CLASS_MAPPINGS.

    Attributes:
        _comfy_class (str): The comfy class wrapped by this node.
        requires_capabilities (list[str]): List of capabilities required by this node.
    """

    _comfy_class: str = ""
    _requires_capabilities = ["comfy"]
    _visible = False

    def assign_property(self, name: str, value: Any):
        """
        Sets the value of a property.

        Args:
            name (str): The name of the property.
            value (Any): The value to be assigned to the property.

        Raises:
            ValueError: If the value is not assignable to the property.
        """
        prop = self.find_property(name)

        if not is_assignable(prop.type, value):
            raise ValueError(
                f"[{self.__class__.__name__}] Invalid value for property `{name}`: {value} (expected {prop.type})"
            )

        setattr(self, name, value)

    async def process(self, context: ProcessingContext):
        """
        Delegate the processing to the comfy class.
        Values will be converted for model files and enums.

        Args:
            context (ProcessingContext): The processing context.

        Returns:
            Any: The result of the processing.
        """
        from comfy.nodes import NODE_CLASS_MAPPINGS as mappings  # type: ignore

        name = self._comfy_class if self._comfy_class != "" else self.__class__.__name__

        if name in mappings:
            node_class = mappings[name]
            function_name = node_class.FUNCTION
            comfy_node = node_class()

            def convert_value(value: Any) -> Any:
                if isinstance(value, enum.Enum):
                    return value.value
                elif isinstance(value, ModelFile):
                    return value.name
                else:
                    return value

            kwargs = {
                name.replace("-", ""): convert_value(value)
                for name, value in self.node_properties().items()
            }
            return getattr(comfy_node, function_name)(**kwargs)

        else:
            raise ValueError(f"Node {name} not found in mappings")

    async def convert_output(self, context: ProcessingContext, value: Any):
        """
        Converts the output value.
        If the output is a tuple, it will be converted to a dictionary.

        Args:
            context (ProcessingContext): The processing context.
            value (Any): The value to be converted.

        Returns:
            Any: The converted output value.
        """
        if isinstance(value, tuple):
            return {o.name: v for o, v in zip(self.outputs(), value)}
        else:
            return value


class EnableDisable(str, Enum):
    ENABLE = "enable"
    DISABLE = "disable"


class DensePoseModel(str, Enum):
    DENSEPOSE_R50_FPN_DL = "densepose_r50_fpn_dl.torchscript"
    DENSEPOSE_R101_FPN_DL = "densepose_r101_fpn_dl.torchscript"
