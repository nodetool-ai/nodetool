from enum import Enum
import enum
from typing import Any
from pydantic import Field
from nodetool.metadata import is_assignable

from nodetool.workflows.base_node import BaseNode
from nodetool.workflows.processing_context import ProcessingContext
from nodetool.metadata.types import ModelFile


MAX_RESOLUTION = 8192


class EnableDisable(str, Enum):
    ENABLE = "enable"
    DISABLE = "disable"


class DensePoseModel(str, Enum):
    DENSEPOSE_R50_FPN_DL = "densepose_r50_fpn_dl.torchscript"
    DENSEPOSE_R101_FPN_DL = "densepose_r101_fpn_dl.torchscript"


class ComfyNode(BaseNode):
    comfy_class: str = Field("", description="The comfy class wrapped by this node.")
    requires_capabilities: list[str] = ["comfy"]

    def assign_property(self, name: str, value: Any):
        """
        Sets the value of a property.
        """
        prop = self.find_property(name)

        if not is_assignable(prop.type, value):
            raise ValueError(
                f"[{self.__class__.__name__}] Invalid value for property `{name}`: {value} (expected {prop.type})"
            )

        setattr(self, name, value)

    async def process(self, context: ProcessingContext):
        from comfy.nodes import NODE_CLASS_MAPPINGS as mappings  # type: ignore

        name = self.comfy_class if self.comfy_class != "" else self.__class__.__name__

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
        if isinstance(value, tuple):
            return {o.name: v for o, v in zip(self.outputs(), value)}
        else:
            return value


ComfyNode.invisible()
