from enum import Enum
from nodetool.metadata import is_assignable
from nodetool.metadata.types import (
    CheckpointFile,
    ComfyData,
    ComfyModel,
    ImageRef,
    ModelFile,
    OutputSlot,
)
from nodetool.workflows.base_node import BaseNode
from nodetool.workflows.processing_context import ProcessingContext
from pydantic import Field
import enum
from typing import Any

MAX_RESOLUTION = 8192 * 2


def resolve_comfy_class(name: str) -> type | None:
    from comfy.nodes import NODE_CLASS_MAPPINGS as mappings  # type: ignore

    return mappings.get(name, None)


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

    @classmethod
    def is_visible(cls) -> bool:
        return cls is not ComfyNode

    async def call_comfy_node(self, context: ProcessingContext):
        """
        Delegate the processing to the comfy class.
        Values will be converted for model files and enums.

        Args:
            context (ProcessingContext): The processing context.

        Returns:
            Any: The result of the processing.
        """
        name = self._comfy_class if self._comfy_class != "" else self.__class__.__name__

        node_class = resolve_comfy_class(name)
        if node_class is None:
            raise ValueError(f"Comfy class not found: {name}")

        function_name = node_class.FUNCTION

        async def convert_value(name: str, value: Any) -> Any:
            prop = self.find_property(name)

            if isinstance(value, ModelFile):
                return value.name
            elif isinstance(value, ImageRef):
                tensor = await context.image_to_tensor(value)
                return tensor.unsqueeze(0)
            elif prop.type.is_comfy_data_type():
                if not isinstance(value, ComfyData):
                    raise ValueError(f"not a comfy data type: {value}")
                return value.data
            elif prop.type.is_comfy_model():
                if isinstance(value, dict):
                    raise ValueError(
                        f"Expected model file for property {name}: {value}"
                    )
                model = context.get_model(prop.type.type, value.name)  # type: ignore
                if model is None:
                    raise ValueError("Model not loaded: ", prop.type.type, value.name)
                return model
            else:
                return value

        kwargs = {
            name.replace("-", ""): await convert_value(name, value)
            for name, value in self.node_properties().items()
        }

        comfy_node = node_class()
        return getattr(comfy_node, function_name)(**kwargs)

    async def process(self, context: ProcessingContext):
        return await self.call_comfy_node(context)

    async def convert_output(self, context: ProcessingContext, value: Any):
        """
        Converts the output value.

        Comfy data types are wrapped with their respective classes.

        Args:
            context (ProcessingContext): The processing context.
            value (Any): The value to be converted.

        Returns:
            Any: The converted output value.
        """

        async def convert_value(output: OutputSlot, v: Any) -> Any:
            if output.type.type == "image":
                return await context.image_from_tensor(v)
            if output.type.is_comfy_data_type():
                return output.type.get_python_type()(data=v)
            else:
                return v

        if isinstance(value, tuple):
            return {
                o.name: await convert_value(o, v) for o, v in zip(self.outputs(), value)
            }
        else:
            return value


class EnableDisable(str, Enum):
    ENABLE = "enable"
    DISABLE = "disable"


class DensePoseModel(str, Enum):
    DENSEPOSE_R50_FPN_DL = "densepose_r50_fpn_dl.torchscript"
    DENSEPOSE_R101_FPN_DL = "densepose_r101_fpn_dl.torchscript"
