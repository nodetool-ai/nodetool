from enum import Enum
from nodetool.metadata import is_assignable
from nodetool.metadata.types import CheckpointFile, ComfyData, ComfyModel, ImageRef, ModelFile, OutputSlot
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

    @classmethod
    def is_visible(cls) -> bool:
        return cls is not ComfyNode

    # def assign_property(self, name: str, value: Any):
    #     """
    #     Sets the value of a property.

    #     Args:
    #         name (str): The name of the property.
    #         value (Any): The value to be assigned to the property.

    #     Raises:
    #         ValueError: If the value is not assignable to the property.
    #     """
    #     prop = self.find_property(name)

    #     if not is_assignable(prop.type, value):
    #         raise ValueError(
    #             f"[{self.__class__.__name__}] Invalid value for property `{name}`: {value} (expected {prop.type})"
    #         )

    #     if prop.type.is_model_file_type():
    #         if isinstance(value, str):
    #             value = ModelFile(type=prop.type.type, name=value)
    #         if isinstance(value, dict):
    #             value = ModelFile(**value)
                
    #     if prop.type.is_comfy_model():
    #         if isinstance(value, str):
    #             value = ComfyModel(type=prop.type.type, name=value)
    #         if isinstance(value, dict):
    #             value = ComfyModel(**value)
                
    #     setattr(self, name, value)
        

    async def call_comfy_node(self, context: ProcessingContext):
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
                        raise ValueError(f"Expected model file for property {name}: {value}")
                    model = context.get_model(prop.type.type, value.name) # type: ignore
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

        else:
            raise ValueError(f"Node {name} not found in mappings")
        
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
        def convert_value(output: OutputSlot, v: Any) -> Any:
            if output.type.is_comfy_data_type():
                return output.type.get_python_type()(data=v)
            else:
                return v
                
        if isinstance(value, tuple):
            return {o.name: convert_value(o, v) for o, v in zip(self.outputs(), value)}
        else:
            return value


class EnableDisable(str, Enum):
    ENABLE = "enable"
    DISABLE = "disable"


class DensePoseModel(str, Enum):
    DENSEPOSE_R50_FPN_DL = "densepose_r50_fpn_dl.torchscript"
    DENSEPOSE_R101_FPN_DL = "densepose_r101_fpn_dl.torchscript"
