from enum import Enum
import random
from nodetool.metadata.types import (
    ComfyData,
    ComfyModel,
    ImageRef,
    ModelFile,
    OutputSlot,
)
from nodetool.workflows.base_node import BaseNode
from nodetool.workflows.processing_context import ProcessingContext
import enum
from typing import Any


MAX_RESOLUTION = 8192 * 2


def resolve_comfy_class(name: str) -> type | None:
    from nodes import NODE_CLASS_MAPPINGS as mappings  # type: ignore

    return mappings.get(name, None)


class ComfyNode(BaseNode):
    """
    A comfy node wraps around a comfy class and delegates processing to the actual
    implementation. The comfy class is looed up in the NODE_CLASS_MAPPINGS.

    Attributes:
        _comfy_class (str): The comfy class wrapped by this node.
    """

    _comfy_class: str = ""

    @classmethod
    def is_visible(cls) -> bool:
        return cls is not ComfyNode

    def get_comfy_class_name(self) -> str:
        return self._comfy_class if self._comfy_class != "" else self.__class__.__name__

    def required_inputs(self):
        from nodetool.workflows.read_graph import get_edge_names

        return get_edge_names(self.get_comfy_class_name())

    def requires_gpu(self) -> bool:
        for prop in self.properties():
            if prop.type.is_comfy_model():
                return True
        return False

    async def call_comfy_node(self, context: ProcessingContext):
        """
        Delegate the processing to the comfy class.
        Values will be converted for model files and enums.

        Args:
            context (ProcessingContext): The processing context.

        Returns:
            Any: The result of the processing.
        """
        name = self.get_comfy_class_name()

        node_class = resolve_comfy_class(name)
        if node_class is None:
            raise ValueError(f"Comfy class not found: {name}")

        function_name = node_class.FUNCTION

        async def convert_value(name: str, value: Any) -> Any:
            prop = self.find_property(name)

            if isinstance(value, ModelFile):
                return value.name
            elif isinstance(value, Enum):
                return value.value
            elif isinstance(value, ImageRef):
                tensor = await context.image_to_tensor(value)
                return tensor.unsqueeze(0)
            elif prop.type.is_comfy_data_type():
                assert isinstance(value, ComfyData), "Expected comfy data type"
                assert value.data is not None, f"Input {name} is not connected"
                return value.data
            elif prop.type.is_comfy_model():
                assert isinstance(value, ComfyModel), "Expected comfy model"
                assert value.model is not None, f"Input {name} is not connected"
                return value.model
            else:
                return value

        kwargs = {
            name.replace("-", ""): await convert_value(name, value)
            for name, value in self.node_properties().items()
        }
        if "seed_control_mode" in kwargs:
            del kwargs["seed_control_mode"]

        comfy_node = node_class()
        return getattr(comfy_node, function_name)(**kwargs)

    def properties_for_client(self):
        properties = self.node_properties()
        if "seed" in properties:
            return {
                "seed": properties["seed"],
            }
        if "noise_seed" in properties:
            return {
                "noise_seed": properties["noise_seed"],
            }
        return {}

    async def pre_process(self, context: ProcessingContext):
        from nodetool.nodes.comfy.sampling import SeedControlMode

        properties = self.node_properties()
        if "seed_control_mode" in properties:
            if "seed" in properties:
                seed_field = "seed"
            elif "noise_seed" in properties:
                seed_field = "noise_seed"
            else:
                return

            seed_control_mode = properties["seed_control_mode"]
            if seed_control_mode == SeedControlMode.RANDOMIZE:
                self.assign_property(seed_field, random.randint(0, 0xFFFFFFFFFFFFFFFF))
            elif seed_control_mode == SeedControlMode.INCREMENT:
                self.assign_property(seed_field, properties[seed_field] + 1)
            elif seed_control_mode == SeedControlMode.DECREMENT:
                self.assign_property(seed_field, properties[seed_field] - 1)

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
            output_type = output.type.get_python_type()

            if output.type.type == "image":
                if isinstance(v, ImageRef):
                    return v
                return await context.image_from_tensor(v)
            # TODO: Add support for other asset types
            elif output.type.is_comfy_data_type():
                if isinstance(v, ComfyData):
                    return v
                return output_type(data=v)
            elif output.type.is_comfy_model():
                if isinstance(v, ComfyModel):
                    return v
                return output_type(name=v)
            else:
                return v

        if isinstance(value, tuple):
            return {
                o.name: await convert_value(o, v) for o, v in zip(self.outputs(), value)
            }
        elif isinstance(value, dict) and "result" in value:
            return await self.convert_output(context, value["result"])
        else:
            return value


class EnableDisable(str, Enum):
    ENABLE = "enable"
    DISABLE = "disable"


class DensePoseModel(str, Enum):
    DENSEPOSE_R50_FPN_DL = "densepose_r50_fpn_dl.torchscript"
    DENSEPOSE_R101_FPN_DL = "densepose_r101_fpn_dl.torchscript"
